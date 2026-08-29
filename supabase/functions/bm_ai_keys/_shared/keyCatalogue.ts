/**
 * The API keys this app will store, and nothing else.
 *
 * The list is duplicated in `bm_ai_secret_allowed()` (migration 20260829120000) on purpose. That
 * copy is the one that ENFORCES; this one is what the UI renders. If they ever disagree the
 * database wins and the write is refused — a wrong list here is a broken screen, not a hole.
 *
 * `env` is the environment-variable name the provider adapters already read. `vault` is the
 * Supabase Vault entry name, always `bm_ai_`-prefixed, because this Supabase project is shared
 * with unrelated legacy data and the prefix is what keeps the two worlds apart.
 */

export interface KeyDescriptor {
  env: string;
  vault: string;
  label: string;
  /** What stops working without it — shown in Settings so a family knows what they are buying. */
  enables: string;
  /** Where to get one. Rendered as a plain link. */
  console: string;
}

export const KEY_CATALOGUE: readonly KeyDescriptor[] = [
  {
    env: 'ANTHROPIC_API_KEY',
    vault: 'bm_ai_ANTHROPIC_API_KEY',
    label: 'Anthropic (Claude)',
    enables: 'Designing invitations, and researching suppliers',
    console: 'https://console.anthropic.com/settings/keys',
  },
  {
    env: 'HF_TOKEN',
    vault: 'bm_ai_HF_TOKEN',
    label: 'Hugging Face',
    enables: 'Generating invitation artwork',
    console: 'https://huggingface.co/settings/tokens',
  },
  {
    env: 'OPENAI_API_KEY',
    vault: 'bm_ai_OPENAI_API_KEY',
    label: 'OpenAI',
    enables: 'An alternative for invitation designs and artwork',
    console: 'https://platform.openai.com/api-keys',
  },
  {
    env: 'XAI_API_KEY',
    vault: 'bm_ai_XAI_API_KEY',
    label: 'xAI (Grok)',
    enables: 'An alternative for invitation designs',
    console: 'https://console.x.ai',
  },
  {
    env: 'RESEND_API_KEY',
    vault: 'bm_ai_RESEND_API_KEY',
    label: 'Resend (email)',
    enables: 'Sending invitations, family invites and supplier emails',
    console: 'https://resend.com/api-keys',
  },
] as const;

export function descriptorFor(env: string): KeyDescriptor | undefined {
  return KEY_CATALOGUE.find((k) => k.env === env);
}
