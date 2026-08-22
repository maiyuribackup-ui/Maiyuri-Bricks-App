/**
 * DeepSeek fallback provider — TEXT ONLY.
 *
 * DeepSeek exposes an OpenAI-compatible Chat Completions API, so we call it with
 * a plain `fetch` (no extra dependency). It is used as a FALLBACK for Gemini text
 * generation when the primary provider is unavailable (e.g. depleted prepaid
 * credits → HTTP 429, overload, or network errors).
 *
 * LIMITS — DeepSeek is text-only. It does NOT do audio transcription, image
 * generation, or vision. So audio (call-recording transcription, voice feedback)
 * and image/vision pipelines CANNOT fall back here and still require Gemini.
 *
 * Config (env):
 *   DEEPSEEK_API_KEY        required to enable the fallback (absent → no-op, returns null)
 *   DEEPSEEK_BASE_URL       optional, defaults to https://api.deepseek.com
 *   DEEPSEEK_MODEL          optional, defaults to deepseek-chat
 */

export const DEEPSEEK_MODEL = {
  /** DeepSeek-V3 — fast, cheap; the right default for the JSON/analysis tasks Gemini Flash-Lite handles. */
  CHAT: "deepseek-chat",
  /** DeepSeek-R1 — deeper reasoning, slower/costlier. */
  REASONER: "deepseek-reasoner",
} as const;

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

/**
 * True for errors where switching to a second provider is the right move:
 * quota/billing exhaustion, rate limits, provider overload, 5xx, and transient
 * network failures. NOT for genuine bad-request/auth errors (those would fail on
 * the fallback too, so there's no point — but we stay permissive and still try).
 */
export function isFallbackWorthy(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return /\b429\b|resource_exhausted|prepayment credits|depleted|quota|rate.?limit|\b5\d\d\b|overload|unavailable|timeout|timed out|fetch failed|econnreset|enotfound|network/.test(
    msg,
  );
}

/**
 * One DeepSeek chat completion from a single prompt string. Returns the assistant
 * text, or null on any failure / missing key. NEVER throws.
 */
export async function deepseekComplete(
  prompt: string,
  opts: { maxTokens?: number; model?: string } = {},
): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model || process.env.DEEPSEEK_MODEL || DEEPSEEK_MODEL.CHAT,
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts.maxTokens ?? 2048,
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
