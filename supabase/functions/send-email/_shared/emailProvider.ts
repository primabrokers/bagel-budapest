/**
 * The adapter interface every email provider this function might use has to satisfy. `index.ts`
 * depends only on this shape, never on a concrete provider — swapping Resend for something else
 * later is a new adapter file plus one import change in `index.ts`, not a rewrite of the handler.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Optional — most email clients render the html part; this is for the
   *  ones that don't. */
  text?: string;
}

export interface EmailProvider {
  /** Whether this provider has everything it needs (an API key, typically) to actually send —
   *  checked BEFORE `send` is ever called, so `index.ts` can return a clear "not configured"
   *  response instead of attempting a call doomed to fail. */
  isConfigured(): boolean;
  /** Throws on failure — `index.ts` catches and turns that into a structured error response. */
  send(input: SendEmailInput): Promise<void>;
}
