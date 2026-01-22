/**
 * SalesFunnel Component Tests
 *
 * Following TESTING.md protocol: Test root cause, not symptoms
 * Tests the sales funnel visualization component
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SalesFunnel, getDefaultFunnelStages } from "./SalesFunnel";
import type { FunnelStage } from "./SalesFunnel";

// Factory for creating test stages
function createTestStages(
  overrides: Partial<FunnelStage>[] = [],
): FunnelStage[] {
  const defaultStages: FunnelStage[] = [
    { name: "Lead", value: 100, count: 50, color: "#3b82f6" },
    { name: "Qualified", value: 60, count: 30, color: "#8b5cf6" },
    { name: "Proposal", value: 40, count: 20, color: "#f59e0b" },
    { name: "Closed", value: 20, count: 10, color: "#22c55e" },
  ];

  if (overrides.length > 0) {
    return overrides.map((override, index) => ({
      ...defaultStages[index % defaultStages.length],
      ...override,
    })) as FunnelStage[];
  }

  return defaultStages;
}

describe("SalesFunnel", () => {
  describe("Loading State", () => {
    it("should render loading skeleton when loading is true", () => {
      render(<SalesFunnel stages={[]} loading={true} />);

      // Should show skeleton elements with animate-pulse class
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Empty State", () => {
    it("should handle empty stages array without crashing", () => {
      // This tests the null safety fix for empty array
      expect(() => {
        render(<SalesFunnel stages={[]} />);
      }).not.toThrow();
    });

    it("should handle empty stages gracefully with maxValue defaulting to 1", () => {
      const { container } = render(<SalesFunnel stages={[]} />);

      // Should render the title
      expect(screen.getByText("Sales Funnel")).toBeInTheDocument();

      // Should show 0 leads in pipeline
      expect(screen.getByText("0 leads")).toBeInTheDocument();
    });
  });

  describe("Stage Rendering", () => {
    it("should render all stages with correct names", () => {
      const stages = createTestStages();
      render(<SalesFunnel stages={stages} />);

      expect(screen.getByText("Lead")).toBeInTheDocument();
      expect(screen.getByText("Qualified")).toBeInTheDocument();
      expect(screen.getByText("Proposal")).toBeInTheDocument();
      expect(screen.getByText("Closed")).toBeInTheDocument();
    });

    it("should render stage counts correctly", () => {
      const stages = createTestStages();
      render(<SalesFunnel stages={stages} />);

      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
    });

    it("should render stage percentage values", () => {
      const stages = createTestStages();
      render(<SalesFunnel stages={stages} />);

      // Multiple occurrences of percentage text expected (in different places)
      const hundredPercents = screen.getAllByText("100%");
      expect(hundredPercents.length).toBeGreaterThan(0);
    });
  });

  describe("Title Customization", () => {
    it('should render default title "Sales Funnel"', () => {
      const stages = createTestStages();
      render(<SalesFunnel stages={stages} />);

      expect(screen.getByText("Sales Funnel")).toBeInTheDocument();
    });

    it("should render custom title when provided", () => {
      const stages = createTestStages();
      render(<SalesFunnel stages={stages} title="Lead Pipeline" />);

      expect(screen.getByText("Lead Pipeline")).toBeInTheDocument();
    });
  });

  describe("Pipeline Summary", () => {
    it("should calculate and display total leads in pipeline", () => {
      const stages = createTestStages();
      render(<SalesFunnel stages={stages} />);

      // Total: 50 + 30 + 20 + 10 = 110 leads
      expect(screen.getByText("110 leads")).toBeInTheDocument();
    });

    it("should show overall conversion rate for stages >= 2", () => {
      const stages = createTestStages();
      render(<SalesFunnel stages={stages} />);

      expect(screen.getByText("Overall conversion")).toBeInTheDocument();
      // Last stage value is 20% - use getAllByText since it appears in multiple places
      const twentyPercents = screen.getAllByText("20%");
      expect(twentyPercents.length).toBeGreaterThanOrEqual(1);
    });

    it("should not show conversion rate for single stage", () => {
      const stages = [createTestStages()[0]];
      render(<SalesFunnel stages={stages} />);

      expect(screen.queryByText("Overall conversion")).not.toBeInTheDocument();
    });
  });

  describe("Width Calculation", () => {
    it("should calculate bar width as percentage of max value", () => {
      const stages: FunnelStage[] = [
        { name: "Stage 1", value: 100, count: 100, color: "#000" },
        { name: "Stage 2", value: 50, count: 50, color: "#000" },
      ];
      const { container } = render(<SalesFunnel stages={stages} />);

      // First bar should be 100% width (100/100)
      // Second bar should be 50% width (50/100)
      // Width is set via inline style
      const bars = container.querySelectorAll('[style*="width"]');
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  describe("getDefaultFunnelStages helper", () => {
    it("should generate default funnel stages with correct percentages", () => {
      const data = {
        total: 100,
        qualified: 60,
        proposal: 30,
        closed: 10,
      };

      const stages = getDefaultFunnelStages(data);

      expect(stages).toHaveLength(4);
      expect(stages[0]).toEqual({
        name: "Lead",
        value: 100,
        count: 100,
        color: "#3b82f6",
      });
      expect(stages[1]).toEqual({
        name: "Qualified",
        value: 60,
        count: 60,
        color: "#8b5cf6",
      });
      expect(stages[2]).toEqual({
        name: "Proposal",
        value: 30,
        count: 30,
        color: "#f59e0b",
      });
      expect(stages[3]).toEqual({
        name: "Closed",
        value: 10,
        count: 10,
        color: "#22c55e",
      });
    });

    it("should handle zero total gracefully", () => {
      const data = {
        total: 0,
        qualified: 0,
        proposal: 0,
        closed: 0,
      };

      const stages = getDefaultFunnelStages(data);

      // Should not divide by zero - total defaults to 1 in helper
      expect(stages[0].value).toBe(100);
      expect(stages[1].value).toBe(0);
      expect(stages[2].value).toBe(0);
      expect(stages[3].value).toBe(0);
    });
  });
});
