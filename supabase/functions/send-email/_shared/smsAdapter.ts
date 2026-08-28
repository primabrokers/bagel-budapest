/**
 * A placeholder for a future SMS channel (`bm_invitations.channel` allows only 'link' | 'whatsapp'
 * | 'email' today — see migration 3 — so nothing in this stage actually calls this). Shaped now,
 * against the same `isConfigured()`/`send()` contract as `emailProvider.ts`, so a later stage that
 * DOES add an SMS channel drops in a real implementation (e.g. Twilio) rather than inventing the
 * interface from scratch.
 *
 * Always reports unconfigured; `send` throws as a safety net in case a future caller skips the
 * `isConfigured()` check the way `index.ts` does for email.
 */

export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SmsProvider {
  isConfigured(): boolean;
  send(input: SendSmsInput): Promise<void>;
}

export const smsAdapter: SmsProvider = {
  isConfigured() {
    return false;
  },
  send(input: SendSmsInput) {
    return Promise.reject(new Error(`SMS sending is not implemented yet (would have sent to ${input.to}).`));
  },
};
