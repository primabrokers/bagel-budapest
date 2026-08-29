/**
 * The adapter interface for image generation — the same shape as `send-email`'s `EmailProvider`
 * and `bm_ai_design`'s `TextProvider`, for the same reason: `index.ts` depends only on this.
 *
 * Claude cannot generate images, only read them, so unlike the design function there is no
 * Anthropic adapter here. The text half of a design comes from Claude; the pixels come from
 * Hugging Face or OpenAI.
 */

export interface GenerateImageInput {
  /** What to draw. Already fenced and constrained by `imagePrompt.ts`. */
  prompt: string;
  /** Square by default — an invitation background is usually cropped either way. */
  width?: number;
  height?: number;
}

export interface GenerateImageResult {
  /** Raw image bytes; `index.ts` uploads them to storage. */
  bytes: Uint8Array;
  /** MIME type, for the storage upload's content type. */
  contentType: string;
  model: string;
}

export interface ImageProvider {
  readonly id: string;
  isConfigured(): boolean;
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}
