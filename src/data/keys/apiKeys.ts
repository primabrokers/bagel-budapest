import { supabase } from '../../lib/supabase';

/**
 * The client half of `bm_ai_keys`. Sends a key up; asks which keys are set; never asks for one
 * back.
 *
 * There is no `getKey` here and there is no `get` action on the edge function to call. That is
 * deliberate: nothing in the app has a legitimate reason to display a key it already stored, and
 * an endpoint that returned one would turn a stolen session into a stolen billing credential. The
 * browser's channel is one-way — write a key, ask whether one is set — and `last4` is all that
 * ever comes back.
 */

export interface ApiKeyStatus {
  /** The environment-variable name the provider adapters read, e.g. `ANTHROPIC_API_KEY`. */
  env: string;
  label: string;
  enables: string;
  /** Where the family goes to obtain one. */
  console: string;
  isSet: boolean;
  /** Last four characters, to tell one key from another. Never more. */
  last4: string | null;
  updatedAt: string | null;
}

export type ApiKeyFailure = 'unauthorized' | 'forbidden' | 'not_configured' | 'invalid_request' | 'failed';

export type ApiKeyOutcome =
  | { ok: true; keys: ApiKeyStatus[] }
  | { ok: false; reason: ApiKeyFailure; message: string };

async function call(body: Record<string, unknown>): Promise<ApiKeyOutcome> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    keys?: ApiKeyStatus[];
    reason?: ApiKeyFailure;
    message?: string;
  }>('bm_ai_keys', { body });

  if (error) {
    return { ok: false, reason: 'failed', message: 'Could not reach the key store. Please try again.' };
  }
  if (!data?.ok) {
    return {
      ok: false,
      reason: data?.reason ?? 'failed',
      message: data?.message ?? 'Could not manage API keys.',
    };
  }
  return { ok: true, keys: data.keys ?? [] };
}

export function fetchApiKeys(): Promise<ApiKeyOutcome> {
  return call({ action: 'list' });
}

export function setApiKey(env: string, value: string): Promise<ApiKeyOutcome> {
  return call({ action: 'set', key: env, value });
}

export function clearApiKey(env: string): Promise<ApiKeyOutcome> {
  return call({ action: 'clear', key: env });
}
