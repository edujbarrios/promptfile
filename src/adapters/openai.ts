/**
 * OpenAI adapter — supports gpt-4o, gpt-4, gpt-3.5-turbo, o1, o3, etc.
 * Requires OPENAI_API_KEY environment variable (or explicit apiKey option).
 */
import OpenAI from 'openai';
import type { ModelAdapter, Message, ChatOptions, ChatResponse } from './base.js';

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
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
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
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
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
