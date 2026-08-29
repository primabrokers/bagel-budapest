// Deno Edge Function code — see the note in `index.ts` for why `Deno` is declared here.
declare const Deno: {
  env: { get(key: string): string | undefined };
};

import { buildSystemPrompt, buildUserPrompt } from './designPrompt.ts';
import type { GenerateDesignInput, GenerateDesignResult, TextProvider } from './textProvider.ts';
import { secret } from './secrets.ts';

/**
 * OpenAI and xAI both expose the same `/chat/completions` request and response shape, so one
 * implementation serves both rather than two files differing only in a hostname. `openaiAdapter`
 * and `grokAdapter` are thin instantiations of this.
 *
 * Raw `fetch` rather than a vendor SDK: the shape used here is three fields wide, and this
 * matches how `send-email/_shared/resendAdapter.ts` already talks to Resend.
 */

export interface OpenAiCompatibleConfig {
  id: string;
  apiUrl: string;
  /** Env var holding the API key. */
  keyEnv: string;
  /**
   * Env var that overrides the model id, and the default to fall back on.
   *
   * The default is overridable by design: this repo cannot reach either provider to check which
   * model ids are current (the egress policy blocks both), and vendors rename and retire models
   * frequently. Setting the env var on the deployed function is the supported way to move to a
   * newer model without a code change.
   */
  modelEnv: string;
  defaultModel: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export function createOpenAiCompatibleAdapter(config: OpenAiCompatibleConfig): TextProvider {
  function apiKey(): string | undefined {
    return secret(config.keyEnv);
  }

  return {
    id: config.id,

    isConfigured() {
      return Boolean(apiKey());
    },

    async generateDesign(input: GenerateDesignInput): Promise<GenerateDesignResult> {
      const model = Deno.env.get(config.modelEnv) ?? config.defaultModel;

      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16_000,
          messages: [
            { role: 'system', content: buildSystemPrompt(input.mode) },
            { role: 'user', content: buildUserPrompt(input.prompt, input.event) },
          ],
          // `json_object` rather than a full `json_schema`: schema support differs between these
          // two providers and silently 400s on the one that lacks it. The output is validated by
          // `parseInvitationDesignSpec` regardless, so asking only for "valid JSON" costs nothing.
          ...(input.mode === 'spec' ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`${config.id} returned ${response.status}. ${detail.slice(0, 300)}`);
      }

      const body = (await response.json()) as ChatCompletionResponse;
      if (body.error?.message) throw new Error(body.error.message);

      const text = body.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) throw new Error('The model returned an empty design.');

      return {
        text,
        model: body.model ?? model,
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
      };
    },
  };
}
