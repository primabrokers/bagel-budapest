/**
 * The adapter interface every text model this function can drive has to satisfy — the same shape
 * as `send-email/_shared/emailProvider.ts`, for the same reason: `index.ts` depends only on this,
 * so adding or swapping a provider is a new adapter file plus one line in the registry, not a
 * rewrite of the handler.
 */

export type DesignMode = 'spec' | 'html';

/**
 * The event facts a design is allowed to mention. Passed explicitly rather than letting the model
 * invent them — an invitation with a wrong date is worse than no invitation, and this is also the
 * boundary that keeps guest names and contact details out of a third-party model's context.
 */
export interface DesignEventContext {
  boyName: string;
  /** ISO date-only, e.g. "2026-11-14". */
  eventDate: string;
  hebrewDate?: string | null;
  parentsNames?: string | null;
  venueName?: string | null;
  /** Name + ISO timestamp per function, so the model can lay out a multi-part simcha. */
  functions?: { name: string; startsAt: string | null }[];
}

export interface GenerateDesignInput {
  /** What the family typed. Untrusted text — see `designPrompt.ts` for how it is fenced. */
  prompt: string;
  mode: DesignMode;
  event: DesignEventContext;
  /** JSON Schema for `spec` mode, from `lib/invitations/designSpec.ts`. Ignored for `html`. */
  schema?: Record<string, unknown>;
}

export interface GenerateDesignResult {
  /** Raw model output — JSON text in `spec` mode, markup in `html` mode. Never trusted: the
   *  caller validates with `parseInvitationDesignSpec` or `sanitiseInvitationHtml`. */
  text: string;
  /** The model that actually served it, recorded on the template for cost attribution. */
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface TextProvider {
  /** Stable id used in the request body (`provider: 'anthropic'`) and in usage rows. */
  readonly id: string;
  /** Whether the API key this adapter needs is present — checked BEFORE any call, so an
   *  unconfigured deploy returns a clean `not_configured` rather than a failed HTTP request. */
  isConfigured(): boolean;
  /** Throws on failure; `index.ts` turns that into a structured error response. */
  generateDesign(input: GenerateDesignInput): Promise<GenerateDesignResult>;
}
