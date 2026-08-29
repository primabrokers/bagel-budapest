// Deno Edge Function code — see bm_ai_design/_shared/anthropicAdapter.ts for why `Deno` is
// declared here rather than imported.
declare const Deno: {
  env: { get(key: string): string | undefined };
};

import type { GenerateImageInput, GenerateImageResult, ImageProvider } from './imageProvider.ts';

/**
 * Hugging Face text-to-image.
 *
 * `Qwen/Qwen-Image` is the default for a specific reason: an invitation is mostly TYPE, and
 * garbled lettering is the characteristic failure of image models. Qwen-Image is built around
 * preserving typography and layout, so it is the one most likely to produce a decorative panel
 * that does not look wrong next to real text. It is also Apache 2.0.
 *
 * `black-forest-labs/FLUX.1-schnell` is the fast, cheap alternative (1–4 steps, also Apache 2.0)
 * and a reasonable choice for iterating on backgrounds and textures.
 *
 * DO NOT switch the default to `FLUX.1-dev`: it is licensed for non-commercial use only, and this
 * app is used by families paying suppliers.
 *
 * Both the model and the base URL are env-overridable. This repository cannot reach
 * huggingface.co to verify either (the session's egress policy blocks it), and HF has changed its
 * inference routing more than once, so pinning them in code would be a guess with a shelf life.
 * `HF_IMAGE_BASE_URL` and `HF_IMAGE_MODEL` are the supported way to correct them without a deploy
 * of new code.
 */

const DEFAULT_BASE_URL = 'https://api-inference.huggingface.co/models';
const DEFAULT_MODEL = 'Qwen/Qwen-Image';

function apiKey(): string | undefined {
  return Deno.env.get('HF_TOKEN');
}

export const huggingfaceAdapter: ImageProvider = {
  id: 'huggingface',

  isConfigured() {
    return Boolean(apiKey());
  },

  async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const baseUrl = (Deno.env.get('HF_IMAGE_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const model = Deno.env.get('HF_IMAGE_MODEL') ?? DEFAULT_MODEL;

    const response = await fetch(`${baseUrl}/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        Accept: 'image/png',
      },
      body: JSON.stringify({
        inputs: input.prompt,
        parameters: {
          width: input.width ?? 1024,
          height: input.height ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // 503 from HF means the model is loading rather than broken — worth saying, because the
      // fix is "try again in a minute", not "something is wrong with your key".
      if (response.status === 503) {
        throw new Error('The image model is warming up. Try again in a minute.');
      }
      throw new Error(`Hugging Face returned ${response.status}. ${detail.slice(0, 300)}`);
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';

    // A JSON body from an image endpoint is an error report, not a picture — HF returns one for
    // a bad model name or a rejected prompt, with HTTP 200.
    if (contentType.includes('application/json')) {
      const detail = await response.text().catch(() => '');
      throw new Error(`The image model returned an error: ${detail.slice(0, 300)}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error('The image model returned an empty image.');

    return { bytes, contentType, model };
  },
};
