/**
 * Ollama adapter — supports any model running in a local Ollama instance.
 * Default base URL: http://localhost:11434 (override via OLLAMA_HOST env var).
 */
import type { ModelAdapter, Message, ChatOptions, ChatResponse } from './base.js';

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaChatChunk {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

export class OllamaAdapter implements ModelAdapter {
  readonly name: string;
  readonly provider = 'ollama';
  private baseURL: string;

  constructor(model: string, options?: { baseURL?: string }) {
    this.name = model;
    this.baseURL =
      options?.baseURL ??
      process.env['OLLAMA_HOST'] ??
      'http://localhost:11434';
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const body = {
      model: this.name,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options?.temperature,
        num_predict: options?.maxTokens,
        top_p: options?.topP,
        stop: options?.stop,
      },
    };

    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OllamaChatChunk;
    return {
      content: data.message.content,
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  async *stream(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncGenerator<string, void, unknown> {
    const body = {
      model: this.name,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      options: {
        temperature: options?.temperature,
        num_predict: options?.maxTokens,
        top_p: options?.topP,
        stop: options?.stop,
      },
    };

    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }

    if (!response.body) throw new Error('Ollama: no response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        if (!part.trim()) continue;
        try {
          const chunk = JSON.parse(part) as OllamaChatChunk;
          if (chunk.message?.content) {
            yield chunk.message.content;
          }
          if (chunk.done) return;
        } catch {
          // Partial JSON — skip
        }
      }
    }
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseURL}/api/tags`);
    if (!response.ok) throw new Error(`Ollama error ${response.status}`);
    const data = (await response.json()) as OllamaTagsResponse;
    return data.models.map((m) => m.name).sort();
  }
}
