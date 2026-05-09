/**
 * Workflow executor — the core runtime engine.
 *
 * Reads a PromptfileAST and drives the full execution pipeline:
 *   1. Resolve ARGs
 *   2. Instantiate the model adapter
 *   3. Build filesystem context
 *   4. Initialize memory
 *   5. Register tools
 *   6. Assemble the initial message history
 *   7. Execute each RUN step (with optional streaming)
 *   8. Persist outputs to memory
 */
import { resolve } from 'node:path';
import type { PromptfileAST } from '../parser/types.js';
import { resolveAdapter } from '../adapters/index.js';
import type { Message } from '../adapters/base.js';
import { buildContext } from './context.js';
import { LocalMemory } from '../memory/local.js';
import type { Memory } from '../memory/index.js';
import { resolveTool } from '../tools/index.js';
import type { Tool } from '../tools/base.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StepOutput {
  /** The RUN instruction text (after variable interpolation). */
  instruction: string;
  /** The model response text. */
  response: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface ExecutionResult {
  model: string;
  provider: string;
  outputs: StepOutput[];
  totalTokens: number;
}

export interface ExecutionOptions {
  /** Working directory for resolving CONTEXT paths. Defaults to process.cwd(). */
  cwd?: string;
  /** Runtime values for ARG directives. */
  args?: Record<string, string>;
  /**
   * Whether to use streaming for model responses.
   * When true, `onChunk` is called for each text chunk.
   * Defaults to true when onChunk is provided.
   */
  stream?: boolean;
  /** Called for each streamed chunk. */
  onChunk?: (chunk: string) => void;
  /** Called before each RUN step starts. */
  onStepStart?: (instruction: string, index: number, total: number) => void;
  /** Called after each RUN step completes. */
  onStepEnd?: (output: StepOutput, index: number, total: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveArgs(
  ast: PromptfileAST,
  provided: Record<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const arg of ast.args) {
    const value = provided[arg.name] ?? arg.defaultValue;
    if (value === null) {
      throw new Error(
        `Missing required ARG: "${arg.name}". Pass it with --arg ${arg.name}=<value>`,
      );
    }
    resolved[arg.name] = value;
  }
  return { ...resolved, ...provided };
}

/** Replace ${VAR} and $VAR placeholders with values from vars or process.env. */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\$\{(\w+)\}/g, (_, key: string) => vars[key] ?? process.env[key] ?? `\${${key}}`)
    .replace(/\$(\w+)/g, (_, key: string) => vars[key] ?? process.env[key] ?? `$${key}`);
}

function buildModelOptions(ast: PromptfileAST): {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
} {
  const opts: Record<string, number> = {};
  for (const s of ast.sets) {
    opts[s.key] = parseFloat(s.value);
  }
  return {
    temperature: isNaN(opts['temperature'] ?? NaN) ? undefined : opts['temperature'],
    maxTokens:
      isNaN(opts['max_tokens'] ?? opts['maxTokens'] ?? NaN)
        ? undefined
        : (opts['max_tokens'] ?? opts['maxTokens']),
    topP: isNaN(opts['top_p'] ?? opts['topP'] ?? NaN)
      ? undefined
      : (opts['top_p'] ?? opts['topP']),
  };
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

export async function execute(
  ast: PromptfileAST,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const args = resolveArgs(ast, options.args ?? {});
  const useStream = options.stream !== false && Boolean(options.onChunk);

  // 1. Model adapter
  const adapter = resolveAdapter(ast.from.model, ast.from.provider, ast.from.options);

  // 2. Model parameters from SET directives
  const modelOptions = buildModelOptions(ast);

  // 3. File context
  const contextContent = await buildContext(ast.contexts, cwd);

  // 4. Memory
  let memory: Memory | null = null;
  if (ast.memory) {
    if (ast.memory.backend === 'local') {
      memory = new LocalMemory(ast.memory.name ?? 'default');
    } else {
      throw new Error(`Unsupported memory backend: "${ast.memory.backend}". Supported: local`);
    }
  }

  // 5. Tools
  const tools: Tool[] = ast.tools.map((t) => resolveTool(t));

  // 6. Build initial message history
  const messages: Message[] = [];

  let systemContent = ast.system ? interpolate(ast.system.text, args) : '';

  if (contextContent) {
    const contextBlock = `\n\n<context>\n${contextContent}\n</context>`;
    systemContent = systemContent ? systemContent + contextBlock : contextBlock.trim();
  }

  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }

  if (ast.user) {
    messages.push({ role: 'user', content: interpolate(ast.user.text, args) });
  }

  // 7. Execute RUN steps
  const outputs: StepOutput[] = [];
  const total = ast.runs.length;

  for (let idx = 0; idx < ast.runs.length; idx++) {
    const run = ast.runs[idx];
    const instruction = interpolate(run.instruction, args);

    options.onStepStart?.(instruction, idx, total);

    messages.push({ role: 'user', content: instruction });

    let response: string;
    let promptTokens = 0;
    let completionTokens = 0;

    const chatOptions = {
      ...modelOptions,
      tools: tools.length > 0 ? tools.map((t) => t.toDefinition()) : undefined,
    };

    if (useStream && options.onChunk) {
      const chunks: string[] = [];
      for await (const chunk of adapter.stream(messages, chatOptions)) {
        chunks.push(chunk);
        options.onChunk(chunk);
      }
      response = chunks.join('');
    } else {
      const result = await adapter.chat(messages, chatOptions);
      response = result.content;
      promptTokens = result.usage.promptTokens;
      completionTokens = result.usage.completionTokens;
    }

    messages.push({ role: 'assistant', content: response });

    const output: StepOutput = {
      instruction,
      response,
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
    };

    outputs.push(output);
    options.onStepEnd?.(output, idx, total);

    if (memory) {
      await memory.add({ instruction, response });
    }
  }

  const totalTokens = outputs.reduce((sum, o) => sum + o.tokens.total, 0);

  return {
    model: ast.from.model,
    provider: adapter.provider,
    outputs,
    totalTokens,
  };
}
