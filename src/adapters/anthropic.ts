/**
 * Anthropic adapter — supports Claude 3 / Claude 3.5 family with vision.
 * Requires ANTHROPIC_API_KEY environment variable (or explicit apiKey option).
 *
 * Supported models (non-exhaustive):
 *   claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022
 *   claude-3-opus-20240229, claude-3-sonnet-20240229, claude-3-haiku-20240307
 *
 * Vision: all Claude 3+ models accept image content parts in user messages.
 */
import type { ModelAdapter, Message, MessageContentPart, ChatOptions, ChatResponse } from './base.js';

// ---------------------------------------------------------------------------
// Anthropic REST API wire types (we call the API directly to avoid an SDK dep)
// ---------------------------------------------------------------------------

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicImageSource {
  type: 'base64' | 'url';
  media_type?: string;
  data?: string;
  url?: string;
}

interface AnthropicImageBlock {
  type: 'image';
  source: AnthropicImageSource;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

type AnthropicContent = string | AnthropicContentBlock[];

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContent;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  model: string;
  content: AnthropicTextBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: { type: string; text?: string };
  message?: { model: string };
  index?: number;
}

// ---------------------------------------------------------------------------
// Helper: convert our Message[] to Anthropic's format
// ---------------------------------------------------------------------------

function toAnthropicContent(content: string | MessageContentPart[]): AnthropicContent {
  if (typeof content === 'string') return content;

  return content.map((part): AnthropicContentBlock => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }
    if (part.type === 'image_url') {
      const url = part.image_url.url;
      if (url.startsWith('data:')) {
        // data URI → base64 source
        const [header, data] = url.split(',', 2);
        const mediaType = header.replace('data:', '').replace(';base64', '');
        return {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: data ?? '' },
        };
      }
      return { type: 'image', source: { type: 'url', url } };
    }
    if (part.type === 'input_audio') {
      // Anthropic doesn't support inline audio yet — emit a placeholder
      return { type: 'text', text: '[audio input not supported by this provider]' };
    }
    if (part.type === 'video_url') {
      return { type: 'text', text: `[video: ${part.video_url.url}]` };
    }
    return { type: 'text', text: '' };
  });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class AnthropicAdapter implements ModelAdapter {
  readonly name: string;
  readonly provider = 'anthropic';
  private apiKey: string;
  private baseURL: string;

  constructor(model: string, options?: { apiKey?: string; baseURL?: string }) {
    this.name = model;
    this.apiKey = options?.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    this.baseURL = options?.baseURL ?? 'https://api.anthropic.com';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    // Extract system message if present
    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    const body: AnthropicRequest = {
      model: this.name,
      messages: nonSystem.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: toAnthropicContent(m.content),
      })),
      system: systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : undefined) : undefined,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      stop_sequences: options?.stop,
    };

    const response = await fetch(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const content = data.content.map((b) => b.text).join('');

    return {
      content,
      model: data.model,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  }

  async *stream(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, unknown> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    const body: AnthropicRequest = {
      model: this.name,
      messages: nonSystem.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: toAnthropicContent(m.content),
      })),
      system: systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : undefined) : undefined,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      stop_sequences: options?.stop,
      stream: true,
    };

    const response = await fetch(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic error ${response.status}: ${text}`);
    }

    if (!response.body) throw new Error('Anthropic: no response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (json === '[DONE]') return;
        try {
          const event = JSON.parse(json) as AnthropicStreamEvent;
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield event.delta.text;
          }
        } catch {
          // Partial or non-JSON line — skip
        }
      }
    }
  }
}
