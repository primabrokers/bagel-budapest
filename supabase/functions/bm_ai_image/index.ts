// Deno Edge Function code — see bm_ai_design/index.ts for the `Deno` ambient-declaration note.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};

import { huggingfaceAdapter } from './_shared/huggingfaceAdapter.ts';
import { openaiImageAdapter } from './_shared/openaiImageAdapter.ts';
import { checkUsage, recordUsage } from './_shared/usage.ts';
import type { ImageProvider } from './_shared/imageProvider.ts';

/**
 * `bm_ai_image` — generates decorative artwork for an invitation and stores it.
 *
 * Returns a storage PATH, never a URL and never the bytes. The path is what
 * `lib/invitations/designSpec.ts` validates (`isSafeAssetPath`) and what the renderer's caller
 * resolves, exactly as it already does for the event's own logo and monogram. Returning a URL
 * would put an arbitrary origin into a field that ends up in an `<img src>` on a public page.
 *
 * Uploads with the CALLER'S OWN JWT, so the storage RLS policy on `bm-invitation-assets` decides
 * whether they may write to that event's folder. No service-role key is used here, which is what
 * makes the first path segment (the event id) trustworthy rather than merely conventional.
 *
 * Request:  POST { eventId, prompt, provider?, width?, height? }
 * Response: 200 { ok: true, path, model, provider }
 *         | 200 { ok: false, reason: 'not_configured' | 'rate_limited', message }
 *         | 400/401 { ok: false, reason, message }
 *         | 502 { ok: false, reason: 'generation_failed' | 'upload_failed', message }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'bm-invitation-assets';

const PROVIDERS: Record<string, ImageProvider> = {
  huggingface: huggingfaceAdapter,
  openai: openaiImageAdapter,
};

const DEFAULT_PROVIDER = 'huggingface';

/**
 * Wrapped around whatever the family typed. An invitation background sits BEHIND text, so the
 * instructions push towards ornament rather than a busy scene, and explicitly away from lettering
 * — a model that renders its own words produces misspelt Hebrew under the real words.
 */
function buildImagePrompt(brief: string): string {
  return [
    'Decorative background artwork for a formal Jewish Bar Mitzvah invitation.',
    'Elegant, restrained, subtle. Suitable to sit behind text.',
    'No lettering, no words, no numbers, no signatures, no watermarks.',
    'No people and no faces.',
    `Style requested: ${brief.slice(0, 600)}`,
  ].join(' ');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function requireAuthenticatedRole(req: Request): boolean {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return payload.role === 'authenticated';
  } catch {
    return false;
  }
}

/** Only ever a uuid from the request, but validated anyway — it becomes a storage path segment. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'invalid_request', message: 'This endpoint only accepts POST.' }, 400);
  }
  if (!requireAuthenticatedRole(req)) {
    return json({ ok: false, reason: 'unauthorized', message: 'Sign in to generate artwork.' }, 401);
  }

  let body: { eventId?: unknown; prompt?: unknown; provider?: unknown; width?: unknown; height?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'invalid_request', message: 'Invalid JSON body.' }, 400);
  }

  if (!isUuid(body.eventId) || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return json({ ok: false, reason: 'invalid_request', message: '"eventId" and "prompt" are required.' }, 400);
  }
  const eventId = body.eventId;

  const provider = PROVIDERS[typeof body.provider === 'string' ? body.provider : DEFAULT_PROVIDER];
  if (!provider) {
    return json({ ok: false, reason: 'invalid_request', message: 'Unknown image provider.' }, 400);
  }
  if (!provider.isConfigured()) {
    return json({
      ok: false,
      reason: 'not_configured',
      message: `Image generation is not set up yet (no API key for ${provider.id}).`,
    });
  }

  const usage = await checkUsage(req, eventId);
  if (!usage.allowed) {
    return json({
      ok: false,
      reason: 'rate_limited',
      message: `This event has used its ${usage.cap} AI generations for this month.`,
    });
  }

  let image;
  try {
    image = await provider.generateImage({
      prompt: buildImagePrompt(body.prompt),
      width: typeof body.width === 'number' ? body.width : undefined,
      height: typeof body.height === 'number' ? body.height : undefined,
    });
  } catch (error) {
    return json(
      { ok: false, reason: 'generation_failed', message: error instanceof Error ? error.message : 'Could not generate artwork.' },
      502,
    );
  }

  // Event id first, matching every other bucket's convention and the storage policy's
  // `storage.foldername(name)[1]` membership check.
  const extension = image.contentType.includes('jpeg') ? 'jpg' : image.contentType.includes('webp') ? 'webp' : 'png';
  const path = `${eventId}/generated/${crypto.randomUUID()}.${extension}`;

  const upload = await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: req.headers.get('Authorization') ?? '',
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      'Content-Type': image.contentType,
      'x-upsert': 'false',
    },
    body: image.bytes,
  });

  if (!upload.ok) {
    const detail = await upload.text().catch(() => '');
    return json(
      { ok: false, reason: 'upload_failed', message: `Could not store the artwork. ${detail.slice(0, 200)}` },
      502,
    );
  }

  await recordUsage(req, { eventId, kind: 'image', provider: provider.id, model: image.model });

  return json({ ok: true, path, model: image.model, provider: provider.id });
});
