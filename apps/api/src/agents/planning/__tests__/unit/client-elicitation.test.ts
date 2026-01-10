/**
 * ClientElicitationAgent Unit Tests
 *
 * Tests for the client requirements gathering agent.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  ClientElicitationAgent,
  createClientElicitationAgent,
} from '../../agents/client-elicitation';
import type { ClientElicitationInput } from '../../types/contracts';
import type { DesignContext } from '../../types/design-context';
import { createMockContext } from '../mocks/context.mock';

// Mock response queue for Gemini
let mockResponseQueue: string[] = [];

// Mock the Gemini SDK
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockImplementation(async () => {
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

describe('ClientElicitationAgent', () => {
  let agent: ClientElicitationAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new ClientElicitationAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createClientElicitationAgent();
      expect(createdAgent).toBeInstanceOf(ClientElicitationAgent);
      expect(createdAgent.agentName).toBe('client-elicitation');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createClientElicitationAgent({
        maxTokens: 8192,
        temperature: 0.5,
      });
      expect(createdAgent).toBeInstanceOf(ClientElicitationAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when plot dimensions are missing', async () => {
        const input = {} as ClientElicitationInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot dimensions are required');
      });

      it('should fail when buildable envelope is missing', async () => {
        const input: ClientElicitationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
        } as ClientElicitationInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Buildable envelope is required');
      });

      it('should fail when buildable area is zero', async () => {
        const input: ClientElicitationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          buildableEnvelope: { width: 24, depth: 30, area: 0 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Buildable area must be a positive number');
      });
    });

    describe('successful elicitation', () => {
      const validInput: ClientElicitationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        buildableEnvelope: { width: 24, depth: 30, area: 720 },
      };

      const mockSuccessResponse = {
        questions: [
          {
            id: 'num_bedrooms',
            question: 'How many bedrooms do you need?',
            type: 'mandatory',
            category: 'functional',
            reason: 'Required for floor plan design',
            defaultValue: '2',
            options: ['1', '2'],
          },
          {
            id: 'num_bathrooms',
            question: 'How many bathrooms do you need?',
            type: 'mandatory',
            category: 'functional',
            reason: 'Required for floor plan design',
            defaultValue: '2',
            options: ['1', '2'],
          },
          {
            id: 'has_pooja',
            question: 'Do you need a dedicated pooja room?',
            type: 'mandatory',
            category: 'functional',
            reason: 'Required for floor plan design',
            defaultValue: 'Yes',
            options: ['Yes', 'No', 'Pooja corner in living room'],
          },
        ],
      };

      it('should successfully generate questions', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.agentName).toBe('client-elicitation');
        expect(result.data?.questions).toBeDefined();
        expect(result.data?.questions.length).toBeGreaterThan(0);
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

      it('should not have open questions (this agent generates questions)', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.openQuestions).toEqual([]);
      });
    });

    describe('size category classification', () => {
      it('should classify small plots (under 1000 sqft buildable)', async () => {
        const smallInput: ClientElicitationInput = {
          plot: { width: 25, depth: 30, area: 750 },
          buildableEnvelope: { width: 19, depth: 20, area: 380 },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(smallInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.sizeCategory).toBe('small');
      });

      it('should classify medium plots (1000-1500 sqft buildable)', async () => {
        const mediumInput: ClientElicitationInput = {
          plot: { width: 40, depth: 50, area: 2000 },
          buildableEnvelope: { width: 34, depth: 40, area: 1360 },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(mediumInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.sizeCategory).toBe('medium');
      });

      it('should classify large plots (over 1500 sqft buildable)', async () => {
        const largeInput: ClientElicitationInput = {
          plot: { width: 60, depth: 60, area: 3600 },
          buildableEnvelope: { width: 54, depth: 50, area: 2700 },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(largeInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.sizeCategory).toBe('large');
      });
    });

    describe('mandatory questions', () => {
      const validInput: ClientElicitationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        buildableEnvelope: { width: 24, depth: 30, area: 720 },
      };

      it('should include mandatory questions even if LLM omits them', async () => {
        // LLM returns empty questions - agent should add mandatory ones
        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const questionIds = result.data?.questions.map(q => q.id);
        expect(questionIds).toContain('num_bedrooms');
        expect(questionIds).toContain('num_bathrooms');
        expect(questionIds).toContain('has_pooja');
        expect(questionIds).toContain('has_parking');
      });

      it('should not duplicate questions already in LLM response', async () => {
        mockGeminiResponse({
          questions: [
            {
              id: 'num_bedrooms',
              question: 'How many bedrooms?',
              type: 'mandatory',
              category: 'functional',
              reason: 'For design',
              defaultValue: '2',
              options: ['1', '2'],
            },
          ],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const bedroomQuestions = result.data?.questions.filter(
          q => q.id === 'num_bedrooms'
        );
        expect(bedroomQuestions?.length).toBe(1);
      });
    });

    describe('existing answers handling', () => {
      it('should skip questions that are already answered', async () => {
        const inputWithAnswers: ClientElicitationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          buildableEnvelope: { width: 24, depth: 30, area: 720 },
          existingAnswers: {
            num_bedrooms: '2',
            num_bathrooms: '2',
          },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(inputWithAnswers, mockContext);

        expect(result.success).toBe(true);
        const questionIds = result.data?.questions.map(q => q.id);
        expect(questionIds).not.toContain('num_bedrooms');
        expect(questionIds).not.toContain('num_bathrooms');
      });

      it('should track existing answers count in meta', async () => {
        const inputWithAnswers: ClientElicitationInput = {
          plot: { width: 30, depth: 40, area: 1200 },
          buildableEnvelope: { width: 24, depth: 30, area: 720 },
          existingAnswers: {
            num_bedrooms: '2',
            design_style: 'Modern Tamil',
          },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(inputWithAnswers, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.existingAnswersCount).toBe(2);
      });
    });

    describe('size-based question adjustments', () => {
      it('should limit bedroom options for small plots', async () => {
        const smallInput: ClientElicitationInput = {
          plot: { width: 25, depth: 30, area: 750 },
          buildableEnvelope: { width: 19, depth: 20, area: 380 },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(smallInput, mockContext);

        expect(result.success).toBe(true);
        const bedroomQ = result.data?.questions.find(q => q.id === 'num_bedrooms');
        expect(bedroomQ).toBeDefined();
        // Small plots max 2 bedrooms, so options should be filtered
        expect(bedroomQ?.options).not.toContain('5+');
        expect(bedroomQ?.options).not.toContain('4');
        expect(bedroomQ?.options).not.toContain('3');
      });

      it('should allow more bedrooms for large plots', async () => {
        const largeInput: ClientElicitationInput = {
          plot: { width: 60, depth: 60, area: 3600 },
          buildableEnvelope: { width: 54, depth: 50, area: 2700 },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(largeInput, mockContext);

        expect(result.success).toBe(true);
        const bedroomQ = result.data?.questions.find(q => q.id === 'num_bedrooms');
        expect(bedroomQ).toBeDefined();
        // Large plots max 5 bedrooms
        expect(bedroomQ?.options).toContain('5+');
      });
    });

    describe('assumptions extraction', () => {
      const validInput: ClientElicitationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        buildableEnvelope: { width: 24, depth: 30, area: 720 },
      };

      it('should add size category assumption', async () => {
        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const sizeAssumption = result.assumptions.find(
          a => a.assumptionId === 'size_category'
        );
        expect(sizeAssumption).toBeDefined();
        expect(sizeAssumption?.risk).toBe('low');
      });

      it('should add Tamil defaults assumption when no existing answers', async () => {
        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const defaultsAssumption = result.assumptions.find(
          a => a.assumptionId === 'tamil_defaults'
        );
        expect(defaultsAssumption).toBeDefined();
      });

      it('should not add Tamil defaults assumption when answers exist', async () => {
        const inputWithAnswers: ClientElicitationInput = {
          ...validInput,
          existingAnswers: { num_bedrooms: '2' },
        };

        mockGeminiResponse({ questions: [] });

        const result = await agent.execute(inputWithAnswers, mockContext);

        expect(result.success).toBe(true);
        const defaultsAssumption = result.assumptions.find(
          a => a.assumptionId === 'tamil_defaults'
        );
        expect(defaultsAssumption).toBeUndefined();
      });
    });

    describe('question categories', () => {
      const validInput: ClientElicitationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        buildableEnvelope: { width: 24, depth: 30, area: 720 },
      };

      it('should include questions from all categories', async () => {
        mockGeminiResponse({
          questions: [
            {
              id: 'timeline_start',
              question: 'When do you plan to start construction?',
              type: 'optional',
              category: 'timeline',
              reason: 'For planning',
            },
          ],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const categories = new Set(result.data?.questions.map(q => q.category));
        expect(categories.has('functional')).toBe(true);
        expect(categories.has('aesthetic')).toBe(true);
        expect(categories.has('budget')).toBe(true);
      });
    });

    describe('error handling', () => {
      const validInput: ClientElicitationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        buildableEnvelope: { width: 24, depth: 30, area: 720 },
      };

      it('should handle JSON parsing errors gracefully', async () => {
        mockGeminiResponse('invalid json {{{');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('parse');
        expect(result.error?.code).toBe('CLIENT_ELICITATION_ERROR');
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
      const validInput: ClientElicitationInput = {
        plot: { width: 30, depth: 40, area: 1200 },
        buildableEnvelope: { width: 24, depth: 30, area: 720 },
      };

      it('should handle markdown-wrapped JSON response', async () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          questions: [
            {
              id: 'custom_q',
              question: 'Custom question?',
              type: 'optional',
              category: 'functional',
              reason: 'Testing',
            },
          ],
        }) + '\n```';

        mockGeminiResponse(wrappedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.questions.find(q => q.id === 'custom_q')).toBeDefined();
      });
    });
  });
});
