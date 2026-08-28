// Deno Edge Function code — not a browser/Node module. `Deno` is a real global at runtime; this
// ambient declaration exists only so the repo-wide `eslint .` sweep (which lints every .ts file,
// this directory included, under `globals.browser` — see eslint.config.js) doesn't flag it as
// undefined. Kept intentionally minimal: only the members this file uses.
declare const Deno: {
  env: { get(key: string): string | undefined };
};

import Anthropic from 'npm:@anthropic-ai/sdk@0.70.1';
import { buildSystemPrompt, buildUserPrompt } from './designPrompt.ts';
import type { GenerateDesignInput, GenerateDesignResult, TextProvider } from './textProvider.ts';

/**
 * Claude Opus 5. Chosen for the design work because the hard part here is not prose but judgement
 * — laying out a religious family occasion in the right register, in British English, with Hebrew
 * that is either correct or absent.
 */
const MODEL = 'claude-opus-5';

/**
 * Comfortably above a one-page invitation in either mode, and low enough to stay well inside the
 * SDK's non-streaming HTTP timeout. Streaming would buy nothing here: nothing renders until the
 * whole design has been validated anyway, so there is no partial output worth showing.
 */
const MAX_TOKENS = 16_000;

function apiKey(): string | undefined {
  return Deno.env.get('ANTHROPIC_API_KEY');
}

export const anthropicAdapter: TextProvider = {
  id: 'anthropic',

  isConfigured() {
    return Boolean(apiKey());
  },

  async generateDesign(input: GenerateDesignInput): Promise<GenerateDesignResult> {
    const client = new Anthropic({ apiKey: apiKey() });

    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Adaptive thinking: the model decides how much to reason. `budget_tokens` is rejected
      // outright on this model, and effort is the lever instead.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        // `spec` mode constrains the output to the same schema `designSpec.ts` validates against,
        // so the usual case is a structurally valid object rather than a repair job. `html` mode
        // has no schema — the sanitiser and the sandboxed iframe carry it instead.
        ...(input.mode === 'spec' && input.schema
          ? { format: { type: 'json_schema' as const, schema: input.schema } }
          : {}),
      },
      // Server-side refusal fallback: if a safety classifier declines this request, the API
      // re-runs it on a fallback model within the same call rather than returning nothing. A
      // decline before any output is not billed. `"default"` routes by refusal category, so
      // there is no model list here to go stale.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: buildSystemPrompt(input.mode),
      messages: [{ role: 'user', content: buildUserPrompt(input.prompt, input.event) }],
    });

    // A refusal arrives as HTTP 200 with an empty-ish body, so `stop_reason` has to be checked
    // before reading content or the caller sees a confusing "empty design" instead of the reason.
    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category ?? 'unspecified';
      throw new Error(`The model declined this request (${category}). Try rewording the brief.`);
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      throw new Error('The model returned an empty design.');
    }

    return {
      text,
      // `response.model` rather than the constant: a fallback may have served this turn, and the
      // usage row should record what actually ran.
      model: response.model ?? MODEL,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    };
  },
};
