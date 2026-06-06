import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_DEFAULT_MODEL } from "@/lib/ai/models";

/** Strip ```json fences and parse; return null on any failure (never throws). */
export function extractJson<T>(raw: string): T | null {
  try {
    const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** One Gemini Flash-Lite call returning strict JSON, or null on failure. */
export async function completeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxOutputTokens?: number } = {},
): Promise<T | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_DEFAULT_MODEL,
      generationConfig: { maxOutputTokens: opts.maxOutputTokens ?? 700, responseMimeType: "application/json" },
    });
    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    return extractJson<T>(result.response.text());
  } catch {
    return null;
  }
}
