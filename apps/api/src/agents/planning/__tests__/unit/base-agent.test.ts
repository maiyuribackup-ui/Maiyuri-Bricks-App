/**
 * BaseAgent Unit Tests
 *
 * Tests the template method pattern and common agent functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAgent, type BaseAgentConfig } from '../../agents/base-agent';
import type { DesignContext } from '../../types/design-context';
import type { AgentName } from '../../types/agent-result';

// Mock response queue
let mockResponseQueue: string[] = [];

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockImplementation(async () => {
        if (mockResponseQueue.length === 0) {
          throw new Error('No mock response available');
        }
        const responseText = mockResponseQueue.shift();
        return {
          id: `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: responseText }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 200,
          },
        };
      }),
    },
  })),
}));

/**
 * Create a mock design context
 */
function createMockContext(): DesignContext {
  return {
    sessionId: 'test-session-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'in_progress',
    currentAgent: null,
    openQuestions: [],
    assumptions: [],
    plot: { width: 40, depth: 60, area: 2400, unit: 'feet' },
    requirements: {
      bedrooms: 2,
      bathrooms: 2,
      hasPooja: true,
      hasParking: true,
      hasStore: false,
      hasServantRoom: false,
      floors: 2,
    },
  };
}

/**
 * Queue a mock response
 */
function mockClaudeResponse(response: unknown): void {
  mockResponseQueue.push(
    typeof response === 'string' ? response : JSON.stringify(response)
  );
}

/**
 * Test implementation of BaseAgent
 * Overrides validateOutput to skip schema validation for testing base class behavior
 */
class TestAgent extends BaseAgent<{ testInput: string }, { testOutput: string }> {
  readonly agentName: AgentName = 'diagram-interpreter';
  protected readonly systemPrompt = 'You are a test agent.';

  protected validateInput(input: { testInput: string }): void {
    if (!input.testInput) {
      throw new Error('testInput is required');
    }
  }

  protected buildPrompt(
    input: { testInput: string },
    _context: DesignContext
  ): string {
    return `Process this: ${input.testInput}`;
  }

  // Override to bypass schema validation for base agent testing
  protected validateOutput(data: unknown): { success: boolean; data?: { testOutput: string }; errors?: Array<{ path: string; message: string }> } {
    if (data && typeof data === 'object' && 'testOutput' in data) {
      return { success: true, data: data as { testOutput: string } };
    }
    return { success: false, errors: [{ path: 'testOutput', message: 'Missing testOutput' }] };
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    mockResponseQueue = [];
    agent = new TestAgent();
    mockContext = createMockContext();
  });

  describe('execute', () => {
    it('should return success result for valid response', async () => {
      mockClaudeResponse({
        testOutput: 'processed result',
        open_questions: [],
      });

      const result = await agent.execute({ testInput: 'test value' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.agentName).toBe('diagram-interpreter');
      // With mocked responses, execution may complete in 0ms
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.executionTimeMs).toBe('number');
    });

    it('should fail on input validation error', async () => {
      const result = await agent.execute({ testInput: '' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('testInput is required');
    });

    it('should extract open questions from response', async () => {
      mockClaudeResponse({
        testOutput: 'processed',
        open_questions: [
          {
            id: 'Q1',
            question: 'What is the width?',
            type: 'mandatory',
            reason: 'Unclear dimension',
          },
        ],
      });

      const result = await agent.execute({ testInput: 'test' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.openQuestions).toHaveLength(1);
      expect(result.openQuestions[0].questionId).toBe('Q1');
      expect(result.openQuestions[0].type).toBe('mandatory');
    });

    it('should extract assumptions from response', async () => {
      mockClaudeResponse({
        testOutput: 'processed',
        assumptions: [
          {
            assumption: 'Using Tamil Nadu building codes',
            risk: 'medium',
          },
        ],
      });

      const result = await agent.execute({ testInput: 'test' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.assumptions).toHaveLength(1);
      expect(result.assumptions[0].risk).toBe('medium');
    });

    it('should track token usage', async () => {
      mockClaudeResponse({ testOutput: 'result' });

      const result = await agent.execute({ testInput: 'test' }, mockContext);

      expect(result.tokensUsed.input).toBeGreaterThan(0);
      expect(result.tokensUsed.output).toBeGreaterThan(0);
      expect(result.tokensUsed.total).toBe(
        result.tokensUsed.input + result.tokensUsed.output
      );
    });

    it('should handle JSON parsing errors gracefully', async () => {
      mockClaudeResponse('invalid json {{{{');

      const result = await agent.execute({ testInput: 'test' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('parse');
    });
  });
});
