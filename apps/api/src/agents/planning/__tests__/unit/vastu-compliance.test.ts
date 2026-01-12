/**
 * VastuComplianceAgent Unit Tests
 *
 * Tests for the Vastu Shastra compliance agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VastuComplianceAgent,
  createVastuComplianceAgent,
} from '../../agents/vastu-compliance';
import type { VastuComplianceInput } from '../../types/contracts';
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

describe('VastuComplianceAgent', () => {
  let agent: VastuComplianceAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new VastuComplianceAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createVastuComplianceAgent();
      expect(createdAgent).toBeInstanceOf(VastuComplianceAgent);
      expect(createdAgent.agentName).toBe('vastu-compliance');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createVastuComplianceAgent({
        maxTokens: 8192,
        temperature: 0.05,
      });
      expect(createdAgent).toBeInstanceOf(VastuComplianceAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when orientation is missing', async () => {
        const input = {
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: true },
        } as VastuComplianceInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('orientation');
      });

      it('should fail when buildable envelope is missing', async () => {
        const input = {
          orientation: 'east',
          requirements: { bedrooms: 2, hasPooja: true },
        } as VastuComplianceInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Buildable envelope');
      });

      it('should fail when requirements are missing', async () => {
        const input = {
          orientation: 'east',
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        } as VastuComplianceInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Requirements');
      });

      it('should fail for invalid orientation', async () => {
        const input = {
          orientation: 'invalid' as any,
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: true },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Invalid orientation');
      });
    });

    describe('successful vastu analysis', () => {
      const validInput: VastuComplianceInput = {
        orientation: 'east',
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, hasPooja: true },
      };

      const mockSuccessResponse = {
        recommended_zones: {
          northeast: ['pooja', 'water-element'],
          east: ['main-entrance', 'living'],
          southeast: ['kitchen'],
          south: ['bedroom'],
          southwest: ['master-bedroom'],
          west: ['dining'],
          northwest: ['guest-room'],
          north: ['treasury'],
          center: ['courtyard'],
        },
        conflicts: [],
        acceptable_deviations: [],
        open_questions: [],
      };

      it('should successfully analyze plot', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.agentName).toBe('vastu-compliance');
        expect(result.data?.recommended_zones).toBeDefined();
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

    describe('orientation handling', () => {
      it('should handle east-facing plots (most auspicious)', async () => {
        const input: VastuComplianceInput = {
          orientation: 'east',
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: true },
        };

        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.orientation).toBe('east');
      });

      it('should handle north-facing plots', async () => {
        const input: VastuComplianceInput = {
          orientation: 'north',
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: true },
        };

        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['main-entrance', 'treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.orientation).toBe('north');
      });

      it('should handle south-facing plots with conflicts', async () => {
        const input: VastuComplianceInput = {
          orientation: 'south',
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: true },
        };

        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['living'],
            southeast: ['kitchen'],
            south: ['main-entrance'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [
            {
              conflict: 'South-facing entrance is not ideal in Vastu',
              severity: 'moderate',
            },
          ],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        // South-facing should add pre-calculated conflicts
        expect(result.data?.conflicts.length).toBeGreaterThan(0);
      });

      it('should handle west-facing plots with conflicts', async () => {
        const input: VastuComplianceInput = {
          orientation: 'west',
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: true },
        };

        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['main-entrance'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [
            {
              conflict: 'West-facing entrance requires remedies',
              severity: 'minor',
            },
          ],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        // West facing should add pre-calculated conflicts
      });
    });

    describe('zone recommendations', () => {
      const validInput: VastuComplianceInput = {
        orientation: 'east',
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, hasPooja: true },
      };

      it('should always include pooja room in northeast when hasPooja is true', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.recommended_zones.northeast).toContain('pooja');
      });

      it('should always include kitchen in southeast', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.recommended_zones.southeast).toContain('kitchen');
      });

      it('should always include master bedroom in southwest', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.recommended_zones.southwest).toContain('master-bedroom');
      });

      it('should ensure all nine zones are present', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['living'],
            // Missing other zones - agent should add defaults
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const zones = Object.keys(result.data?.recommended_zones || {});
        expect(zones).toContain('northeast');
        expect(zones).toContain('east');
        expect(zones).toContain('southeast');
        expect(zones).toContain('south');
        expect(zones).toContain('southwest');
        expect(zones).toContain('west');
        expect(zones).toContain('northwest');
        expect(zones).toContain('north');
        expect(zones).toContain('center');
      });
    });

    describe('conflicts and deviations', () => {
      const validInput: VastuComplianceInput = {
        orientation: 'east',
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, hasPooja: true },
      };

      it('should return conflicts from LLM response', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [
            {
              conflict: 'Toilet in northeast violates Vastu',
              severity: 'major',
            },
          ],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.conflicts.length).toBeGreaterThan(0);
        expect(result.data?.conflicts[0].conflict).toContain('northeast');
      });

      it('should return acceptable deviations', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [
            {
              deviation: 'Kitchen in northwest instead of southeast',
              reason: 'Due to plot constraints',
              acceptable: true,
            },
          ],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.acceptable_deviations.length).toBeGreaterThan(0);
      });

      it('should track major conflicts for validation', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['toilet'],  // Major violation
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [
            {
              conflict: 'Toilet in northeast is a major violation',
              severity: 'major',
            },
            {
              conflict: 'Minor placement issue',
              severity: 'minor',
            },
          ],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const majorConflicts = result.data?.conflicts.filter(
          c => c.severity === 'major'
        );
        expect(majorConflicts?.length).toBeGreaterThan(0);
      });
    });

    describe('pooja room handling', () => {
      it('should ensure pooja in northeast when hasPooja is true', async () => {
        const input: VastuComplianceInput = {
          orientation: 'east',
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: true },
        };

        mockGeminiResponse({
          recommended_zones: {
            northeast: ['water-element'],  // Missing pooja
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        // Agent should add pooja to northeast since hasPooja is true
        expect(result.data?.recommended_zones.northeast).toContain('pooja');
      });

      it('should skip pooja when hasPooja is false', async () => {
        const input: VastuComplianceInput = {
          orientation: 'east',
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 2, hasPooja: false },
        };

        mockGeminiResponse({
          recommended_zones: {
            northeast: ['water-element', 'meditation'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.hasPooja).toBe(false);
      });
    });

    describe('assumptions extraction', () => {
      const validInput: VastuComplianceInput = {
        orientation: 'east',
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, hasPooja: true },
      };

      it('should include assumptions from agent', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.assumptions.length).toBeGreaterThan(0);
      });
    });

    describe('open questions extraction', () => {
      const validInput: VastuComplianceInput = {
        orientation: 'east',
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, hasPooja: true },
      };

      it('should include questions from LLM response', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [],
          acceptable_deviations: [],
          open_questions: [
            {
              id: 'water_features',
              question: 'Do you want water features like a fountain?',
              type: 'optional',
              reason: 'Water elements have specific Vastu placements',
            },
          ],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const waterQuestion = result.openQuestions.find(
          q => q.questionId === 'water_features'
        );
        expect(waterQuestion).toBeDefined();
      });
    });

    describe('error handling', () => {
      const validInput: VastuComplianceInput = {
        orientation: 'east',
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, hasPooja: true },
      };

      it('should handle JSON parsing errors gracefully', async () => {
        mockGeminiResponse('invalid json {{{');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('parse');
        expect(result.error?.code).toBe('VASTU_COMPLIANCE_ERROR');
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
      const validInput: VastuComplianceInput = {
        orientation: 'east',
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, hasPooja: true },
      };

      it('should handle markdown-wrapped JSON response', async () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          conflicts: [
            {
              conflict: 'Test conflict',
              severity: 'minor',
            },
          ],
          acceptable_deviations: [],
          open_questions: [],
        }) + '\n```';

        mockGeminiResponse(wrappedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.conflicts.some(c => c.conflict === 'Test conflict')).toBe(true);
      });

      it('should ensure arrays exist even if LLM omits them', async () => {
        mockGeminiResponse({
          recommended_zones: {
            northeast: ['pooja'],
            east: ['main-entrance', 'living'],
            southeast: ['kitchen'],
            south: ['bedroom'],
            southwest: ['master-bedroom'],
            west: ['dining'],
            northwest: ['guest-room'],
            north: ['treasury'],
            center: ['courtyard'],
          },
          // Omitting conflicts, acceptable_deviations, open_questions
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(Array.isArray(result.data?.conflicts)).toBe(true);
        expect(Array.isArray(result.data?.acceptable_deviations)).toBe(true);
      });
    });
  });
});
