import { createOpenAiCompatibleAdapter } from './openAiCompatible.ts';

/** OpenAI. Model id overridable via `OPENAI_DESIGN_MODEL` — see `openAiCompatible.ts`. */
export const openaiAdapter = createOpenAiCompatibleAdapter({
  id: 'openai',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  keyEnv: 'OPENAI_API_KEY',
  modelEnv: 'OPENAI_DESIGN_MODEL',
  defaultModel: 'gpt-4o',
});
