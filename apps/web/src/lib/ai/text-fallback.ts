/**
 * Provider-fallback text generation for the Maiyuri Bricks app.
 *
 * Tries Gemini (primary) first; if it fails for ANY reason — depleted prepaid
 * credits (429), overload, network, or empty output — it falls back to DeepSeek
 * (text-only, OpenAI-compatible). Returns the text plus which provider produced
 * it, or null if BOTH are unavailable. NEVER throws.
 *
 * Use this for single-prompt TEXT generation (analysis, JSON extraction,
 * summaries). It is NOT for audio transcription, image generation, or vision —
 * DeepSeek cannot serve those, so those pipelines must keep calling Gemini
 * directly.
 *
 * Callers keep their existing JSON-extraction + error handling; they just swap
 *   const result = await model.generateContent(prompt);
 *   const response = result.response.text();
 * for
 *   const out = await generateTextWithFallback(prompt);
 *   const response = out?.text ?? "";   // (then their existing null/parse handling)
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_DEFAULT_MODEL } from "@/lib/ai/models";
import { deepseekComplete } from "@/lib/ai/deepseek";

export type AiProvider = "gemini" | "deepseek";

export interface FallbackResult {
  text: string;
  provider: AiProvider;
}

let _gemini: GoogleGenerativeAI | null = null;
function geminiClient(apiKey: string): GoogleGenerativeAI {
  if (!_gemini) _gemini = new GoogleGenerativeAI(apiKey);
  return _gemini;
}

export async function generateTextWithFallback(
  prompt: string,
  opts: { maxTokens?: number } = {},
): Promise<FallbackResult | null> {
  // Primary: Gemini.
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    try {
      const model = geminiClient(geminiKey).getGenerativeModel({
        model: GEMINI_DEFAULT_MODEL,
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) return { text, provider: "gemini" };
      // Empty output → fall through to DeepSeek.
    } catch {
      // Any Gemini failure (incl. 429/credit depletion) → fall through to DeepSeek.
    }
  }

  // Fallback: DeepSeek (text-only).
  const ds = await deepseekComplete(prompt, { maxTokens: opts.maxTokens });
  return ds ? { text: ds, provider: "deepseek" } : null;
}
