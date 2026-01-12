/**
 * RegulationComplianceAgent Unit Tests
 *
 * Tests for the Tamil Nadu building regulation compliance agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RegulationComplianceAgent,
  createRegulationComplianceAgent,
} from '../../agents/regulation-compliance';
import type { RegulationComplianceInput } from '../../types/contracts';
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

describe('RegulationComplianceAgent', () => {
  let agent: RegulationComplianceAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new RegulationComplianceAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createRegulationComplianceAgent();
      expect(createdAgent).toBeInstanceOf(RegulationComplianceAgent);
      expect(createdAgent.agentName).toBe('regulation-compliance');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createRegulationComplianceAgent({
        maxTokens: 8192,
        temperature: 0.05,
      });
      expect(createdAgent).toBeInstanceOf(RegulationComplianceAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when plot dimensions are missing', async () => {
        const input = {} as RegulationComplianceInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot dimensions are required');
      });

      it('should fail when plot width is zero', async () => {
        const input: RegulationComplianceInput = {
          plot: { width: 0, depth: 40, area: 0 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot width must be a positive number');
      });

      it('should fail when setbacks exceed plot width', async () => {
        const input: RegulationComplianceInput = {
          plot: { width: 20, depth: 40, area: 800 },
          setbacks: { front: 5, rear: 5, left: 12, right: 12 }, // 24 feet > 20 feet
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Setbacks exceed plot width');
      });

      it('should fail when setbacks exceed plot depth', async () => {
        const input: RegulationComplianceInput = {
          plot: { width: 30, depth: 20, area: 600 },
          setbacks: { front: 12, rear: 12, left: 3, right: 3 }, // 24 feet > 20 feet
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Setbacks exceed plot depth');
      });
    });

    describe('successful compliance check', () => {
      const validInput: RegulationComplianceInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        setbacks: { front: 5, rear: 5, left: 3, right: 3 },
      };

      const mockSuccessResponse = {
        buildable_envelope: {
          width: 24,
          depth: 30,
          area: 720,
          maxHeight: 15,
          maxFloors: 4,
          fsi: 1.5,
        },
        constraints: [
          'FSI limit 1.5 for plots under 1500 sqft',
          'Maximum 4 floors permitted',
          'Ground coverage limited to 65%',
        ],
        violations: [],
        assumptions: [],
        open_questions: [],
      };

      it('should successfully process valid plot dimensions', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.agentName).toBe('regulation-compliance');
        expect(result.data?.buildable_envelope).toBeDefined();
      });

      it('should use deterministic pre-calculated values', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        // Verify pre-calculated values are used (24 = 30 - 3 - 3, 30 = 40 - 5 - 5)
        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.width).toBe(24);
        expect(result.data?.buildable_envelope.depth).toBe(30);
        expect(result.data?.buildable_envelope.area).toBe(720);
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

    describe('FSI calculation', () => {
      it('should apply FSI 1.5 for plots under 1500 sqft', async () => {
        const smallPlotInput: RegulationComplianceInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(smallPlotInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.fsi).toBe(1.5);
      });

      it('should apply FSI 1.75 for plots 1500-3000 sqft', async () => {
        const mediumPlotInput: RegulationComplianceInput = {
          plot: { width: 40, depth: 50, area: 2000 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(mediumPlotInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.fsi).toBe(1.75);
      });

      it('should apply FSI 2.0 for plots over 3000 sqft', async () => {
        const largePlotInput: RegulationComplianceInput = {
          plot: { width: 60, depth: 60, area: 3600 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(largePlotInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.fsi).toBe(2.0);
      });

      it('should apply commercial FSI for commercial plots', async () => {
        const commercialInput: RegulationComplianceInput = {
          plot: { width: 40, depth: 50, area: 2000 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          plotType: 'commercial',
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(commercialInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.fsi).toBe(2.5);
      });
    });

    describe('assumptions extraction', () => {
      const validInput: RegulationComplianceInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        setbacks: { front: 5, rear: 5, left: 3, right: 3 },
      };

      it('should add TN defaults assumption when city authority not specified', async () => {
        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const tnAssumption = result.assumptions.find(
          (a) => a.assumptionId === 'tn_defaults'
        );
        expect(tnAssumption).toBeDefined();
        expect(tnAssumption?.risk).toBe('medium');
      });

      it('should add residential assumption when plot type not specified', async () => {
        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        const plotTypeAssumption = result.assumptions.find(
          (a) => a.assumptionId === 'residential_default'
        );
        expect(plotTypeAssumption).toBeDefined();
        expect(plotTypeAssumption?.risk).toBe('low');
      });

      it('should include assumptions from LLM response', async () => {
        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [
            {
              assumption: 'Soil type is normal (no special foundation needed)',
              risk: 'low',
            },
          ],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.assumptions.length).toBeGreaterThan(0);
      });
    });

    describe('open questions extraction', () => {
      it('should ask for city authority when not provided', async () => {
        const inputWithoutAuthority: RegulationComplianceInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(inputWithoutAuthority, mockContext);

        const authorityQuestion = result.openQuestions.find(
          (q) => q.questionId === 'city_authority'
        );
        expect(authorityQuestion).toBeDefined();
        expect(authorityQuestion?.type).toBe('optional');
      });

      it('should not ask for city authority when provided', async () => {
        const inputWithAuthority: RegulationComplianceInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          cityAuthority: 'Chennai Corporation',
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(inputWithAuthority, mockContext);

        const authorityQuestion = result.openQuestions.find(
          (q) => q.questionId === 'city_authority'
        );
        expect(authorityQuestion).toBeUndefined();
      });
    });

    describe('violations detection', () => {
      it('should pass through violations from LLM response', async () => {
        const input: RegulationComplianceInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [
            'Proposed setbacks are below minimum requirements',
            'FSI exceeded for this zone',
          ],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.violations).toHaveLength(2);
        expect(result.data?.violations).toContain(
          'Proposed setbacks are below minimum requirements'
        );
      });
    });

    describe('error handling', () => {
      const validInput: RegulationComplianceInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        setbacks: { front: 5, rear: 5, left: 3, right: 3 },
      };

      it('should handle JSON parsing errors gracefully', async () => {
        mockGeminiResponse('invalid json {{{');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('parse');
        expect(result.error?.code).toBe('REGULATION_COMPLIANCE_ERROR');
      });

      it('should return retryable flag for errors', async () => {
        // Simulate error by not providing a mock response
        clearMocks();

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.retryable).toBe(false);
      });

      it('should include empty arrays for questions/assumptions on error', async () => {
        mockGeminiResponse('invalid');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.openQuestions).toEqual([]);
        expect(result.assumptions).toEqual([]);
      });
    });

    describe('response parsing', () => {
      const validInput: RegulationComplianceInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        setbacks: { front: 5, rear: 5, left: 3, right: 3 },
      };

      it('should handle markdown-wrapped JSON response', async () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          buildable_envelope: {
            width: 24,
            depth: 30,
            area: 720,
            maxHeight: 15,
            maxFloors: 4,
            fsi: 1.5,
          },
          constraints: ['Maximum 4 floors'],
          violations: [],
          assumptions: [],
          open_questions: [],
        }) + '\n```';

        mockGeminiResponse(wrappedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.width).toBe(24);
      });

      it('should ensure arrays exist even if LLM omits them', async () => {
        mockGeminiResponse({
          buildable_envelope: {
            width: 24,
            depth: 30,
            area: 720,
            maxHeight: 15,
            maxFloors: 4,
            fsi: 1.5,
          },
          // Omitting constraints, violations, assumptions, open_questions
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.constraints).toEqual([]);
        expect(result.data?.violations).toEqual([]);
      });
    });

    describe('buildable envelope calculation', () => {
      it('should correctly calculate buildable envelope with asymmetric setbacks', async () => {
        const input: RegulationComplianceInput = {
          plot: { width: 50, depth: 60, area: 3000 },
          setbacks: { front: 10, rear: 5, left: 5, right: 8 },
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        // Width: 50 - 5 - 8 = 37
        // Depth: 60 - 10 - 5 = 45
        // Area: 37 * 45 = 1665
        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.width).toBe(37);
        expect(result.data?.buildable_envelope.depth).toBe(45);
        expect(result.data?.buildable_envelope.area).toBe(1665);
      });

      it('should apply height and floor limits', async () => {
        const input: RegulationComplianceInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
        };

        mockGeminiResponse({
          buildable_envelope: {},
          constraints: [],
          violations: [],
          assumptions: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.buildable_envelope.maxHeight).toBe(15);
        expect(result.data?.buildable_envelope.maxFloors).toBe(4);
      });
    });
  });
});
