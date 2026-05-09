/**
 * Adapter registry — resolves a provider+model pair to a ModelAdapter instance.
 */
import { OpenAIAdapter } from './openai.js';
import { OllamaAdapter } from './ollama.js';
import type { ModelAdapter } from './base.js';

export { OpenAIAdapter, OllamaAdapter };
export type { ModelAdapter, Message, ChatOptions, ChatResponse, ToolDefinition } from './base.js';

/**
 * Resolve and instantiate an adapter.
 *
 * Provider resolution order:
 *  1. Explicit `provider` from the FROM directive (e.g. `FROM openai/gpt-4o`)
 *  2. Heuristic based on model name if provider is null
 *
 * Heuristics (provider = null / "auto"):
 *   gpt-*, o1-*, o3-*, o4-*  → openai
 *   everything else           → ollama (local)
 */
export function resolveAdapter(
  model: string,
  provider: string | null,
  options?: Record<string, string>,
): ModelAdapter {
  const resolved = provider ?? inferProvider(model);

  switch (resolved) {
    case 'openai':
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['OPENAI_API_KEY'],
        baseURL: options?.['baseURL'],
      });

    case 'ollama':
      return new OllamaAdapter(model, {
        baseURL: options?.['baseURL'] ?? process.env['OLLAMA_HOST'],
      });

    default:
      throw new Error(
        `Unknown provider: "${resolved}". Supported providers: openai, ollama`,
      );
  }
}

function inferProvider(model: string): string {
  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1-') ||
    model.startsWith('o3-') ||
    model.startsWith('o4-') ||
    model === 'gpt-4o' ||
    model === 'gpt-4' ||
    model === 'gpt-3.5-turbo'
  ) {
    return 'openai';
  }
  return 'ollama';
}
