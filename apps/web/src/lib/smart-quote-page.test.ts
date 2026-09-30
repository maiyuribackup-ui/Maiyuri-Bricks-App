import { describe, expect, it } from "vitest";
import type { SmartQuotePageConfig, SmartQuotePageKey } from "@maiyuri/shared";
import { getDefaultBlocks } from "./smart-quote-ai";
import {
  hasPageConfig,
  makeCopyReader,
  SECTION_GATING_BLOCKS,
  showBlock,
  showPage,
} from "./smart-quote-page";

const FULL: SmartQuotePageConfig = {
  pages: [
    { key: "entry", blocks: ["hero_headline", "belief_breaker"] },
    { key: "climate", blocks: ["chennai_logic"] },
    { key: "cost", blocks: ["range_frame", "soft_compare"] },
  ],
};

describe("hasPageConfig", () => {
  it("is false for null, undefined and an empty page list", () => {
    expect(hasPageConfig(null)).toBe(false);
    expect(hasPageConfig(undefined)).toBe(false);
    expect(hasPageConfig({ pages: [] })).toBe(false);
  });

  it("is true once the AI supplied pages", () => {
    expect(hasPageConfig(FULL)).toBe(true);
  });
});

describe("showPage — backward compatibility is the critical case", () => {
  it("shows EVERY page when a quote predates page_config", () => {
    for (const page of ["entry", "climate", "cost", "objection", "cta"] as const) {
      expect(showPage(null, page)).toBe(true);
      expect(showPage({ pages: [] }, page)).toBe(true);
    }
  });

  it("shows only the pages the AI chose", () => {
    expect(showPage(FULL, "entry")).toBe(true);
    expect(showPage(FULL, "cost")).toBe(true);
    expect(showPage(FULL, "objection")).toBe(false);
    expect(showPage(FULL, "cta")).toBe(false);
  });
});

describe("showBlock", () => {
  it("shows every block for an unconfigured quote", () => {
    expect(showBlock(null, "entry", "hero_headline")).toBe(true);
    expect(showBlock(undefined, "cost", "anything_at_all")).toBe(true);
  });

  it("respects the AI's block list", () => {
    expect(showBlock(FULL, "entry", "hero_headline")).toBe(true);
    expect(showBlock(FULL, "entry", "belief_breaker")).toBe(true);
    expect(showBlock(FULL, "entry", "trust_anchor")).toBe(false);
    expect(showBlock(FULL, "cost", "soft_compare")).toBe(true);
    expect(showBlock(FULL, "cost", "drivers")).toBe(false);
  });

  it("hides blocks of a page the AI dropped entirely", () => {
    expect(showBlock(FULL, "objection", "top_objection_answer")).toBe(false);
  });

  it("shows all blocks when a page was returned with no block list", () => {
    const sparse: SmartQuotePageConfig = {
      pages: [{ key: "entry", blocks: [] }],
    };
    expect(showBlock(sparse, "entry", "hero_headline")).toBe(true);
    expect(showBlock(sparse, "entry", "trust_anchor")).toBe(true);
  });
});

describe("the page's gating blocks must exist in the AI's defaults", () => {
  // Regression guard: `soft_compare` was missing from the cost defaults, which
  // would have silently removed the wall-cost comparison from every quote once
  // the page started honouring page_config.
  const pages = Object.keys(SECTION_GATING_BLOCKS) as SmartQuotePageKey[];

  for (const page of pages) {
    for (const block of SECTION_GATING_BLOCKS[page]) {
      it(`default blocks for "${page}" include "${block}"`, () => {
        expect(getDefaultBlocks(page)).toContain(block);
      });
    }
  }
});

describe("makeCopyReader", () => {
  const copyMap = {
    en: { "entry.hero_headline": "Built for your plot", "entry.blank": "   " },
    ta: { "entry.hero_headline": "உங்கள் மனைக்காக" },
  };

  it("returns AI copy for the active language", () => {
    expect(makeCopyReader(copyMap, "en")("entry.hero_headline", "fb")).toBe(
      "Built for your plot",
    );
    expect(makeCopyReader(copyMap, "ta")("entry.hero_headline", "fb")).toBe(
      "உங்கள் மனைக்காக",
    );
  });

  it("falls back when the key is missing", () => {
    expect(makeCopyReader(copyMap, "en")("entry.missing", "brand default")).toBe(
      "brand default",
    );
  });

  it("falls back on blank AI copy rather than blanking the page", () => {
    expect(makeCopyReader(copyMap, "en")("entry.blank", "brand default")).toBe(
      "brand default",
    );
  });

  it("falls back for a language the AI did not write", () => {
    expect(makeCopyReader({ en: {}, ta: {} }, "ta")("entry.hero_headline", "fb")).toBe("fb");
    expect(makeCopyReader(null, "en")("entry.hero_headline", "fb")).toBe("fb");
  });

  it("trims surrounding whitespace from AI copy", () => {
    const reader = makeCopyReader({ en: { k: "  spaced  " }, ta: {} }, "en");
    expect(reader("k", "fb")).toBe("spaced");
  });
});
