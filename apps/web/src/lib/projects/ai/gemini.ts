/**
 * Shared Gemini helper for the Projects module. Mirrors the call-recording
 * pattern (GOOGLE_AI_API_KEY, gemini-2.0-flash, JSON-in-fenced-block) but
 * degrades gracefully: returns null when the key is missing or parsing fails,
 * so callers can fall back to deterministic heuristics.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

export async function runGeminiJson<T>(prompt: string): Promise<T | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    // Extract JSON (fenced ```json block or first {...} / [...] span)
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced
      ? fenced[1]
      : (text.match(/[[{][\s\S]*[\]}]/)?.[0] ?? "");
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error("runGeminiJson error:", e);
    return null;
  }
}
