import { describe, expect, it } from "vitest";
import {
  isQuoteExpired,
  quoteValidUntilDate,
  shouldRenewQuoteValidity,
} from "./smart-quote-validity";

describe("smart quote validity", () => {
  const now = new Date("2026-08-27T10:00:00.000Z");

  it("treats yesterday as expired", () => {
    expect(isQuoteExpired("2026-08-26", now)).toBe(true);
    expect(shouldRenewQuoteValidity("2026-08-26", now)).toBe(true);
  });

  it("keeps today and future dates valid", () => {
    expect(isQuoteExpired("2026-08-27", now)).toBe(false);
    expect(isQuoteExpired("2026-09-01", now)).toBe(false);
    expect(shouldRenewQuoteValidity("2026-08-27", now)).toBe(false);
  });

  it("renews missing validity dates", () => {
    expect(shouldRenewQuoteValidity(null, now)).toBe(true);
    expect(shouldRenewQuoteValidity(undefined, now)).toBe(true);
  });

  it("computes the next validity date from settings", () => {
    expect(quoteValidUntilDate(15, now)).toBe("2026-09-11");
  });
});
