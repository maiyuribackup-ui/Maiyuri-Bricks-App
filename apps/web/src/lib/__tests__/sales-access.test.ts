import { describe, expect, it } from "vitest";
import { canWorkOnLead, hasFullSalesAccess } from "../sales-access";

const lead = { assigned_staff: "owner-id", created_by: "creator-id" };

describe("sales access", () => {
  it("lets the sales-facing roles work on any lead", () => {
    for (const role of ["founder", "owner", "sales", "engineer"]) {
      expect(hasFullSalesAccess(role)).toBe(true);
      expect(canWorkOnLead(role, "someone-else", lead)).toBe(true);
    }
  });

  it("keeps back-office roles to their own leads", () => {
    for (const role of ["accountant", "driver", "production_supervisor"]) {
      expect(hasFullSalesAccess(role)).toBe(false);
      expect(canWorkOnLead(role, "someone-else", lead)).toBe(false);
      expect(canWorkOnLead(role, "owner-id", lead)).toBe(true);
      expect(canWorkOnLead(role, "creator-id", lead)).toBe(true);
    }
  });

  it("refuses when the role or lead is unknown", () => {
    expect(canWorkOnLead(null, "someone", lead)).toBe(false);
    expect(canWorkOnLead("accountant", "someone", null)).toBe(false);
    expect(canWorkOnLead("accountant", null, lead)).toBe(false);
  });
});
