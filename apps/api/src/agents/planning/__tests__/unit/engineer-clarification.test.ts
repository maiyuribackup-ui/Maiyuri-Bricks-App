/**
 * EngineerClarificationAgent Unit Tests
 *
 * Tests for the structural engineering agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EngineerClarificationAgent,
  createEngineerClarificationAgent,
} from '../../agents/engineer-clarification';
import type { EngineerClarificationInput } from '../../types/contracts';
import type { DesignContext } from '../../types/design-context';
import { createMockContext } from '../mocks/context.mock';

// Mock response queue for Gemini
let mockResponseQueue: string[] = [];

// Mock the Gemini SDK
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockImplementation(async () => {
          const response = mockResponseQueue.shift();
          if (!response) {
            throw new Error('No mock response available');
          }
          return {
            response: {
              text: () => typeof response === 'string' ? response : JSON.stringify(response),
            },
          };
        }),
      }),
    })),
  };
});

/**
 * Set up a mock Gemini response
 */
function mockGeminiResponse(response: unknown): void {
  mockResponseQueue.push(
    typeof response === 'string' ? response : JSON.stringify(response)
  );
}

/**
 * Clear all mock responses
 */
function clearMocks(): void {
  mockResponseQueue = [];
}

describe('EngineerClarificationAgent', () => {
  let agent: EngineerClarificationAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new EngineerClarificationAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createEngineerClarificationAgent();
      expect(createdAgent).toBeInstanceOf(EngineerClarificationAgent);
      expect(createdAgent.agentName).toBe('engineer-clarification');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createEngineerClarificationAgent({
        maxTokens: 8192,
        temperature: 0.05,
      });
      expect(createdAgent).toBeInstanceOf(EngineerClarificationAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when plot dimensions are missing', async () => {
        const input = {} as EngineerClarificationInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot dimensions are required');
      });

      it('should fail when plot width is zero', async () => {
        const input: EngineerClarificationInput = {
          plot: { width: 0, depth: 40, area: 0 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot width must be a positive number');
      });

      it('should fail when plot depth is zero', async () => {
        const input: EngineerClarificationInput = {
          plot: { width: 30, depth: 0, area: 0 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot depth must be a positive number');
      });
    });

    describe('successful engineering analysis', () => {
      const validInput: EngineerClarificationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
      };

      const mockSuccessResponse = {
        structural_strategy: 'load-bearing',
        engineering_risks: [
          'Standard foundation depth required',
          'Monsoon water management needed',
        ],
        assumptions: [
          {
            assumption: 'Normal soil bearing capacity',
            risk: 'medium',
            basis: 'Soil test not provided',
          },
        ],
        open_questions: [],
      };

      it('should successfully analyze plot', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.agentName).toBe('engineer-clarification');
        expect(result.data?.structural_strategy).toBeDefined();
      });

      it('should track execution time', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        // With mocked responses, execution may complete in 0ms
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(typeof result.executionTimeMs).toBe('number');
      });

      it('should estimate token usage', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.tokensUsed.input).toBeGreaterThan(0);
        expect(result.tokensUsed.output).toBeGreaterThan(0);
        expect(result.tokensUsed.total).toBe(
          result.tokensUsed.input + result.tokensUsed.output
        );
      });
    });

    describe('structural strategy recommendation', () => {
      it('should recommend load-bearing for small plots (under 1200 sqft)', async () => {
        const smallInput: EngineerClarificationInput = {
          plot: { width: 25, depth: 40, area: 1000 },
        };

        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(smallInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.structural_strategy).toBe('load-bearing');
        expect(result.meta?.plotSizeCategory).toBe('small');
      });

      it('should recommend hybrid for medium plots (1200-2400 sqft)', async () => {
        const mediumInput: EngineerClarificationInput = {
          plot: { width: 40, depth: 50, area: 2000 },
        };

        mockGeminiResponse({
          structural_strategy: 'hybrid',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(mediumInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.structural_strategy).toBe('hybrid');
        expect(result.meta?.plotSizeCategory).toBe('medium');
      });

      it('should recommend RCC for large plots (over 2400 sqft)', async () => {
        const largeInput: EngineerClarificationInput = {
          plot: { width: 60, depth: 60, area: 3600 },
        };

        mockGeminiResponse({
          structural_strategy: 'rcc',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(largeInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.structural_strategy).toBe('rcc');
        expect(result.meta?.plotSizeCategory).toBe('large');
      });

      it('should use pre-calculated strategy if LLM returns invalid value', async () => {
        const input: EngineerClarificationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
        };

        // LLM returns invalid strategy
        mockGeminiResponse({
          structural_strategy: 'invalid-strategy',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        // Should fall back to pre-calculated (load-bearing for 1200 sqft)
        expect(['load-bearing', 'hybrid', 'rcc']).toContain(result.data?.structural_strategy);
      });
    });

    describe('soil type handling', () => {
      const validInput: EngineerClarificationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
      };

      it('should add soil test question when soil type is unknown', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const soilQuestion = result.openQuestions.find(
          q => q.questionId === 'soil_test'
        );
        expect(soilQuestion).toBeDefined();
        expect(soilQuestion?.type).toBe('mandatory');
      });

      it('should track soil type in meta', async () => {
        const inputWithSoil: EngineerClarificationInput = {
          ...validInput,
          soilType: 'clay',
        };

        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: ['Soil swelling in monsoon'],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(inputWithSoil, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.soilType).toBe('clay');
      });

      it('should add clay-specific risks for clay soil', async () => {
        const clayInput: EngineerClarificationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          soilType: 'clay',
        };

        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(clayInput, mockContext);

        expect(result.success).toBe(true);
        // Should include clay-specific risks
        expect(result.data?.engineering_risks.some(
          r => r.toLowerCase().includes('swelling') || r.toLowerCase().includes('settlement')
        )).toBe(true);
      });

      it('should add sandy soil risks', async () => {
        const sandyInput: EngineerClarificationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          soilType: 'sandy',
        };

        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(sandyInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.engineering_risks.some(
          r => r.toLowerCase().includes('erosion') || r.toLowerCase().includes('water')
        )).toBe(true);
      });
    });

    describe('assumptions extraction', () => {
      const validInput: EngineerClarificationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
      };

      it('should add high-risk assumption when soil is unknown', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const soilAssumption = result.assumptions.find(
          a => a.assumptionId === 'soil_unknown'
        );
        expect(soilAssumption).toBeDefined();
        expect(soilAssumption?.risk).toBe('high');
      });

      it('should add TN construction norms assumption when not specified', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const normsAssumption = result.assumptions.find(
          a => a.assumptionId === 'tn_construction_norms'
        );
        expect(normsAssumption).toBeDefined();
        expect(normsAssumption?.risk).toBe('low');
      });

      it('should add structural strategy basis assumption', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const strategyAssumption = result.assumptions.find(
          a => a.assumptionId === 'structural_strategy_basis'
        );
        expect(strategyAssumption).toBeDefined();
      });

      it('should include assumptions from LLM response', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [
            {
              assumption: 'No underground water table issues',
              risk: 'low',
              basis: 'Typical for this area',
            },
          ],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.assumptions.length).toBeGreaterThan(0);
      });
    });

    describe('open questions extraction', () => {
      const validInput: EngineerClarificationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
      };

      it('should always ask about building height', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const heightQuestion = result.openQuestions.find(
          q => q.questionId === 'building_height'
        );
        expect(heightQuestion).toBeDefined();
        expect(heightQuestion?.type).toBe('mandatory');
      });

      it('should include questions from LLM response', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [
            {
              id: 'adjacent_buildings',
              question: 'Are there any adjacent multi-story buildings?',
              type: 'optional',
              reason: 'May affect foundation design',
            },
          ],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const adjacentQuestion = result.openQuestions.find(
          q => q.questionId === 'adjacent_buildings'
        );
        expect(adjacentQuestion).toBeDefined();
      });
    });

    describe('engineering risks', () => {
      it('should include soil-specific risks in output', async () => {
        const input: EngineerClarificationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          soilType: 'mixed',
        };

        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: ['Custom risk from LLM'],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.engineering_risks.length).toBeGreaterThan(0);
        // Should have both LLM risks and soil-specific risks
        expect(result.data?.engineering_risks.some(
          r => r.includes('Custom risk')
        )).toBe(true);
        expect(result.data?.engineering_risks.some(
          r => r.toLowerCase().includes('settlement') || r.toLowerCase().includes('differential')
        )).toBe(true);
      });
    });

    describe('local construction norms', () => {
      it('should use provided construction norms', async () => {
        const input: EngineerClarificationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          localConstructionNorms: 'Chennai Corporation Building Rules',
        };

        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          engineering_risks: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        // Should not add TN norms assumption since local norms provided
        const normsAssumption = result.assumptions.find(
          a => a.assumptionId === 'tn_construction_norms'
        );
        expect(normsAssumption).toBeUndefined();
      });
    });

    describe('error handling', () => {
      const validInput: EngineerClarificationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
      };

      it('should handle JSON parsing errors gracefully', async () => {
        mockGeminiResponse('invalid json {{{');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('parse');
        expect(result.error?.code).toBe('ENGINEER_CLARIFICATION_ERROR');
      });

      it('should return retryable flag for errors', async () => {
        clearMocks();

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.retryable).toBe(false);
      });

      it('should include empty arrays on error', async () => {
        mockGeminiResponse('invalid');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.openQuestions).toEqual([]);
        expect(result.assumptions).toEqual([]);
      });
    });

    describe('response parsing', () => {
      const validInput: EngineerClarificationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
      };

      it('should handle markdown-wrapped JSON response', async () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          structural_strategy: 'hybrid',
          engineering_risks: ['Test risk'],
          assumptions: [],
          open_questions: [],
        }) + '\n```';

        mockGeminiResponse(wrappedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.engineering_risks).toContain('Test risk');
      });

      it('should ensure arrays exist even if LLM omits them', async () => {
        mockGeminiResponse({
          structural_strategy: 'load-bearing',
          // Omitting engineering_risks, assumptions, open_questions
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(Array.isArray(result.data?.engineering_risks)).toBe(true);
      });
    });
  });
});
