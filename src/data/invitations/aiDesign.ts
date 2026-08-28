import { supabase } from '../../lib/supabase';
import { invitationSpecJsonSchema, parseInvitationDesignSpec } from '../../lib/invitations/designSpec';
import { sanitiseInvitationHtml } from '../../lib/invitations/sanitiseInvitationHtml';
import { createDefaultInvitationBlocks } from './types';
import type { InvitationDesign, InvitationDesignMode } from './types';
import type { InvitationRendererEvent } from '../../components/invitations/InvitationRenderer';

/**
 * The client half of `bm_ai_design`. Turns a family's brief into a stored-ready
 * `InvitationDesign`, doing the validation the edge function deliberately does NOT do — see that
 * function's header for why validation lives here, at the point of render, rather than being
 * split across both.
 *
 * Never throws. Every failure path — no API key, monthly cap reached, a model that returned
 * something unusable — comes back as a tagged outcome the designer renders as its own message,
 * because "the AI is not set up yet" and "the model wrote nonsense" need different words in front
 * of a parent who is trying to get invitations out.
 */

export type AiDesignFailure =
  | 'not_configured'
  | 'rate_limited'
  | 'unauthorized'
  | 'unusable_output'
  | 'failed';

export type AiDesignOutcome =
  | { ok: true; design: InvitationDesign; model: string; notes: string[] }
  | { ok: false; reason: AiDesignFailure; message: string };

export interface GenerateDesignArgs {
  eventId: string;
  prompt: string;
  mode: InvitationDesignMode & ('spec' | 'html');
  event: InvitationRendererEvent;
  /** Omitted uses the function's own default (Claude). */
  provider?: 'anthropic' | 'openai' | 'grok';
  /** Carried through so a regenerate keeps the family's colours and font rather than resetting. */
  base?: InvitationDesign;
}

interface EdgeResponse {
  ok?: boolean;
  text?: string;
  model?: string;
  reason?: string;
  message?: string;
}

/**
 * Models are asked for bare JSON and mostly comply, but a markdown fence or a sentence of preamble
 * is a common enough failure that rejecting the whole design over it would be needlessly brittle.
 * Pulls out the outermost `{…}` and parses that; returns `null` rather than throwing so the caller
 * reports "unusable output" in one place.
 */
export function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Strips a markdown fence around generated markup, for the same reason as above. */
export function extractHtmlFragment(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

export async function generateInvitationDesign(args: GenerateDesignArgs): Promise<AiDesignOutcome> {
  const { data, error } = await supabase.functions.invoke<EdgeResponse>('bm_ai_design', {
    body: {
      eventId: args.eventId,
      prompt: args.prompt,
      mode: args.mode,
      provider: args.provider,
      // Only the event facts a design may mention — never the guest list. See the edge function's
      // `DesignEventContext`.
      event: {
        boyName: args.event.boy_name,
        eventDate: args.event.event_date,
        hebrewDate: args.event.hebrew_date_override,
        venueName: args.event.venue_name,
      },
      ...(args.mode === 'spec' ? { schema: invitationSpecJsonSchema() } : {}),
    },
  });

  if (error) {
    return { ok: false, reason: 'failed', message: 'Could not reach the design service. Please try again.' };
  }

  if (!data?.ok) {
    const reason = data?.reason;
    if (reason === 'not_configured' || reason === 'rate_limited' || reason === 'unauthorized') {
      return { ok: false, reason, message: data?.message ?? 'AI design is unavailable.' };
    }
    return { ok: false, reason: 'failed', message: data?.message ?? 'Could not generate a design.' };
  }

  const text = data.text ?? '';
  const model = data.model ?? 'unknown';
  const generatedAt = new Date().toISOString();

  // Blocks are carried on every generated design so that switching a template back to the block
  // editor — or falling through to it when a spec fails to validate — always has something to draw.
  const blocks = args.base?.blocks ?? createDefaultInvitationBlocks();

  if (args.mode === 'html') {
    const { html, removed } = sanitiseInvitationHtml(extractHtmlFragment(text));
    if (!html) {
      return { ok: false, reason: 'unusable_output', message: 'The model returned no usable markup.' };
    }
    return {
      ok: true,
      model,
      notes: removed,
      design: {
        ...args.base,
        blocks,
        mode: 'html',
        generated: { prompt: args.prompt, html, model, generatedAt },
      },
    };
  }

  const { spec, errors } = parseInvitationDesignSpec(extractJsonObject(text));
  if (!spec) {
    return {
      ok: false,
      reason: 'unusable_output',
      message: errors[0] ?? 'The model returned a design we could not read.',
    };
  }

  return {
    ok: true,
    model,
    notes: errors,
    design: {
      ...args.base,
      blocks,
      mode: 'spec',
      // Stored as the PARSED spec, not the raw model output: the row should hold the thing that
      // was actually validated, so a later read cannot resurrect a field the parser dropped.
      generated: { prompt: args.prompt, spec, model, generatedAt },
    },
  };
}
