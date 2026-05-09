/**
 * OpenAI adapter — supports chat (gpt-4o, gpt-4, o1, o3, …), vision (gpt-4o),
 * image generation (dall-e-3, dall-e-2), and text-to-speech (tts-1, tts-1-hd).
 * Requires OPENAI_API_KEY environment variable (or explicit apiKey option).
 */
import OpenAI from 'openai';
import type {
  ModelAdapter,
  Message,
  MessageContentPart,
  ChatOptions,
  ChatResponse,
  GenerationAdapter,
  GenerationRequest,
  GenerationResponse,
} from './base.js';

// ---------------------------------------------------------------------------
// Helper: convert our Message type to the OpenAI wire format
// ---------------------------------------------------------------------------

function toOpenAIContent(
  content: string | MessageContentPart[],
): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text' as const, text: part.text };
    if (part.type === 'image_url') {
      return {
        type: 'image_url' as const,
        image_url: { url: part.image_url.url, detail: part.image_url.detail },
      };
    }
    if (part.type === 'input_audio') {
      return {
        type: 'input_audio' as const,
        input_audio: { data: part.input_audio.data, format: part.input_audio.format },
      } as OpenAI.Chat.Completions.ChatCompletionContentPart;
    }
    // video_url: fall back to a text reference (OpenAI doesn't natively support video in chat)
    if (part.type === 'video_url') {
      return { type: 'text' as const, text: `[video: ${part.video_url.url}]` };
    }
    return { type: 'text' as const, text: '' };
  });
}

/**
 * Map our generic Message[] to OpenAI's strictly-typed ChatCompletionMessageParam[].
 * OpenAI requires the role/content combination to match its discriminated union.
 */
function toOpenAIMessages(
  messages: Message[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
    const content = toOpenAIContent(m.content);
    if (m.role === 'system') {
      return { role: 'system', content: typeof content === 'string' ? content : '' };
    }
    if (m.role === 'assistant') {
      return { role: 'assistant', content: typeof content === 'string' ? content : null };
    }
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: typeof content === 'string' ? content : '',
        tool_call_id: m.tool_call_id ?? '',
      };
    }
    // user — supports multimodal content
    return {
      role: 'user',
      content,
    };
  });
}

// ---------------------------------------------------------------------------
// Chat / VLM adapter (gpt-4o, gpt-4, o1, …)
// ---------------------------------------------------------------------------

export class OpenAIAdapter implements ModelAdapter {
  readonly name: string;
  readonly provider = 'openai';
  private client: OpenAI;

  constructor(model: string, options?: { apiKey?: string; baseURL?: string }) {
    this.name = model;
    this.client = new OpenAI({
      apiKey: options?.apiKey ?? process.env['OPENAI_API_KEY'],
      baseURL: options?.baseURL,
    });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.name,
      messages: toOpenAIMessages(messages),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      stop: options?.stop,
      tools: options?.tools,
    });

    const choice = response.choices[0];
    return {
      content: choice?.message.content ?? '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      toolCalls: choice?.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })),
    };
  }

  async *stream(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: this.name,
      messages: toOpenAIMessages(messages),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      stop: options?.stop,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async listModels(): Promise<string[]> {
    const models = await this.client.models.list();
    return models.data
      .filter((m) => m.id.startsWith('gpt') || m.id.startsWith('o1') || m.id.startsWith('o3'))
      .map((m) => m.id)
      .sort();
  }
}

// ---------------------------------------------------------------------------
// Image generation adapter (dall-e-3, dall-e-2)
// ---------------------------------------------------------------------------

export class OpenAIImageAdapter implements GenerationAdapter {
  readonly name: string;
  readonly provider = 'openai';
  readonly modality = 'image' as const;
  private client: OpenAI;

  constructor(model: string, options?: { apiKey?: string; baseURL?: string }) {
    this.name = model;
    this.client = new OpenAI({
      apiKey: options?.apiKey ?? process.env['OPENAI_API_KEY'],
      baseURL: options?.baseURL,
    });
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const size = (request.options?.['size'] ?? '1024x1024') as
      | '256x256'
      | '512x512'
      | '1024x1024'
      | '1792x1024'
      | '1024x1792';
    const quality = (request.options?.['quality'] ?? 'standard') as 'standard' | 'hd';
    const style = (request.options?.['style'] ?? 'vivid') as 'vivid' | 'natural';

    const response = await this.client.images.generate({
      model: this.name,
      prompt: request.prompt,
      n: 1,
      size,
      quality: this.name === 'dall-e-3' ? quality : undefined,
      style: this.name === 'dall-e-3' ? style : undefined,
      response_format: 'url',
    });

    const firstItem = response.data?.[0];
    const url = firstItem?.url ?? '';
    return { url, mimeType: 'image/png', model: this.name };
  }
}

// ---------------------------------------------------------------------------
// Text-to-speech adapter (tts-1, tts-1-hd)
// ---------------------------------------------------------------------------

type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export class OpenAITTSAdapter implements GenerationAdapter {
  readonly name: string;
  readonly provider = 'openai';
  readonly modality = 'audio' as const;
  private client: OpenAI;

  constructor(model: string, options?: { apiKey?: string; baseURL?: string }) {
    this.name = model;
    this.client = new OpenAI({
      apiKey: options?.apiKey ?? process.env['OPENAI_API_KEY'],
      baseURL: options?.baseURL,
    });
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const voice = (request.options?.['voice'] ?? 'alloy') as TTSVoice;
    const format = (request.options?.['format'] ?? 'mp3') as TTSFormat;

    const response = await this.client.audio.speech.create({
      model: this.name,
      input: request.prompt,
      voice,
      response_format: format,
    });

    const data = Buffer.from(await response.arrayBuffer());
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg',
      opus: 'audio/ogg; codecs=opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
      pcm: 'audio/pcm',
    };
    return { data, mimeType: mimeMap[format] ?? 'audio/mpeg', model: this.name };
  }
}
