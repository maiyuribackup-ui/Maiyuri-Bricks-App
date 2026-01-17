import { describe, it, expect } from "vitest";
import {
  normalizePhoneForWhatsApp,
  formatPhoneDisplay,
  buildWhatsAppUrl,
} from "./utils";

describe("normalizePhoneForWhatsApp", () => {
  it("should add 91 prefix to 10-digit numbers", () => {
    expect(normalizePhoneForWhatsApp("9876543210")).toBe("919876543210");
  });

  it("should handle numbers with spaces", () => {
    expect(normalizePhoneForWhatsApp("98765 43210")).toBe("919876543210");
  });

  it("should handle numbers with dashes", () => {
    expect(normalizePhoneForWhatsApp("98765-43210")).toBe("919876543210");
  });

  it("should handle numbers with +91 prefix", () => {
    expect(normalizePhoneForWhatsApp("+91 98765 43210")).toBe("919876543210");
  });

  it("should handle numbers with 91 prefix (no +)", () => {
    expect(normalizePhoneForWhatsApp("91-9876543210")).toBe("919876543210");
  });

  it("should handle numbers starting with 0", () => {
    expect(normalizePhoneForWhatsApp("09876543210")).toBe("919876543210");
  });

  it("should preserve already correctly formatted numbers", () => {
    expect(normalizePhoneForWhatsApp("919876543210")).toBe("919876543210");
  });

  it("should handle custom country code", () => {
    expect(normalizePhoneForWhatsApp("1234567890", "1")).toBe("11234567890");
  });

  it("should handle mixed formatting", () => {
    expect(normalizePhoneForWhatsApp("+91 (987) 654-3210")).toBe(
      "919876543210",
    );
  });
});

describe("formatPhoneDisplay", () => {
  it("should format 12-digit Indian numbers with +91", () => {
    expect(formatPhoneDisplay("919876543210")).toBe("+91 98765 43210");
  });

  it("should format 10-digit numbers without country code", () => {
    expect(formatPhoneDisplay("9876543210")).toBe("98765 43210");
  });

  it("should return original for unrecognized formats", () => {
    expect(formatPhoneDisplay("12345")).toBe("12345");
  });

  it("should handle input with non-digits", () => {
    expect(formatPhoneDisplay("+91 98765 43210")).toBe("+91 98765 43210");
  });
});

describe("buildWhatsAppUrl", () => {
  it("should build basic URL with normalized phone", () => {
    expect(buildWhatsAppUrl("9876543210")).toBe("https://wa.me/919876543210");
  });

  it("should build URL with message", () => {
    expect(buildWhatsAppUrl("9876543210", "Hello!")).toBe(
      "https://wa.me/919876543210?text=Hello!",
    );
  });

  it("should encode message properly", () => {
    expect(buildWhatsAppUrl("9876543210", "Hello World!")).toBe(
      "https://wa.me/919876543210?text=Hello%20World!",
    );
  });

  it("should handle special characters in message", () => {
    const url = buildWhatsAppUrl("9876543210", "Price: ₹1,000");
    expect(url).toContain("text=");
    expect(url).toContain("wa.me/919876543210");
  });

  it("should work with already formatted numbers", () => {
    expect(buildWhatsAppUrl("+91 98765 43210")).toBe(
      "https://wa.me/919876543210",
    );
  });
});
