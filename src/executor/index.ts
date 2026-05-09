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
 *   8. Execute each GENERATE step (image / audio / video generation)
 *   9. Persist outputs to memory
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import type { PromptfileAST, ImageDirective, AudioDirective, VideoDirective } from '../parser/types.js';
import { resolveAdapter, resolveGenerationAdapter } from '../adapters/index.js';
import type { Message, MessageContentPart } from '../adapters/base.js';
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

export interface GenerateOutput {
  /** The GENERATE modality. */
  modality: 'image' | 'audio' | 'video';
  /** The generation prompt (after variable interpolation). */
  prompt: string;
  /** URL to the generated asset (if returned by provider). */
  url?: string;
  /** Path where the asset was saved locally (if --output was specified). */
  savedPath?: string;
  /** MIME type of the generated asset. */
  mimeType: string;
}

export interface ExecutionResult {
  model: string;
  provider: string;
  outputs: StepOutput[];
  generates: GenerateOutput[];
  totalTokens: number;
}

export interface ExecutionOptions {
  /** Working directory for resolving CONTEXT/IMAGE/AUDIO/VIDEO paths. Defaults to process.cwd(). */
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
  /** Called before each GENERATE step starts. */
  onGenerateStart?: (modality: string, prompt: string, index: number, total: number) => void;
  /** Called after each GENERATE step completes. */
  onGenerateEnd?: (output: GenerateOutput, index: number, total: number) => void;
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

/**
 * Load an IMAGE directive and return an ImageContentPart.
 * Local file paths are read and base64-encoded as data URIs.
 */
function buildImagePart(directive: ImageDirective, cwd: string): MessageContentPart {
  const src = directive.src;

  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return {
      type: 'image_url',
      image_url: { url: src, detail: directive.detail },
    };
  }

  // Local file — encode as data URI
  const absPath = resolve(cwd, src);
  if (!existsSync(absPath)) {
    throw new Error(`IMAGE: file not found: ${absPath}`);
  }
  const data = readFileSync(absPath);
  const ext = extname(absPath).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  const mime = mimeMap[ext] ?? 'image/jpeg';
  const dataUri = `data:${mime};base64,${data.toString('base64')}`;
  return {
    type: 'image_url',
    image_url: { url: dataUri, detail: directive.detail },
  };
}

/**
 * Load an AUDIO directive and return an AudioContentPart.
 * Local file paths are read and base64-encoded.
 */
function buildAudioPart(directive: AudioDirective, cwd: string): MessageContentPart {
  const src = directive.src;

  if (src.startsWith('http://') || src.startsWith('https://')) {
    // For remote audio, return a text reference (most APIs don't accept remote audio URLs)
    return { type: 'text', text: `[audio: ${src}]` };
  }

  const absPath = resolve(cwd, src);
  if (!existsSync(absPath)) {
    throw new Error(`AUDIO: file not found: ${absPath}`);
  }
  const data = readFileSync(absPath);
  return {
    type: 'input_audio',
    input_audio: {
      data: data.toString('base64'),
      format: directive.format,
    },
  };
}

/**
 * Build a VIDEO content part (URL reference — most providers accept hosted URLs).
 */
function buildVideoPart(directive: VideoDirective, _cwd: string): MessageContentPart {
  return { type: 'video_url', video_url: { url: directive.src } };
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

  // 1. Determine if this is a generation-only workflow
  const hasRuns = ast.runs.length > 0;
  const hasGenerates = ast.generates.length > 0;

  // 2. Model adapter (for RUN steps)
  const adapter = hasRuns || !hasGenerates
    ? resolveAdapter(ast.from.model, ast.from.provider, ast.from.options)
    : null;

  // 3. Model parameters from SET directives
  const modelOptions = buildModelOptions(ast);

  // 4. File context
  const contextContent = await buildContext(ast.contexts, cwd);

  // 5. Memory
  let memory: Memory | null = null;
  if (ast.memory) {
    if (ast.memory.backend === 'local') {
      memory = new LocalMemory(ast.memory.name ?? 'default');
    } else {
      throw new Error(`Unsupported memory backend: "${ast.memory.backend}". Supported: local`);
    }
  }

  // 6. Tools
  const tools: Tool[] = ast.tools.map((t) => resolveTool(t));

  // 7. Build initial message history
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

  // 8. Attach multimodal inputs (IMAGE / AUDIO / VIDEO) to a user message
  //    They are appended as content parts before the first RUN step.
  if (ast.images.length > 0 || ast.audios.length > 0 || ast.videos.length > 0) {
    const parts: MessageContentPart[] = [];

    for (const img of ast.images) {
      parts.push(buildImagePart(img, cwd));
    }
    for (const aud of ast.audios) {
      parts.push(buildAudioPart(aud, cwd));
    }
    for (const vid of ast.videos) {
      parts.push(buildVideoPart(vid, cwd));
    }

    // If there's already a USER text message, merge the parts into it
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const textContent: MessageContentPart =
        typeof lastMsg.content === 'string'
          ? { type: 'text', text: lastMsg.content }
          : { type: 'text', text: '' };
      lastMsg.content = [textContent, ...parts];
    } else {
      messages.push({ role: 'user', content: parts });
    }
  }

  // 9. Execute RUN steps
  const outputs: StepOutput[] = [];
  const total = ast.runs.length;

  if (adapter) {
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
  }

  // 10. Execute GENERATE steps
  const generates: GenerateOutput[] = [];
  const totalGenerates = ast.generates.length;

  for (let idx = 0; idx < ast.generates.length; idx++) {
    const gen = ast.generates[idx];
    const prompt = interpolate(gen.prompt, args);

    options.onGenerateStart?.(gen.modality, prompt, idx, totalGenerates);

    const genAdapter = resolveGenerationAdapter(
      ast.from.model,
      ast.from.provider,
      gen.modality,
      ast.from.options,
    );

    const result = await genAdapter.generate({ prompt, options: gen.options });

    let savedPath: string | undefined;

    // Determine output path: GENERATE --output takes precedence, then EXPORT
    const rawOutput = gen.output
      ? interpolate(gen.output, args)
      : null;

    if (rawOutput) {
      savedPath = resolve(cwd, rawOutput);
      mkdirSync(dirname(savedPath), { recursive: true });
      if (result.data) {
        writeFileSync(savedPath, result.data);
      } else if (result.url) {
        // Download the asset
        const res = await fetch(result.url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(savedPath, buf);
        }
      }
    }

    const genOutput: GenerateOutput = {
      modality: gen.modality,
      prompt,
      url: result.url,
      savedPath,
      mimeType: result.mimeType,
    };

    generates.push(genOutput);
    options.onGenerateEnd?.(genOutput, idx, totalGenerates);
  }

  const totalTokens = outputs.reduce((sum, o) => sum + o.tokens.total, 0);

  return {
    model: ast.from.model,
    provider: adapter?.provider ?? ast.from.provider ?? ast.from.model,
    outputs,
    generates,
    totalTokens,
  };
}
