import { createOpenAiCompatibleAdapter } from './openAiCompatible.ts';

/** xAI Grok, which serves an OpenAI-compatible endpoint. Model id overridable via
 *  `XAI_DESIGN_MODEL` — see `openAiCompatible.ts`. */
export const grokAdapter = createOpenAiCompatibleAdapter({
  id: 'grok',
  apiUrl: 'https://api.x.ai/v1/chat/completions',
  keyEnv: 'XAI_API_KEY',
  modelEnv: 'XAI_DESIGN_MODEL',
  defaultModel: 'grok-2-latest',
});
