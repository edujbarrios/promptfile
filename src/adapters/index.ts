/**
 * Adapter registry — resolves a provider+model pair to a ModelAdapter or
 * GenerationAdapter instance.
 *
 * Chat / VLM providers:
 *   openai     — GPT-4o, GPT-4, o1, o3 … (also supports vision)
 *   ollama     — any local model via Ollama
 *   anthropic  — Claude 3 / 3.5 (also supports vision)
 *   mistral    — Mistral AI (compatible with OpenAI Chat API)
 *   groq       — Groq (OpenAI-compatible, ultra-fast inference)
 *   gemini     — Google Gemini (via OpenAI-compatible endpoint)
 *
 * Generation providers (image / audio / video):
 *   openai/dall-e-3, openai/dall-e-2   → image generation
 *   openai/tts-1, openai/tts-1-hd      → audio (text-to-speech)
 *   replicate/<owner>/<model>           → any Replicate-hosted model
 *   fal/<model-id>                      → fal.ai image/video generation
 *   elevenlabs/<voice-id>               → ElevenLabs TTS
 *   suno/<model>                        → Suno music generation
 *   runway/<model>                      → Runway video generation
 */
import { OpenAIAdapter, OpenAIImageAdapter, OpenAITTSAdapter } from './openai.js';
import { OllamaAdapter } from './ollama.js';
import { AnthropicAdapter } from './anthropic.js';
import { ReplicateAdapter } from './replicate.js';
import type { ModelAdapter, GenerationAdapter, GenerationModality } from './base.js';

export { OpenAIAdapter, OpenAIImageAdapter, OpenAITTSAdapter, OllamaAdapter, AnthropicAdapter, ReplicateAdapter };
export type {
  ModelAdapter,
  GenerationAdapter,
  GenerationModality,
  Message,
  MessageContentPart,
  ChatOptions,
  ChatResponse,
  ToolDefinition,
} from './base.js';

// ---------------------------------------------------------------------------
// OpenAI image-generation model names
// ---------------------------------------------------------------------------

const OPENAI_IMAGE_MODELS = new Set(['dall-e-3', 'dall-e-2']);
const OPENAI_TTS_MODELS = new Set(['tts-1', 'tts-1-hd']);

// ---------------------------------------------------------------------------
// resolveAdapter — returns a chat/VLM adapter
// ---------------------------------------------------------------------------

/**
 * Resolve and instantiate a **chat / VLM** adapter.
 *
 * Provider resolution order:
 *  1. Explicit `provider` from the FROM directive (e.g. `FROM openai/gpt-4o`)
 *  2. Heuristic based on model name if provider is null
 *
 * Heuristics (provider = null):
 *   gpt-*, o1-*, o3-*, o4-*  → openai
 *   everything else           → ollama (local)
 */
export function resolveAdapter(
  model: string,
  provider: string | null,
  options?: Record<string, string>,
): ModelAdapter {
  const resolved = provider ?? inferChatProvider(model);

  switch (resolved) {
    case 'openai':
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['OPENAI_API_KEY'],
        baseURL: options?.['baseURL'],
      });

    case 'anthropic':
      return new AnthropicAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['ANTHROPIC_API_KEY'],
        baseURL: options?.['baseURL'],
      });

    case 'ollama':
      return new OllamaAdapter(model, {
        baseURL: options?.['baseURL'] ?? process.env['OLLAMA_HOST'],
      });

    case 'mistral':
      // Mistral AI is OpenAI-API-compatible
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['MISTRAL_API_KEY'],
        baseURL: options?.['baseURL'] ?? 'https://api.mistral.ai/v1',
      });

    case 'groq':
      // Groq is OpenAI-API-compatible
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['GROQ_API_KEY'],
        baseURL: options?.['baseURL'] ?? 'https://api.groq.com/openai/v1',
      });

    case 'gemini':
      // Google Gemini via OpenAI-compatible endpoint
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['GEMINI_API_KEY'],
        baseURL:
          options?.['baseURL'] ??
          'https://generativelanguage.googleapis.com/v1beta/openai',
      });

    case 'together':
      // Together AI — OpenAI-compatible
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['TOGETHER_API_KEY'],
        baseURL: options?.['baseURL'] ?? 'https://api.together.xyz/v1',
      });

    case 'fireworks':
      // Fireworks AI — OpenAI-compatible
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['FIREWORKS_API_KEY'],
        baseURL: options?.['baseURL'] ?? 'https://api.fireworks.ai/inference/v1',
      });

    case 'perplexity':
      // Perplexity AI — OpenAI-compatible
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['PERPLEXITY_API_KEY'],
        baseURL: options?.['baseURL'] ?? 'https://api.perplexity.ai',
      });

    case 'deepseek':
      // DeepSeek — OpenAI-compatible
      return new OpenAIAdapter(model, {
        apiKey: options?.['apiKey'] ?? process.env['DEEPSEEK_API_KEY'],
        baseURL: options?.['baseURL'] ?? 'https://api.deepseek.com/v1',
      });

    default:
      throw new Error(
        `Unknown provider: "${resolved}". ` +
          `Supported chat providers: openai, anthropic, ollama, mistral, groq, gemini, ` +
          `together, fireworks, perplexity, deepseek. ` +
          `For generation models use resolveGenerationAdapter().`,
      );
  }
}

// ---------------------------------------------------------------------------
// resolveGenerationAdapter — returns an image/audio/video generation adapter
// ---------------------------------------------------------------------------

/**
 * Resolve and instantiate a **generation** adapter.
 *
 * Called when the Promptfile contains GENERATE directives.
 * The `modality` from the GENERATE directive is used to validate the adapter.
 */
export function resolveGenerationAdapter(
  model: string,
  provider: string | null,
  modality: GenerationModality,
  options?: Record<string, string>,
): GenerationAdapter {
  const resolved = provider ?? inferGenerationProvider(model);

  switch (resolved) {
    case 'openai': {
      if (OPENAI_IMAGE_MODELS.has(model)) {
        return new OpenAIImageAdapter(model, {
          apiKey: options?.['apiKey'] ?? process.env['OPENAI_API_KEY'],
          baseURL: options?.['baseURL'],
        });
      }
      if (OPENAI_TTS_MODELS.has(model)) {
        return new OpenAITTSAdapter(model, {
          apiKey: options?.['apiKey'] ?? process.env['OPENAI_API_KEY'],
          baseURL: options?.['baseURL'],
        });
      }
      throw new Error(
        `OpenAI model "${model}" is not a generation model. ` +
          `Image generation: dall-e-3, dall-e-2. Audio: tts-1, tts-1-hd.`,
      );
    }

    case 'replicate':
      return new ReplicateAdapter(model, modality, {
        apiToken: options?.['apiToken'] ?? process.env['REPLICATE_API_TOKEN'],
      });

    case 'fal':
      throw new Error(
        `Provider "fal" is not yet built-in. ` +
          `Use replicate/<model> or set baseURL to a fal-compatible endpoint.`,
      );

    case 'elevenlabs':
      throw new Error(
        `Provider "elevenlabs" is not yet built-in. ` +
          `Use replicate/elevenlabs/<model> or set a custom baseURL.`,
      );

    case 'suno':
      throw new Error(
        `Provider "suno" is not yet built-in. ` +
          `Use replicate/suno-ai/bark or replicate/meta/musicgen for open music generation.`,
      );

    case 'runway':
      throw new Error(
        `Provider "runway" is not yet built-in. ` +
          `Use replicate/anotherjesse/zeroscope-v2-xl for open video generation.`,
      );

    default:
      throw new Error(
        `Unknown generation provider: "${resolved}". ` +
          `Supported: openai (dall-e-3, tts-1), replicate. ` +
          `Other providers (fal, elevenlabs, suno, runway) are planned.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferChatProvider(model: string): string {
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

function inferGenerationProvider(model: string): string {
  if (OPENAI_IMAGE_MODELS.has(model) || OPENAI_TTS_MODELS.has(model)) return 'openai';
  if (model.includes('/')) return 'replicate';
  return 'replicate';
}
