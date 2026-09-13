import { describe, expect, it } from "vitest";
import { buildBaselineQuoteContent } from "../smart-quote-ai";

describe("quoting a lead we have not spoken to", () => {
  it("produces a usable quote with no transcript", () => {
    const r = buildBaselineQuoteContent();
    expect(r.strategy.page_config.pages.length).toBeGreaterThan(0);
    expect(Object.keys(r.copyMap.en ?? {}).length).toBeGreaterThan(0);
  });

  it("invents no persona, angle or objection", () => {
    const r = buildBaselineQuoteContent();
    expect(r.insights.persona).toBe("unknown");
    expect(r.insights.language_detected).toBe("unknown");
    expect(r.insights.primary_angle).toBeNull();
    expect(r.insights.secondary_angle).toBeNull();
    expect(r.insights.top_objections).toEqual([]);
    expect(r.insights.risk_flags).toEqual([]);
  });

  it("honours the lead's language preference", () => {
    expect(buildBaselineQuoteContent("ta").strategy.language_default).toBe("ta");
    expect(buildBaselineQuoteContent().strategy.language_default).toBe("en");
  });
});
