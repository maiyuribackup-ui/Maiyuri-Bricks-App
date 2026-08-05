/**
 * Smart Quote page composition.
 *
 * The AI writes two things the customer page used to ignore:
 *   copy_map    — per-language copy keyed "<page>.<slot>" (entry.hero_headline…)
 *   page_config — which pages to show and which blocks within each
 *
 * These helpers turn that into render decisions. The overriding rule is
 * BACKWARD COMPATIBILITY: quotes generated before this existed have an empty or
 * partial page_config, and they must keep rendering in full rather than
 * collapsing to a blank page. So "no config" always means "show everything".
 */

import type {
  SmartQuoteCopyMap,
  SmartQuoteLanguage,
  SmartQuotePageConfig,
  SmartQuotePageKey,
} from "@maiyuri/shared";

/**
 * Blocks the customer page gates a whole section on. If one of these ever
 * drops out of the AI's default block set, that section silently disappears
 * from every quote that falls back to defaults — so a test asserts the two
 * stay in sync (smart-quote-page.test.ts).
 */
export const SECTION_GATING_BLOCKS: Record<SmartQuotePageKey, string[]> = {
  entry: ["belief_breaker", "trust_anchor"],
  climate: ["chennai_logic"],
  cost: ["soft_compare"],
  objection: ["top_objection_answer"],
  cta: [],
};

/** True when the AI produced a usable page_config; false → render everything. */
export function hasPageConfig(
  config: SmartQuotePageConfig | null | undefined,
): boolean {
  return Array.isArray(config?.pages) && (config?.pages.length ?? 0) > 0;
}

/**
 * Should this page appear at all?
 * Unconfigured quotes show every page (see module note).
 */
export function showPage(
  config: SmartQuotePageConfig | null | undefined,
  page: SmartQuotePageKey,
): boolean {
  if (!hasPageConfig(config)) return true;
  return (config as SmartQuotePageConfig).pages.some((p) => p.key === page);
}

/**
 * Should this block within a page appear?
 * Unconfigured quotes, and pages whose block list is empty or missing, show
 * every block — an AI that returned a page but no blocks still means "show it".
 */
export function showBlock(
  config: SmartQuotePageConfig | null | undefined,
  page: SmartQuotePageKey,
  block: string,
): boolean {
  if (!hasPageConfig(config)) return true;
  const entry = (config as SmartQuotePageConfig).pages.find(
    (p) => p.key === page,
  );
  if (!entry) return false; // page itself was dropped
  if (!Array.isArray(entry.blocks) || entry.blocks.length === 0) return true;
  return entry.blocks.includes(block);
}

/**
 * Read AI copy for a key, falling back to the supplied brand default.
 * Blank/whitespace AI values fall back too — a stray empty string from the
 * model must never blank out a headline on a customer-facing page.
 */
export function makeCopyReader(
  copyMap: SmartQuoteCopyMap | null | undefined,
  language: SmartQuoteLanguage,
) {
  const table = copyMap?.[language] ?? {};
  return function getCopy(key: string, fallback = ""): string {
    const value = table[key];
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  };
}
