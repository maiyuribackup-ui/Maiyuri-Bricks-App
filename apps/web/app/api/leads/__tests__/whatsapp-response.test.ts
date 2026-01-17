/**
 * Tests for Issue #7: WhatsApp Business Auto-Response
 *
 * Note: Phone number formatting is now centralized in @maiyuri/shared/utils
 * See packages/shared/src/utils.test.ts for comprehensive phone formatting tests
 */

import { describe, it, expect } from "vitest";
import { normalizePhoneForWhatsApp, buildWhatsAppUrl } from "@maiyuri/shared";

// Test the phone number formatting using centralized utility
describe("WhatsApp Phone Number Formatting (via @maiyuri/shared)", () => {
  it("should add 91 prefix to 10-digit Indian numbers", () => {
    expect(normalizePhoneForWhatsApp("9876543210")).toBe("919876543210");
  });

  it("should handle numbers with spaces", () => {
    expect(normalizePhoneForWhatsApp("98765 43210")).toBe("919876543210");
  });

  it("should handle numbers with dashes", () => {
    expect(normalizePhoneForWhatsApp("987-654-3210")).toBe("919876543210");
  });

  it("should handle numbers starting with 0", () => {
    expect(normalizePhoneForWhatsApp("09876543210")).toBe("919876543210");
  });

  it("should preserve numbers already with country code", () => {
    expect(normalizePhoneForWhatsApp("919876543210")).toBe("919876543210");
  });

  it("should handle +91 prefix", () => {
    expect(normalizePhoneForWhatsApp("+919876543210")).toBe("919876543210");
  });
});

// Test the requirement label generation
describe("Requirement Type Labels", () => {
  function getRequirementLabel(
    requirementType: string | null | undefined,
  ): string {
    switch (requirementType) {
      case "residential_house":
        return "residential house";
      case "commercial_building":
        return "commercial building";
      case "eco_friendly_building":
        return "eco-friendly building";
      case "compound_wall":
        return "compound wall";
      default:
        return "construction";
    }
  }

  it("should return correct label for residential_house", () => {
    expect(getRequirementLabel("residential_house")).toBe("residential house");
  });

  it("should return correct label for commercial_building", () => {
    expect(getRequirementLabel("commercial_building")).toBe(
      "commercial building",
    );
  });

  it("should return correct label for eco_friendly_building", () => {
    expect(getRequirementLabel("eco_friendly_building")).toBe(
      "eco-friendly building",
    );
  });

  it("should return correct label for compound_wall", () => {
    expect(getRequirementLabel("compound_wall")).toBe("compound wall");
  });

  it('should return "construction" for null', () => {
    expect(getRequirementLabel(null)).toBe("construction");
  });

  it('should return "construction" for undefined', () => {
    expect(getRequirementLabel(undefined)).toBe("construction");
  });
});

// Test status-based message generation
describe("Status-Based Message Generation", () => {
  function getStatusGreeting(status: string): string {
    switch (status) {
      case "new":
        return "Thank you for your interest";
      case "follow_up":
        return "Following up";
      case "hot":
        return "Great news";
      case "cold":
        return "We hope you";
      case "converted":
        return "Thank you for choosing";
      case "lost":
        return "We appreciate";
      default:
        return "Thank you for reaching out";
    }
  }

  it("should generate appropriate greeting for new leads", () => {
    expect(getStatusGreeting("new")).toContain("Thank you for your interest");
  });

  it("should generate appropriate greeting for follow_up leads", () => {
    expect(getStatusGreeting("follow_up")).toContain("Following up");
  });

  it("should generate appropriate greeting for hot leads", () => {
    expect(getStatusGreeting("hot")).toContain("Great news");
  });

  it("should generate appropriate greeting for cold leads", () => {
    expect(getStatusGreeting("cold")).toContain("We hope you");
  });

  it("should generate appropriate greeting for converted leads", () => {
    expect(getStatusGreeting("converted")).toContain("Thank you for choosing");
  });

  it("should generate appropriate greeting for lost leads", () => {
    expect(getStatusGreeting("lost")).toContain("We appreciate");
  });
});

// Test WhatsApp URL generation using centralized utility
describe("WhatsApp URL Generation (via @maiyuri/shared)", () => {
  it("should generate valid WhatsApp URL with phone normalization", () => {
    // Note: buildWhatsAppUrl normalizes the phone number AND builds the URL
    const url = buildWhatsAppUrl("9876543210", "Hello");
    expect(url).toBe("https://wa.me/919876543210?text=Hello");
  });

  it("should encode special characters in message", () => {
    const url = buildWhatsAppUrl("9876543210", "Hello World!");
    expect(url).toContain("Hello%20World!");
  });

  it("should encode newlines in message", () => {
    const url = buildWhatsAppUrl("9876543210", "Line1\nLine2");
    expect(url).toContain("%0A");
  });

  it("should generate URL without message", () => {
    const url = buildWhatsAppUrl("9876543210");
    expect(url).toBe("https://wa.me/919876543210");
  });
});
