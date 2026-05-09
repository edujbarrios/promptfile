/**
 * Replicate adapter — runs any model hosted on Replicate.
 * Covers a wide range of open-source image, audio, and video generation models:
 *   stability-ai/stable-diffusion-3, black-forest-labs/flux-schnell (image)
 *   suno-ai/bark, meta/musicgen (audio)
 *   anotherjesse/zeroscope-v2-xl (video)
 *   … and thousands more at replicate.com/explore
 *
 * Requires REPLICATE_API_TOKEN environment variable (or explicit apiToken option).
 *
 * FROM  replicate/stability-ai/stable-diffusion-3
 * GENERATE image "a photorealistic sunset over rolling hills"
 */
import type { GenerationAdapter, GenerationRequest, GenerationResponse, GenerationModality } from './base.js';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string;
  urls?: { get: string };
}

const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 300; // 5 minutes max

export class ReplicateAdapter implements GenerationAdapter {
  readonly name: string;
  readonly provider = 'replicate';
  readonly modality: GenerationModality;
  private apiToken: string;
  private baseURL = 'https://api.replicate.com/v1';

  constructor(
    model: string,
    modality: GenerationModality,
    options?: { apiToken?: string },
  ) {
    this.name = model;
    this.modality = modality;
    this.apiToken = options?.apiToken ?? process.env['REPLICATE_API_TOKEN'] ?? '';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Token ${this.apiToken}`,
    };
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    // Start prediction
    const body = {
      version: this.name.includes(':') ? this.name.split(':')[1] : undefined,
      input: {
        prompt: request.prompt,
        ...Object.fromEntries(
          Object.entries(request.options ?? {}).filter(([k]) => k !== 'output'),
        ),
      },
    };

    // Build the endpoint — Replicate uses <owner>/<model> or <owner>/<model>:<version>
    const modelSlug = this.name.includes(':') ? this.name.split(':')[0] : this.name;
    const endpoint = this.name.includes(':')
      ? `${this.baseURL}/predictions`
      : `${this.baseURL}/models/${modelSlug}/predictions`;

    const createRes = await fetch(endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Replicate error ${createRes.status}: ${text}`);
    }

    let prediction = (await createRes.json()) as ReplicatePrediction;

    // Poll until done
    let polls = 0;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
      if (polls++ >= MAX_POLLS) {
        throw new Error('Replicate: prediction timed out');
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${this.baseURL}/predictions/${prediction.id}`, {
        headers: this.headers,
      });
      if (!pollRes.ok) {
        const text = await pollRes.text();
        throw new Error(`Replicate poll error ${pollRes.status}: ${text}`);
      }
      prediction = (await pollRes.json()) as ReplicatePrediction;
    }

    if (prediction.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${prediction.error ?? 'unknown error'}`);
    }

    // Extract the output URL
    const output = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;

    const url = typeof output === 'string' ? output : '';

    const mimeTypes: Record<GenerationModality, string> = {
      image: 'image/png',
      audio: 'audio/mpeg',
      video: 'video/mp4',
    };

    return { url, mimeType: mimeTypes[this.modality], model: this.name };
  }
}
