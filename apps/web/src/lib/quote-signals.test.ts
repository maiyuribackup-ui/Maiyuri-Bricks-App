import { describe, expect, it } from "vitest";
import {
  getQuoteSignal,
  isFollowUpOverdue,
  needsActionToday,
} from "./quote-signals";

const NOW = new Date("2026-08-02T10:00:00+05:30");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("getQuoteSignal — the four signals the team asked for", () => {
  it("'CTA clicked — call now' outranks everything", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(1), viewCount: 1, ctaClicked: true },
      NOW,
    );
    expect(s.key).toBe("cta_clicked");
    expect(s.action).toBe("Call now");
    expect(s.rank).toBe(4);
  });

  it("wins even for a brand-new quote opened once", () => {
    const clicked = getQuoteSignal(
      { createdAt: hoursAgo(0.2), viewCount: 1, ctaClicked: true },
      NOW,
    );
    expect(clicked.key).toBe("cta_clicked");
  });

  it("flags repeat opens with no CTA", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(48), viewCount: 3, ctaClicked: false },
      NOW,
    );
    expect(s.key).toBe("repeat_no_cta");
    expect(s.label).toContain("3×");
    expect(s.action).toMatch(/holding them/i);
  });

  it("does not flag repeat opens once the CTA was clicked", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(48), viewCount: 9, ctaClicked: true },
      NOW,
    );
    expect(s.key).toBe("cta_clicked");
  });

  it("flags a quote unopened after 24h", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(30), viewCount: 0, ctaClicked: false },
      NOW,
    );
    expect(s.key).toBe("unopened_24h");
    expect(s.action).toMatch(/resend/i);
  });

  it("reports the age in days once it has been sitting longer", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(72), viewCount: 0, ctaClicked: false },
      NOW,
    );
    expect(s.label).toBe("Not opened in 3d");
  });

  it("does NOT nag about a quote sent an hour ago", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(1), viewCount: 0, ctaClicked: false },
      NOW,
    );
    expect(s.key).toBe("just_sent");
    expect(s.rank).toBe(0);
  });

  it("treats exactly 24h as due for chasing", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(24), viewCount: 0, ctaClicked: false },
      NOW,
    );
    expect(s.key).toBe("unopened_24h");
  });

  it("marks a single open as merely opened", () => {
    const s = getQuoteSignal(
      { createdAt: hoursAgo(5), viewCount: 1, ctaClicked: false },
      NOW,
    );
    expect(s.key).toBe("opened");
    expect(s.rank).toBe(1);
  });
});

describe("needsActionToday", () => {
  it("includes clicked, repeat-no-CTA and unopened; excludes the rest", () => {
    const mk = (v: number, cta: boolean, ageH: number) =>
      needsActionToday(
        getQuoteSignal(
          { createdAt: hoursAgo(ageH), viewCount: v, ctaClicked: cta },
          NOW,
        ),
      );
    expect(mk(1, true, 1)).toBe(true); // clicked
    expect(mk(4, false, 40)).toBe(true); // repeat, no CTA
    expect(mk(0, false, 40)).toBe(true); // unopened 24h+
    expect(mk(1, false, 5)).toBe(false); // opened once
    expect(mk(0, false, 2)).toBe(false); // just sent
  });
});

describe("isFollowUpOverdue", () => {
  it("is false with no date", () => {
    expect(isFollowUpOverdue(null, NOW)).toBe(false);
    expect(isFollowUpOverdue(undefined, NOW)).toBe(false);
  });

  it("is false for today — a rep still has the day to do it", () => {
    expect(isFollowUpOverdue("2026-08-02", NOW)).toBe(false);
  });

  it("is true for yesterday and earlier", () => {
    expect(isFollowUpOverdue("2026-08-01", NOW)).toBe(true);
    expect(isFollowUpOverdue("2026-07-20", NOW)).toBe(true);
  });

  it("is false for a future date", () => {
    expect(isFollowUpOverdue("2026-08-05", NOW)).toBe(false);
  });

  it("ignores an unparseable date rather than crying overdue", () => {
    expect(isFollowUpOverdue("not-a-date", NOW)).toBe(false);
  });
});
