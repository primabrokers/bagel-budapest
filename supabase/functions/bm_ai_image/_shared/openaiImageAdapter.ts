// Deno Edge Function code — see this function's index.ts for the `Deno` note.
declare const Deno: {
  env: { get(key: string): string | undefined };
};

import type { GenerateImageInput, GenerateImageResult, ImageProvider } from './imageProvider.ts';
import { secret } from './secrets.ts';

/**
 * OpenAI image generation, as the alternative to Hugging Face.
 *
 * Returns base64 rather than bytes, so unlike the HF adapter it decodes before handing back — the
 * interface deals in bytes so `index.ts` never has to care which provider produced them.
 *
 * Model is env-overridable (`OPENAI_IMAGE_MODEL`) for the same reason as everywhere else in this
 * codebase: this repo cannot reach the provider to check what is current, and vendors rename and
 * retire image models frequently.
 */

const API_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_MODEL = 'gpt-image-1';

interface ImageResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string };
}

function apiKey(): string | undefined {
  return secret('OPENAI_API_KEY');
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const openaiImageAdapter: ImageProvider = {
  id: 'openai',

  isConfigured() {
    return Boolean(apiKey());
  },

  async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const model = Deno.env.get('OPENAI_IMAGE_MODEL') ?? DEFAULT_MODEL;
    const size = `${input.width ?? 1024}x${input.height ?? 1024}`;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: input.prompt, size, n: 1 }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI returned ${response.status}. ${detail.slice(0, 300)}`);
    }

    const body = (await response.json()) as ImageResponse;
    if (body.error?.message) throw new Error(body.error.message);

    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new Error('The image model returned no image.');

    return { bytes: decodeBase64(b64), contentType: 'image/png', model };
  },
};
