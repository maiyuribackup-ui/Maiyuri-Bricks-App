/**
 * Tests for Issues #2-6: Lead Management Features
 * - Issue #2: Auto-archive lost leads
 * - Issue #3: Lead classification field
 * - Issue #4: Requirement type field
 * - Issue #5: Site region and location fields
 * - Issue #6: Updated source options
 */

import { describe, it, expect, vi } from "vitest";
import {
  createLeadSchema,
  updateLeadSchema,
  leadClassificationSchema,
  requirementTypeSchema,
  leadStatusSchema,
} from "@maiyuri/shared";

// Mock Supabase
const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  insert: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  single: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: mockSupabase,
}));

describe("Issue #2: Auto-archive Lost Leads", () => {
  describe("Lead Status Schema", () => {
    it("should accept valid status values", () => {
      const validStatuses = [
        "new",
        "follow_up",
        "hot",
        "cold",
        "converted",
        "lost",
      ];
      validStatuses.forEach((status) => {
        const result = leadStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid status values", () => {
      const result = leadStatusSchema.safeParse("invalid_status");
      expect(result.success).toBe(false);
    });
  });

  describe("Update Lead Schema with Archive Fields", () => {
    it("should accept status change to lost", () => {
      const result = updateLeadSchema.safeParse({
        status: "lost",
      });
      expect(result.success).toBe(true);
    });

    it("should accept is_archived field", () => {
      const result = updateLeadSchema.safeParse({
        status: "lost",
        is_archived: true,
      });
      expect(result.success).toBe(true);
    });

    it("should accept archived_at timestamp", () => {
      const result = updateLeadSchema.safeParse({
        status: "lost",
        is_archived: true,
        archived_at: "2026-01-17T10:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("should accept archive_reason", () => {
      const result = updateLeadSchema.safeParse({
        status: "lost",
        is_archived: true,
        archive_reason: "Auto-archived: Lead marked as lost",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Issue #3: Lead Classification", () => {
  describe("Classification Schema Validation", () => {
    it("should accept valid classification values", () => {
      const validClassifications = [
        "direct_customer",
        "vendor",
        "builder",
        "dealer",
        "architect",
      ];
      validClassifications.forEach((classification) => {
        const result = leadClassificationSchema.safeParse(classification);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(classification);
        }
      });
    });

    it("should reject invalid classification values", () => {
      const result = leadClassificationSchema.safeParse(
        "invalid_classification",
      );
      expect(result.success).toBe(false);
    });
  });

  describe("Create Lead with Classification", () => {
    it("should accept lead with classification", () => {
      const result = createLeadSchema.safeParse({
        name: "Test Lead",
        contact: "9876543210",
        source: "Facebook",
        lead_type: "Commercial",
        classification: "builder",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.classification).toBe("builder");
      }
    });

    it("should accept lead without classification (optional)", () => {
      const result = createLeadSchema.safeParse({
        name: "Test Lead",
        contact: "9876543210",
        source: "Google",
        lead_type: "Residential",
      });
      expect(result.success).toBe(true);
    });

    it("should accept null classification", () => {
      const result = createLeadSchema.safeParse({
        name: "Test Lead",
        contact: "9876543210",
        source: "Customer Reference",
        lead_type: "Commercial",
        classification: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Update Lead Classification", () => {
    it("should allow updating classification", () => {
      const result = updateLeadSchema.safeParse({
        classification: "dealer",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.classification).toBe("dealer");
      }
    });
  });
});

describe("Issue #4: Requirement Type", () => {
  describe("Requirement Type Schema Validation", () => {
    it("should accept valid requirement types", () => {
      const validTypes = [
        "residential_house",
        "commercial_building",
        "eco_friendly_building",
        "compound_wall",
      ];
      validTypes.forEach((type) => {
        const result = requirementTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(type);
        }
      });
    });

    it("should reject invalid requirement types", () => {
      const result = requirementTypeSchema.safeParse("apartment");
      expect(result.success).toBe(false);
    });
  });

  describe("Create Lead with Requirement Type", () => {
    it("should accept lead with requirement_type", () => {
      const result = createLeadSchema.safeParse({
        name: "Test Lead",
        contact: "9876543210",
        source: "Instagram",
        lead_type: "Residential",
        requirement_type: "residential_house",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requirement_type).toBe("residential_house");
      }
    });

    it("should accept eco-friendly building type", () => {
      const result = createLeadSchema.safeParse({
        name: "Eco Lead",
        contact: "9876543210",
        source: "Company Website",
        lead_type: "Residential",
        requirement_type: "eco_friendly_building",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requirement_type).toBe("eco_friendly_building");
      }
    });
  });
});

describe("Issue #5: Site Region and Location", () => {
  describe("Create Lead with Site Fields", () => {
    it("should accept lead with site_region", () => {
      const result = createLeadSchema.safeParse({
        name: "Regional Lead",
        contact: "9876543210",
        source: "Just Dial",
        lead_type: "Commercial",
        site_region: "Chennai",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.site_region).toBe("Chennai");
      }
    });

    it("should accept lead with site_location", () => {
      const result = createLeadSchema.safeParse({
        name: "Location Lead",
        contact: "9876543210",
        source: "IndiaMart",
        lead_type: "Residential",
        site_location: "T Nagar",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.site_location).toBe("T Nagar");
      }
    });

    it("should accept lead with both site_region and site_location", () => {
      const result = createLeadSchema.safeParse({
        name: "Full Location Lead",
        contact: "9876543210",
        source: "Walk-in",
        lead_type: "Commercial",
        site_region: "Kanchipuram",
        site_location: "Anna Nagar",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.site_region).toBe("Kanchipuram");
        expect(result.data.site_location).toBe("Anna Nagar");
      }
    });
  });

  describe("Update Lead Site Fields", () => {
    it("should allow updating site_region", () => {
      const result = updateLeadSchema.safeParse({
        site_region: "Coimbatore",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.site_region).toBe("Coimbatore");
      }
    });

    it("should allow setting site fields to null", () => {
      const result = updateLeadSchema.safeParse({
        site_region: null,
        site_location: null,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Issue #6: Source Options", () => {
  describe("Valid Source Values", () => {
    const validSources = [
      "Facebook",
      "Google",
      "Customer Reference",
      "Instagram",
      "Company Website",
      "Just Dial",
      "IndiaMart",
      "Walk-in",
      "Phone",
      "Other",
    ];

    validSources.forEach((source) => {
      it(`should accept "${source}" as a valid source`, () => {
        const result = createLeadSchema.safeParse({
          name: "Source Test Lead",
          contact: "9876543210",
          source: source,
          lead_type: "Commercial",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.source).toBe(source);
        }
      });
    });
  });

  describe("Source Field Validation", () => {
    it("should require source field", () => {
      const result = createLeadSchema.safeParse({
        name: "Test Lead",
        contact: "9876543210",
        lead_type: "Commercial",
        // source is missing
      });
      expect(result.success).toBe(false);
    });

    it("should require minimum length for source", () => {
      const result = createLeadSchema.safeParse({
        name: "Test Lead",
        contact: "9876543210",
        source: "",
        lead_type: "Commercial",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Combined Issues: Full Lead Creation", () => {
  it("should accept a complete lead with all new fields", () => {
    const result = createLeadSchema.safeParse({
      name: "Complete Test Lead",
      contact: "9876543210",
      source: "Facebook",
      lead_type: "Commercial",
      status: "new",
      classification: "builder",
      requirement_type: "commercial_building",
      site_region: "Chennai",
      site_location: "T Nagar",
      next_action: "Schedule site visit",
      follow_up_date: "2026-01-25",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Complete Test Lead");
      expect(result.data.source).toBe("Facebook");
      expect(result.data.classification).toBe("builder");
      expect(result.data.requirement_type).toBe("commercial_building");
      expect(result.data.site_region).toBe("Chennai");
      expect(result.data.site_location).toBe("T Nagar");
    }
  });

  it("should accept a minimal lead with only required fields", () => {
    const result = createLeadSchema.safeParse({
      name: "Minimal Lead",
      contact: "9876543210",
      source: "Google",
      lead_type: "Residential",
    });
    expect(result.success).toBe(true);
  });
});

describe("Update Lead Schema: Combined Fields", () => {
  it("should accept partial updates with any combination of fields", () => {
    const result = updateLeadSchema.safeParse({
      classification: "vendor",
      requirement_type: "residential_house",
      site_region: "Madurai",
      status: "hot",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.classification).toBe("vendor");
      expect(result.data.requirement_type).toBe("residential_house");
      expect(result.data.site_region).toBe("Madurai");
      expect(result.data.status).toBe("hot");
    }
  });
});
