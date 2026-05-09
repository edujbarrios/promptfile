/**
 * Base types for model adapters.
 * All provider implementations must conform to these interfaces.
 *
 * Supports text (LLM), vision (VLM), and generation (image/audio/video) modalities.
 */

// ---------------------------------------------------------------------------
// Multimodal message content parts
// ---------------------------------------------------------------------------

/** Plain text content part. */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/**
 * Image content part — accepted by vision language models.
 * `url` may be an https:// URL or a data: URI (base64-encoded image).
 */
export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    /** Controls image detail level for OpenAI-compatible vision APIs. */
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Audio content part — accepted by models that support audio input.
 * `data` is a base64-encoded audio file; `format` is the codec.
 */
export interface AudioContentPart {
  type: 'input_audio';
  input_audio: {
    data: string;
    format: 'mp3' | 'wav' | 'ogg' | 'flac' | 'webm';
  };
}

/**
 * Video content part — a URL reference to a video file.
 * Support varies by provider; most accept https:// links to hosted videos.
 */
export interface VideoContentPart {
  type: 'video_url';
  video_url: { url: string };
}

export type MessageContentPart =
  | TextContentPart
  | ImageContentPart
  | AudioContentPart
  | VideoContentPart;

// ---------------------------------------------------------------------------
// Core message type — supports both plain text and multimodal content
// ---------------------------------------------------------------------------

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Plain string for text-only models; array of parts for multimodal models. */
  content: string | MessageContentPart[];
  name?: string;
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// Chat / VLM adapter
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: ToolDefinition[];
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  usage: Usage;
  model: string;
  toolCalls?: ToolCall[];
}

/**
 * Adapter for chat and vision language models.
 * Providers: openai, anthropic, ollama, mistral, groq, gemini, etc.
 */
export interface ModelAdapter {
  readonly name: string;
  readonly provider: string;
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  stream(messages: Message[], options?: ChatOptions): AsyncGenerator<string, void, unknown>;
  listModels?(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Generation adapter — for image, audio, and video generation models
// ---------------------------------------------------------------------------

/** Which media type a GenerationAdapter produces. */
export type GenerationModality = 'image' | 'audio' | 'video';

export interface GenerationRequest {
  /** Natural-language generation prompt. */
  prompt: string;
  /** Provider-specific options (duration, quality, style, etc.). */
  options?: Record<string, string>;
}

export interface GenerationResponse {
  /** Public URL to the generated asset, if returned by the provider. */
  url?: string;
  /** Raw binary content of the generated asset, if returned inline. */
  data?: Buffer;
  /** MIME type of the generated asset (e.g. "image/png", "audio/mpeg"). */
  mimeType: string;
  /** Canonical model identifier returned by the provider. */
  model: string;
}

/**
 * Adapter for media-generation models (image, audio, video).
 * Providers: openai/dall-e-3, openai/tts-1, suno, elevenlabs, runway, replicate, fal, etc.
 */
export interface GenerationAdapter {
  readonly name: string;
  readonly provider: string;
  readonly modality: GenerationModality;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
}
