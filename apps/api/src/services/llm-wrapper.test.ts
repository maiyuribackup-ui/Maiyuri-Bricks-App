/**
 * Tests for LLM Wrapper with Observability
 */

import { describe, it, expect } from "vitest";
import { trackedLLMCall, trackedWorkflow } from "./llm-wrapper";

describe("LLM Wrapper", () => {
  describe("trackedLLMCall", () => {
    it("executes LLM function and returns result with usage stats", async () => {
      const mockResult = { text: "Hello, world!" };
      const mockUsage = { input_tokens: 100, output_tokens: 50 };

      const result = await trackedLLMCall(
        {
          agentType: "test-agent",
          model: "claude-sonnet-4-20250514",
          prompt: "Say hello",
        },
        async () => ({
          result: mockResult,
          usage: mockUsage,
        }),
      );

      expect(result.result).toEqual(mockResult);
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
      expect(result.usage.totalTokens).toBe(150);
      expect(result.traceId).toBeDefined();
      expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("uses provided traceId when given", async () => {
      const customTraceId = "custom-trace-123";

      const result = await trackedLLMCall(
        {
          traceId: customTraceId,
          agentType: "test-agent",
          model: "test-model",
          prompt: "Test prompt",
        },
        async () => ({
          result: "test",
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      );

      expect(result.traceId).toBe(customTraceId);
    });

    it("includes provider in result when provided", async () => {
      const result = await trackedLLMCall(
        {
          agentType: "test-agent",
          model: "test-model",
          prompt: "Test",
        },
        async () => ({
          result: "test",
          usage: { input_tokens: 10, output_tokens: 20 },
          provider: "gemini(fallback)",
        }),
      );

      expect(result.provider).toBe("gemini(fallback)");
    });

    it("propagates errors from LLM function", async () => {
      const testError = new Error("API rate limit exceeded");

      await expect(
        trackedLLMCall(
          {
            agentType: "test-agent",
            model: "test-model",
            prompt: "Test",
          },
          async () => {
            throw testError;
          },
        ),
      ).rejects.toThrow("API rate limit exceeded");
    });

    it("handles prompt object with system and user", async () => {
      const result = await trackedLLMCall(
        {
          agentType: "test-agent",
          model: "test-model",
          prompt: {
            system: "You are a helpful assistant",
            user: "Hello",
          },
        },
        async () => ({
          result: "Hi there!",
          usage: { input_tokens: 15, output_tokens: 5 },
        }),
      );

      expect(result.result).toBe("Hi there!");
    });

    it("calculates cost based on model and tokens", async () => {
      const result = await trackedLLMCall(
        {
          agentType: "test-agent",
          model: "claude-sonnet-4-20250514",
          prompt: "Test",
        },
        async () => ({
          result: "test",
          usage: { input_tokens: 1000, output_tokens: 500 },
        }),
      );

      // Cost should be calculated: (1000 * 0.003 + 500 * 0.015) / 1000 = 0.0105
      expect(result.usage.cost).toBeCloseTo(0.0105, 6);
    });
  });

  describe("trackedWorkflow", () => {
    it("aggregates usage from multiple steps", async () => {
      const result = await trackedWorkflow(
        {
          agentType: "lead-manager",
          leadId: "lead-123",
        },
        async (traceId) => ({
          result: { summary: "test", score: 0.8 },
          steps: [
            {
              name: "summarize",
              usage: {
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                cost: 0.001,
                latencyMs: 500,
              },
            },
            {
              name: "score",
              usage: {
                inputTokens: 80,
                outputTokens: 30,
                totalTokens: 110,
                cost: 0.0008,
                latencyMs: 300,
              },
            },
          ],
        }),
      );

      expect(result.totalUsage.inputTokens).toBe(180);
      expect(result.totalUsage.outputTokens).toBe(80);
      expect(result.totalUsage.totalTokens).toBe(260);
      expect(result.totalUsage.cost).toBeCloseTo(0.0018, 6);
      expect(result.traceId).toBeDefined();
    });

    it("provides traceId to workflow function for correlation", async () => {
      let receivedTraceId: string | null = null;

      await trackedWorkflow(
        {
          traceId: "workflow-trace-456",
          agentType: "test-workflow",
        },
        async (traceId) => {
          receivedTraceId = traceId;
          return {
            result: "done",
            steps: [],
          };
        },
      );

      expect(receivedTraceId).toBe("workflow-trace-456");
    });

    it("propagates errors from workflow function", async () => {
      await expect(
        trackedWorkflow(
          {
            agentType: "test-workflow",
          },
          async () => {
            throw new Error("Workflow step failed");
          },
        ),
      ).rejects.toThrow("Workflow step failed");
    });

    it("generates traceId if not provided", async () => {
      const result = await trackedWorkflow(
        {
          agentType: "test-workflow",
        },
        async (traceId) => ({
          result: "done",
          steps: [],
        }),
      );

      expect(result.traceId).toBeDefined();
      expect(result.traceId.length).toBeGreaterThan(0);
    });
  });
});
