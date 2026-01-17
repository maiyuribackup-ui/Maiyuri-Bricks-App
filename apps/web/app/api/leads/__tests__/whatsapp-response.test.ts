/**
 * Tests for Issue #7: WhatsApp Business Auto-Response
 */

import { describe, it, expect } from "vitest";

// Test the phone number formatting logic
describe("WhatsApp Phone Number Formatting", () => {
  function formatPhoneForWhatsApp(contact: string): string {
    let phone = contact.replace(/\D/g, "");
    if (phone.length === 10) {
      phone = "91" + phone;
    } else if (phone.startsWith("0")) {
      phone = "91" + phone.substring(1);
    }
    return phone;
  }

  it("should add 91 prefix to 10-digit Indian numbers", () => {
    expect(formatPhoneForWhatsApp("9876543210")).toBe("919876543210");
  });

  it("should handle numbers with spaces", () => {
    expect(formatPhoneForWhatsApp("98765 43210")).toBe("919876543210");
  });

  it("should handle numbers with dashes", () => {
    expect(formatPhoneForWhatsApp("987-654-3210")).toBe("919876543210");
  });

  it("should handle numbers starting with 0", () => {
    expect(formatPhoneForWhatsApp("09876543210")).toBe("919876543210");
  });

  it("should preserve numbers already with country code", () => {
    expect(formatPhoneForWhatsApp("919876543210")).toBe("919876543210");
  });

  it("should handle +91 prefix", () => {
    expect(formatPhoneForWhatsApp("+919876543210")).toBe("919876543210");
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

// Test WhatsApp URL generation
describe("WhatsApp URL Generation", () => {
  function generateWhatsAppUrl(phone: string, message: string): string {
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${phone}?text=${encodedMessage}`;
  }

  it("should generate valid WhatsApp URL", () => {
    const url = generateWhatsAppUrl("919876543210", "Hello");
    expect(url).toBe("https://wa.me/919876543210?text=Hello");
  });

  it("should encode special characters in message", () => {
    const url = generateWhatsAppUrl("919876543210", "Hello World!");
    expect(url).toContain("Hello%20World!");
  });

  it("should encode newlines in message", () => {
    const url = generateWhatsAppUrl("919876543210", "Line1\nLine2");
    expect(url).toContain("%0A");
  });
});
