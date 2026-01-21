/**
 * OdooSyncCard Component Tests
 *
 * Critical tests to prevent null safety issues (BUG-001, BUG-002)
 * These tests would have caught the toLocaleString crash before production.
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OdooSyncCard } from "./OdooSyncCard";

// Factory for creating test sync logs
function createTestSyncLog(
  overrides: Partial<Parameters<typeof OdooSyncCard>[0]["syncLog"]> = {},
) {
  return {
    id: "sync-123",
    sync_type: "quote_pull",
    status: "success",
    created_at: "2026-01-17T10:00:00Z",
    odoo_response: undefined,
    ...overrides,
  };
}

describe("OdooSyncCard", () => {
  describe("Null Safety (BUG-001, BUG-002)", () => {
    it("should render without crashing when odoo_response is undefined", () => {
      const syncLog = createTestSyncLog({ odoo_response: undefined });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should render without crashing when odoo_response is null", () => {
      const syncLog = createTestSyncLog({ odoo_response: null as any });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should render without crashing when quotes array is undefined", () => {
      const syncLog = createTestSyncLog({
        odoo_response: { quotes: undefined },
      });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should render without crashing when quotes array is empty", () => {
      const syncLog = createTestSyncLog({
        odoo_response: { quotes: [] },
      });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
      expect(
        screen.getByText("No quotes found for this lead in Odoo"),
      ).toBeInTheDocument();
    });

    it("should render without crashing when quote.amount is undefined", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "Q001", amount: undefined }],
        },
      });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
      // Should display ₹0 for undefined amount
      expect(screen.getByText("₹0")).toBeInTheDocument();
    });

    it("should render without crashing when quote.amount is null", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "Q001", amount: null as any }],
        },
      });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should render without crashing when quote is an empty object", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{}],
        },
      });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should handle quotes with only primitive values (legacy format)", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [123, "SO/001", null] as any[],
        },
      });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });
  });

  describe("Quote Display", () => {
    it("should display quote number from new format", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "S00123", amount: 50000 }],
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("S00123")).toBeInTheDocument();
    });

    it("should display quote number from legacy name field", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ name: "SO/00456", amount_total: 75000 }],
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("SO/00456")).toBeInTheDocument();
    });

    it("should display formatted amount in INR", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "Q001", amount: 125000 }],
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("₹1,25,000")).toBeInTheDocument();
    });

    it("should display quote state badge when present", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "Q001", amount: 50000, state: "draft" }],
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("draft")).toBeInTheDocument();
    });

    it("should display multiple quotes", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [
            { number: "Q001", amount: 50000 },
            { number: "Q002", amount: 75000 },
            { number: "Q003", amount: 100000 },
          ],
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("Found 3 quote(s):")).toBeInTheDocument();
      expect(screen.getByText("Q001")).toBeInTheDocument();
      expect(screen.getByText("Q002")).toBeInTheDocument();
      expect(screen.getByText("Q003")).toBeInTheDocument();
    });
  });

  describe("Amount Formatting", () => {
    it("should format large amounts correctly with Indian locale", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "Q001", amount: 10000000 }], // 1 crore
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("₹1,00,00,000")).toBeInTheDocument();
    });

    it("should handle zero amount", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "Q001", amount: 0 }],
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("₹0")).toBeInTheDocument();
    });

    it("should use amount_total if amount is not present (legacy format)", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ name: "Q001", amount_total: 85000 }],
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("₹85,000")).toBeInTheDocument();
    });
  });

  describe("Header and Metadata", () => {
    it("should display success badge", () => {
      const syncLog = createTestSyncLog();
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("Success")).toBeInTheDocument();
    });

    it("should display formatted sync date", () => {
      const syncLog = createTestSyncLog({
        created_at: "2026-01-17T14:30:00Z",
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      // Date format depends on locale, just check it renders without error
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should display latest quote info when present", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ number: "Q001", amount: 50000 }],
          latestQuote: "S00789",
          latestOrder: "SO/00123",
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText(/Latest: S00789/)).toBeInTheDocument();
      expect(screen.getByText(/Order: SO\/00123/)).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("should handle mixed valid and invalid quote objects", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [
            { number: "Q001", amount: 50000 },
            undefined as any,
            null as any,
            { name: "Q002" }, // No amount
            {},
          ],
        },
      });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should handle deeply nested undefined values", () => {
      const syncLog = {
        id: "sync-123",
        sync_type: "quote_pull",
        status: "success",
        created_at: "2026-01-17T10:00:00Z",
      } as any; // No odoo_response at all
      expect(() => render(<OdooSyncCard syncLog={syncLog} />)).not.toThrow();
    });

    it("should handle quote with only id (numeric reference)", () => {
      const syncLog = createTestSyncLog({
        odoo_response: {
          quotes: [{ id: 456 }] as any,
        },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText("#456")).toBeInTheDocument();
    });
  });
});
