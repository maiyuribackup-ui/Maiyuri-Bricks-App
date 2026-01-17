/**
 * Tests for Issue #9: Auto-create lead from Telegram voice messages
 *
 * Tests the lead extraction logic from call transcriptions.
 */

import { describe, it, expect } from "vitest";

// Test the lead extraction logic
describe("Lead Extraction from Transcription", () => {
  // Helper function to extract lead info (mirrors the API logic)
  function extractLeadInfo(transcription: string, phoneNumber?: string) {
    const lowerText = transcription.toLowerCase();
    const missingFields: string[] = [];

    // Extract name
    let name: string | null = null;
    const namePatterns = [
      /(?:my name is|i am|this is|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:name[:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:speaking|calling)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    ];
    for (const pattern of namePatterns) {
      const match = transcription.match(pattern);
      if (match) {
        name = match[1].trim();
        break;
      }
    }

    // Extract lead type
    let lead_type: string | null = null;
    if (
      lowerText.includes("commercial") ||
      lowerText.includes("office") ||
      lowerText.includes("shop")
    ) {
      lead_type = "Commercial";
    } else if (
      lowerText.includes("residential") ||
      lowerText.includes("house") ||
      lowerText.includes("home")
    ) {
      lead_type = "Residential";
    } else if (
      lowerText.includes("industrial") ||
      lowerText.includes("factory") ||
      lowerText.includes("warehouse")
    ) {
      lead_type = "Industrial";
    } else if (
      lowerText.includes("government") ||
      lowerText.includes("tender")
    ) {
      lead_type = "Government";
    }

    // Extract classification
    let classification: string | null = null;
    if (lowerText.includes("builder") || lowerText.includes("contractor")) {
      classification = "builder";
    } else if (
      lowerText.includes("dealer") ||
      lowerText.includes("distributor")
    ) {
      classification = "dealer";
    } else if (lowerText.includes("architect")) {
      classification = "architect";
    } else if (lowerText.includes("vendor") || lowerText.includes("supplier")) {
      classification = "vendor";
    } else {
      classification = "direct_customer";
    }

    // Extract requirement type
    let requirement_type: string | null = null;
    if (
      lowerText.includes("house") ||
      lowerText.includes("home") ||
      lowerText.includes("residential")
    ) {
      requirement_type = "residential_house";
    } else if (
      lowerText.includes("commercial") ||
      lowerText.includes("building") ||
      lowerText.includes("office")
    ) {
      requirement_type = "commercial_building";
    } else if (
      lowerText.includes("eco") ||
      lowerText.includes("green") ||
      lowerText.includes("sustainable")
    ) {
      requirement_type = "eco_friendly_building";
    } else if (
      lowerText.includes("compound") ||
      lowerText.includes("wall") ||
      lowerText.includes("boundary")
    ) {
      requirement_type = "compound_wall";
    }

    // Extract location
    let site_region: string | null = null;
    const regions = [
      "chennai",
      "coimbatore",
      "madurai",
      "salem",
      "trichy",
      "tirupur",
      "kanchipuram",
      "vellore",
    ];
    for (const region of regions) {
      if (lowerText.includes(region)) {
        site_region = region.charAt(0).toUpperCase() + region.slice(1);
        break;
      }
    }

    let site_location: string | null = null;
    const chennaiAreas = [
      "t nagar",
      "anna nagar",
      "adyar",
      "velachery",
      "porur",
      "ambattur",
      "tambaram",
    ];
    for (const area of chennaiAreas) {
      if (lowerText.includes(area)) {
        site_location = area
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        break;
      }
    }

    // Extract next action
    let next_action: string | null = null;
    if (lowerText.includes("visit") || lowerText.includes("come")) {
      next_action = "Schedule site visit";
    } else if (
      lowerText.includes("quote") ||
      lowerText.includes("price") ||
      lowerText.includes("cost")
    ) {
      next_action = "Prepare quotation";
    } else if (lowerText.includes("call") || lowerText.includes("discuss")) {
      next_action = "Follow-up call";
    } else if (lowerText.includes("sample")) {
      next_action = "Send product samples";
    }

    // Missing fields
    if (!name) missingFields.push("name");
    if (!phoneNumber) missingFields.push("contact");

    // Calculate confidence
    const totalFields = 8;
    const extractedCount = [
      name,
      lead_type,
      classification,
      requirement_type,
      site_region,
      site_location,
      next_action,
      phoneNumber,
    ].filter(Boolean).length;
    const confidence = Math.round((extractedCount / totalFields) * 100);

    return {
      name,
      contact: phoneNumber || null,
      source: "Telegram",
      lead_type,
      classification,
      requirement_type,
      site_region,
      site_location,
      next_action,
      missingFields,
      confidence,
    };
  }

  describe("Name Extraction", () => {
    it('should extract name from "My name is John Doe" pattern', () => {
      const result = extractLeadInfo(
        "Hello, my name is Rajesh Kumar and I need bricks",
        "9876543210",
      );
      expect(result.name).toBe("Rajesh Kumar");
    });

    it('should extract name from "I am John" pattern', () => {
      const result = extractLeadInfo(
        "Hi, I am Priya. I need bricks from Chennai",
        "9876543210",
      );
      expect(result.name).toBe("Priya");
    });

    it('should extract name from "This is John" pattern', () => {
      const result = extractLeadInfo(
        "Hello, this is Ramesh. Calling from Coimbatore",
        "9876543210",
      );
      expect(result.name).toBe("Ramesh");
    });

    it('should extract two-word name from "speaking" pattern', () => {
      const result = extractLeadInfo(
        "Speaking is Suresh Kumar about a project",
        "9876543210",
      );
      expect(result.name).toBe("Suresh Kumar");
    });

    it("should handle missing name gracefully", () => {
      const result = extractLeadInfo(
        "I need some bricks for my project",
        "9876543210",
      );
      expect(result.name).toBeNull();
      expect(result.missingFields).toContain("name");
    });
  });

  describe("Lead Type Extraction", () => {
    it("should identify Commercial leads", () => {
      const result = extractLeadInfo(
        "We are building a commercial complex in Chennai",
        "9876543210",
      );
      expect(result.lead_type).toBe("Commercial");
    });

    it("should identify Residential leads", () => {
      const result = extractLeadInfo(
        "I am building a house for my family",
        "9876543210",
      );
      expect(result.lead_type).toBe("Residential");
    });

    it("should identify Industrial leads", () => {
      const result = extractLeadInfo(
        "We need bricks for our factory construction",
        "9876543210",
      );
      expect(result.lead_type).toBe("Industrial");
    });

    it("should identify Government leads", () => {
      const result = extractLeadInfo(
        "This is a government tender project",
        "9876543210",
      );
      expect(result.lead_type).toBe("Government");
    });

    it("should handle office keyword as Commercial", () => {
      const result = extractLeadInfo("Building an office space", "9876543210");
      expect(result.lead_type).toBe("Commercial");
    });
  });

  describe("Classification Extraction", () => {
    it("should identify builders", () => {
      const result = extractLeadInfo(
        "I am a builder working on multiple projects",
        "9876543210",
      );
      expect(result.classification).toBe("builder");
    });

    it("should identify contractors", () => {
      const result = extractLeadInfo(
        "I am a contractor in Chennai",
        "9876543210",
      );
      expect(result.classification).toBe("builder");
    });

    it("should identify dealers", () => {
      const result = extractLeadInfo(
        "I am a dealer looking for bulk supply",
        "9876543210",
      );
      expect(result.classification).toBe("dealer");
    });

    it("should identify architects", () => {
      const result = extractLeadInfo(
        "I am an architect designing a project",
        "9876543210",
      );
      expect(result.classification).toBe("architect");
    });

    it("should default to direct_customer", () => {
      const result = extractLeadInfo(
        "I need bricks for my house",
        "9876543210",
      );
      expect(result.classification).toBe("direct_customer");
    });
  });

  describe("Requirement Type Extraction", () => {
    it("should identify residential house requirement", () => {
      const result = extractLeadInfo(
        "Building a house in Chennai",
        "9876543210",
      );
      expect(result.requirement_type).toBe("residential_house");
    });

    it("should identify commercial building requirement", () => {
      const result = extractLeadInfo(
        "Constructing a commercial building",
        "9876543210",
      );
      expect(result.requirement_type).toBe("commercial_building");
    });

    it("should identify eco-friendly building requirement", () => {
      const result = extractLeadInfo(
        "We want an eco-friendly sustainable construction",
        "9876543210",
      );
      expect(result.requirement_type).toBe("eco_friendly_building");
    });

    it("should identify compound wall requirement", () => {
      const result = extractLeadInfo(
        "Need bricks for compound wall",
        "9876543210",
      );
      expect(result.requirement_type).toBe("compound_wall");
    });
  });

  describe("Location Extraction", () => {
    it("should extract Chennai as site region", () => {
      const result = extractLeadInfo("Project is in Chennai", "9876543210");
      expect(result.site_region).toBe("Chennai");
    });

    it("should extract Coimbatore as site region", () => {
      const result = extractLeadInfo(
        "Building in Coimbatore area",
        "9876543210",
      );
      expect(result.site_region).toBe("Coimbatore");
    });

    it("should extract Madurai as site region", () => {
      const result = extractLeadInfo("Location is Madurai", "9876543210");
      expect(result.site_region).toBe("Madurai");
    });

    it("should extract T Nagar as site location", () => {
      const result = extractLeadInfo(
        "Project location is T Nagar in Chennai",
        "9876543210",
      );
      expect(result.site_location).toBe("T Nagar");
    });

    it("should extract Anna Nagar as site location", () => {
      const result = extractLeadInfo("Building in Anna Nagar", "9876543210");
      expect(result.site_location).toBe("Anna Nagar");
    });
  });

  describe("Next Action Extraction", () => {
    it("should identify site visit action", () => {
      const result = extractLeadInfo(
        "Can you come and visit the site?",
        "9876543210",
      );
      expect(result.next_action).toBe("Schedule site visit");
    });

    it("should identify quotation action", () => {
      const result = extractLeadInfo(
        "Please send me a quote for 10000 bricks",
        "9876543210",
      );
      expect(result.next_action).toBe("Prepare quotation");
    });

    it("should identify price inquiry action", () => {
      const result = extractLeadInfo(
        "What is the price per brick?",
        "9876543210",
      );
      expect(result.next_action).toBe("Prepare quotation");
    });

    it("should identify sample request action", () => {
      const result = extractLeadInfo("Can you send me a sample?", "9876543210");
      expect(result.next_action).toBe("Send product samples");
    });

    it("should identify follow-up call action", () => {
      const result = extractLeadInfo(
        "Can you call me back tomorrow to discuss?",
        "9876543210",
      );
      expect(result.next_action).toBe("Follow-up call");
    });
  });

  describe("Confidence Calculation", () => {
    it("should calculate high confidence for complete information", () => {
      const result = extractLeadInfo(
        "My name is Rajesh Kumar, I am a builder in Chennai T Nagar. I need a quote for a commercial building project.",
        "9876543210",
      );
      expect(result.confidence).toBeGreaterThanOrEqual(75);
      expect(result.missingFields).toHaveLength(0);
    });

    it("should calculate low confidence for minimal information", () => {
      const result = extractLeadInfo("I need bricks", "9876543210");
      expect(result.confidence).toBeLessThan(50);
    });

    it("should add name to missing fields when not found", () => {
      const result = extractLeadInfo("Need bricks for house", "9876543210");
      expect(result.missingFields).toContain("name");
    });

    it("should add contact to missing fields when phone not provided", () => {
      const result = extractLeadInfo("My name is John, need bricks");
      expect(result.missingFields).toContain("contact");
    });
  });

  describe("Source Attribution", () => {
    it("should always set source to Telegram", () => {
      const result = extractLeadInfo("Any transcription text", "9876543210");
      expect(result.source).toBe("Telegram");
    });
  });
});

// Test the NAME: command parsing
describe("NAME Command Parsing", () => {
  function parseNameCommand(text: string): string | null {
    const match = text.match(/^(?:NAME|name|Name)[:\s]+(.+)$/i);
    return match ? match[1].trim() : null;
  }

  it('should parse "NAME: John Doe"', () => {
    expect(parseNameCommand("NAME: John Doe")).toBe("John Doe");
  });

  it('should parse "name: rajesh kumar"', () => {
    expect(parseNameCommand("name: rajesh kumar")).toBe("rajesh kumar");
  });

  it('should parse "Name: Priya"', () => {
    expect(parseNameCommand("Name: Priya")).toBe("Priya");
  });

  it('should parse "NAME John" (without colon)', () => {
    expect(parseNameCommand("NAME John")).toBe("John");
  });

  it("should return null for non-name commands", () => {
    expect(parseNameCommand("Hello, I need help")).toBeNull();
    expect(parseNameCommand("Random text")).toBeNull();
  });

  it("should handle leading/trailing whitespace", () => {
    expect(parseNameCommand("NAME:   John Doe   ")).toBe("John Doe");
  });
});

// Test phone number handling
describe("Phone Number Handling", () => {
  function formatPhoneForWhatsApp(phone: string): string {
    let digits = phone.replace(/\D/g, "");
    if (digits.length === 10) {
      digits = "91" + digits;
    } else if (digits.startsWith("0")) {
      digits = "91" + digits.substring(1);
    }
    return digits;
  }

  it("should add 91 prefix to 10-digit numbers", () => {
    expect(formatPhoneForWhatsApp("9876543210")).toBe("919876543210");
  });

  it("should preserve existing 91 prefix", () => {
    expect(formatPhoneForWhatsApp("919876543210")).toBe("919876543210");
  });

  it("should remove leading 0 and add 91", () => {
    expect(formatPhoneForWhatsApp("09876543210")).toBe("919876543210");
  });

  it("should strip non-digit characters", () => {
    expect(formatPhoneForWhatsApp("+91 98765-43210")).toBe("919876543210");
  });
});
