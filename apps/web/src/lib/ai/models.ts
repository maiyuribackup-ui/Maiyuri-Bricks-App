/**
 * Canonical Gemini model slugs — single source of truth.
 *
 * Google retires model aliases periodically (e.g. the whole gemini-2.0-flash
 * family was retired 2026-06, returning 404). Keeping the slug here means the
 * next migration is a one-line change instead of hunting every call site.
 *
 * Verify a slug is live before changing this:
 *   curl ".../v1beta/models/<slug>:generateContent?key=$GOOGLE_AI_API_KEY"
 * Use the Generative Language API (generativelanguage.googleapis.com), which
 * the @google/generative-ai SDK targets — NOT the Vertex/agent-platform list,
 * which names models differently.
 */
export const GEMINI_MODEL = {
  // Non-thinking, fast, cheap — the right default for transcription, analysis,
  // and JSON extraction/parsing. (gemini-2.5-flash defaults to thinking ON,
  // which can blow serverless timeouts on multi-call steps.)
  FLASH_LITE: "gemini-2.5-flash-lite",
  // Thinking-capable; use only where deeper reasoning is worth the latency/cost.
  FLASH: "gemini-2.5-flash",
} as const;

/** Default model for all server-side pipeline AI tasks. */
export const GEMINI_DEFAULT_MODEL = GEMINI_MODEL.FLASH_LITE;
