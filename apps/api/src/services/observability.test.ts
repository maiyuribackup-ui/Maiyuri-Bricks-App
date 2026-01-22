/**
 * Tests for AI Observability Service
 */

import { describe, it, expect } from "vitest";
import {
  isLangfuseEnabled,
  calculateCost,
  MODEL_PRICING,
} from "./observability";

describe("Observability Service", () => {
  describe("isLangfuseEnabled", () => {
    it("checks for required environment variables", () => {
      // This test verifies the function exists and returns a boolean
      const result = isLangfuseEnabled();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("calculateCost", () => {
    it("calculates cost correctly for Claude Sonnet", () => {
      const cost = calculateCost("claude-sonnet-4-20250514", 1000, 500);

      // Expected: (1000 * 0.003 + 500 * 0.015) / 1000 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it("calculates cost correctly for Gemini Flash", () => {
      const cost = calculateCost("gemini-2.5-flash-preview-05-20", 10000, 5000);

      // Expected: (10000 * 0.000075 + 5000 * 0.0003) / 1000 = 0.00225
      expect(cost).toBeCloseTo(0.00225, 6);
    });

    it("uses default pricing for unknown models", () => {
      const cost = calculateCost("unknown-model-xyz", 1000, 500);

      // Expected: (1000 * 0.001 + 500 * 0.002) / 1000 = 0.002
      expect(cost).toBeCloseTo(0.002, 6);
    });

    it("handles zero tokens correctly", () => {
      const cost = calculateCost("claude-sonnet-4-20250514", 0, 0);
      expect(cost).toBe(0);
    });

    it("handles large token counts", () => {
      const cost = calculateCost("claude-sonnet-4-20250514", 100000, 50000);

      // Expected: (100000 * 0.003 + 50000 * 0.015) / 1000 = 1.05
      expect(cost).toBeCloseTo(1.05, 4);
    });

    it("calculates cost correctly for GPT-4o", () => {
      const cost = calculateCost("gpt-4o", 1000, 500);

      // Expected: (1000 * 0.005 + 500 * 0.015) / 1000 = 0.0125
      expect(cost).toBeCloseTo(0.0125, 6);
    });

    it("calculates cost correctly for Claude Haiku (cheapest)", () => {
      const cost = calculateCost("claude-3-haiku-20240307", 10000, 5000);

      // Expected: (10000 * 0.00025 + 5000 * 0.00125) / 1000 = 0.00875
      expect(cost).toBeCloseTo(0.00875, 6);
    });
  });

  describe("MODEL_PRICING", () => {
    it("has pricing for Claude models", () => {
      expect(MODEL_PRICING["claude-sonnet-4-20250514"]).toBeDefined();
      expect(MODEL_PRICING["claude-sonnet-4-20250514"].input).toBe(0.003);
      expect(MODEL_PRICING["claude-sonnet-4-20250514"].output).toBe(0.015);

      expect(MODEL_PRICING["claude-3-opus-20240229"]).toBeDefined();
      expect(MODEL_PRICING["claude-3-haiku-20240307"]).toBeDefined();
    });

    it("has pricing for Gemini models", () => {
      expect(MODEL_PRICING["gemini-2.5-flash-preview-05-20"]).toBeDefined();
      expect(MODEL_PRICING["gemini-2.5-pro"]).toBeDefined();
      expect(MODEL_PRICING["gemini-1.5-flash"]).toBeDefined();
    });

    it("has pricing for OpenAI models", () => {
      expect(MODEL_PRICING["gpt-4o"]).toBeDefined();
      expect(MODEL_PRICING["gpt-4o-mini"]).toBeDefined();
      expect(MODEL_PRICING["gpt-4-turbo"]).toBeDefined();
    });

    it("has default fallback pricing", () => {
      expect(MODEL_PRICING["default"]).toBeDefined();
      expect(MODEL_PRICING["default"].input).toBeGreaterThan(0);
      expect(MODEL_PRICING["default"].output).toBeGreaterThan(0);
    });

    it("Haiku is cheaper than Sonnet which is cheaper than Opus", () => {
      const haiku = MODEL_PRICING["claude-3-haiku-20240307"];
      const sonnet = MODEL_PRICING["claude-sonnet-4-20250514"];
      const opus = MODEL_PRICING["claude-3-opus-20240229"];

      expect(haiku.input).toBeLessThan(sonnet.input);
      expect(sonnet.input).toBeLessThan(opus.input);
    });
  });
});
