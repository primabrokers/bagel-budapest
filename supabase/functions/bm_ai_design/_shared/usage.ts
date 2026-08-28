// Deno Edge Function code — see the note in `anthropicAdapter.ts` for why `Deno` is declared here.
declare const Deno: {
  env: { get(key: string): string | undefined };
};

/**
 * The cost guard. Every AI call here spends real money on someone's API key, and the endpoint is
 * reachable by any signed-in family member, so an accidental render loop in the UI — or one bored
 * teenager with the family password — must not be able to run up an unbounded bill.
 *
 * Deliberately counts CALLS rather than estimating pounds. A call count is exact, needs no price
 * table to drift out of date, and is the thing a human can reason about ("fifty invitations a
 * month is plenty"). Token counts are still recorded per row for after-the-fact attribution.
 *
 * Every request here carries the CALLER'S OWN JWT, never a service-role key. That is what makes
 * the cap honest: `bm_ai_usage` is RLS-scoped to event membership, so a member cannot read or
 * write another family's usage, and a caller who is not a member of the event they named simply
 * cannot insert a row at all.
 */

const DEFAULT_MONTHLY_CAP = 200;

function monthlyCap(): number {
  const raw = Deno.env.get('BM_AI_MONTHLY_CALL_CAP');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_CAP;
}

function restUrl(path: string): string {
  return `${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`;
}

/** The caller's own credentials, forwarded verbatim so PostgREST applies their RLS. */
function callerHeaders(req: Request): HeadersInit {
  return {
    Authorization: req.headers.get('Authorization') ?? '',
    apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    'Content-Type': 'application/json',
  };
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export interface UsageCheck {
  allowed: boolean;
  used: number;
  cap: number;
}

/**
 * How many AI calls this event has made this calendar month. Fails CLOSED: if the count cannot be
 * read, the call is refused rather than allowed through unmetered — an outage in the metering path
 * is exactly when an unbounded loop would be most expensive.
 */
export async function checkUsage(req: Request, eventId: string): Promise<UsageCheck> {
  const cap = monthlyCap();
  const query = `bm_ai_usage?select=id&event_id=eq.${encodeURIComponent(eventId)}&created_at=gte.${encodeURIComponent(startOfMonthIso())}`;

  const response = await fetch(restUrl(query), {
    headers: { ...callerHeaders(req), Prefer: 'count=exact' },
  });

  if (!response.ok) {
    return { allowed: false, used: cap, cap };
  }

  // PostgREST reports the exact count in Content-Range as `0-24/25`; the tail is what we want.
  const range = response.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  const used = Number.isFinite(total) ? total : cap;

  return { allowed: used < cap, used, cap };
}

export interface UsageRecord {
  eventId: string;
  kind: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Records one call. Never throws: a metering write that fails must not lose the family the design
 * they just paid for. It is logged instead — and because `checkUsage` fails closed, a metering
 * path that is broken for long enough stops new calls anyway.
 */
export async function recordUsage(req: Request, record: UsageRecord): Promise<void> {
  try {
    const response = await fetch(restUrl('bm_ai_usage'), {
      method: 'POST',
      headers: { ...callerHeaders(req), Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_id: record.eventId,
        kind: record.kind,
        provider: record.provider,
        model: record.model,
        input_tokens: record.inputTokens ?? null,
        output_tokens: record.outputTokens ?? null,
      }),
    });
    if (!response.ok) {
      console.error('recordUsage failed:', response.status, await response.text().catch(() => ''));
    }
  } catch (error) {
    console.error('recordUsage threw:', error);
  }
}
