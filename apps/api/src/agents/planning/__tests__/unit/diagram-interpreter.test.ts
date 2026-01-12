/**
 * DiagramInterpreterAgent Unit Tests
 *
 * Tests for the Gemini Vision-based diagram interpretation agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DiagramInterpreterAgent,
  createDiagramInterpreterAgent,
} from '../../agents/diagram-interpreter';
import type { DiagramInterpreterInput } from '../../types/contracts';
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

describe('DiagramInterpreterAgent', () => {
  let agent: DiagramInterpreterAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new DiagramInterpreterAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createDiagramInterpreterAgent();
      expect(createdAgent).toBeInstanceOf(DiagramInterpreterAgent);
      expect(createdAgent.agentName).toBe('diagram-interpreter');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createDiagramInterpreterAgent({
        maxTokens: 8192,
        temperature: 0.1,
      });
      expect(createdAgent).toBeInstanceOf(DiagramInterpreterAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when no image provided', async () => {
        const input: DiagramInterpreterInput = {};
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('imageUrl or imageBase64 is required');
      });

      it('should fail when base64 provided without mimeType', async () => {
        const input: DiagramInterpreterInput = {
          imageBase64: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('mimeType is required');
      });
    });

    describe('successful interpretation', () => {
      const validBase64Input: DiagramInterpreterInput = {
        imageBase64: 'SGVsbG8gV29ybGQ=',
        mimeType: 'image/png',
      };

      const mockSuccessResponse = {
        plot: {
          width: 30,
          depth: 40,
          area: 1200,
          unit: 'feet',
        },
        setbacks: {
          front: 5,
          rear: 5,
          left: 3,
          right: 3,
        },
        road: {
          side: 'north',
          width: 30,
        },
        orientation: 'north',
        annotations: ['Main road on north'],
        confidence: 0.92,
        open_questions: [],
      };

      it('should successfully process base64 image', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validBase64Input, mockContext);

        expect(result.success).toBe(true);
        expect(result.agentName).toBe('diagram-interpreter');
        expect(result.data?.plot.width).toBe(30);
        expect(result.data?.plot.depth).toBe(40);
        expect(result.data?.confidence).toBe(0.92);
      });

      it('should track execution time', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validBase64Input, mockContext);

        // With mocked responses, execution may complete in 0ms
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(typeof result.executionTimeMs).toBe('number');
      });

      it('should estimate token usage', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validBase64Input, mockContext);

        expect(result.tokensUsed.input).toBeGreaterThan(0);
        expect(result.tokensUsed.output).toBeGreaterThan(0);
        expect(result.tokensUsed.total).toBe(
          result.tokensUsed.input + result.tokensUsed.output
        );
      });

      it('should calculate area when not provided', async () => {
        const responseWithoutArea = {
          ...mockSuccessResponse,
          plot: {
            width: 25,
            depth: 50,
            unit: 'feet',
          },
        };
        mockGeminiResponse(responseWithoutArea);

        const result = await agent.execute(validBase64Input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.plot.area).toBe(1250); // 25 * 50
      });
    });

    describe('open questions extraction', () => {
      const validInput: DiagramInterpreterInput = {
        imageBase64: 'SGVsbG8gV29ybGQ=',
        mimeType: 'image/png',
      };

      it('should extract open questions from response', async () => {
        mockGeminiResponse({
          plot: { width: 30, depth: null, area: null, unit: 'feet' },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          road: { side: 'north', width: 30 },
          orientation: 'north',
          annotations: [],
          confidence: 0.75,
          open_questions: [
            {
              id: 'dim_depth',
              question: 'What is the depth of your plot?',
              type: 'mandatory',
              reason: 'Depth dimension is unclear in sketch',
            },
          ],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.openQuestions.length).toBeGreaterThan(0);
        expect(result.openQuestions[0].questionId).toBe('dim_depth');
        expect(result.openQuestions[0].agentSource).toBe('diagram-interpreter');
      });

      it('should auto-generate questions for missing width', async () => {
        mockGeminiResponse({
          plot: { width: null, depth: 40, area: null, unit: 'feet' },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          road: { side: 'north', width: 30 },
          orientation: 'north',
          annotations: [],
          confidence: 0.7,
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        const widthQuestion = result.openQuestions.find(
          (q) => q.questionId === 'dim_width'
        );
        expect(widthQuestion).toBeDefined();
        expect(widthQuestion?.type).toBe('mandatory');
      });

      it('should auto-generate questions for missing orientation', async () => {
        mockGeminiResponse({
          plot: { width: 30, depth: 40, area: 1200, unit: 'feet' },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          road: { side: null, width: null },
          orientation: null,
          annotations: [],
          confidence: 0.6,
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        const orientationQuestion = result.openQuestions.find(
          (q) => q.questionId === 'orientation'
        );
        expect(orientationQuestion).toBeDefined();
      });
    });

    describe('assumptions extraction', () => {
      const validInput: DiagramInterpreterInput = {
        imageBase64: 'SGVsbG8gV29ybGQ=',
        mimeType: 'image/png',
      };

      it('should add unit assumption when feet is used', async () => {
        mockGeminiResponse({
          plot: { width: 30, depth: 40, area: 1200, unit: 'feet' },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          road: { side: 'north', width: 30 },
          orientation: 'north',
          annotations: [],
          confidence: 0.9,
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        const unitAssumption = result.assumptions.find(
          (a) => a.assumptionId === 'unit_feet'
        );
        expect(unitAssumption).toBeDefined();
        expect(unitAssumption?.risk).toBe('low');
      });

      it('should add setback assumption when not all specified', async () => {
        mockGeminiResponse({
          plot: { width: 30, depth: 40, area: 1200, unit: 'feet' },
          setbacks: { front: 5, rear: null, left: 3, right: 3 },
          road: { side: 'north', width: 30 },
          orientation: 'north',
          annotations: [],
          confidence: 0.85,
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        const setbackAssumption = result.assumptions.find(
          (a) => a.assumptionId === 'setbacks_default'
        );
        expect(setbackAssumption).toBeDefined();
        expect(setbackAssumption?.risk).toBe('medium');
      });

      it('should flag low confidence as high risk', async () => {
        mockGeminiResponse({
          plot: { width: 30, depth: 40, area: 1200, unit: 'feet' },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          road: { side: 'north', width: 30 },
          orientation: 'north',
          annotations: [],
          confidence: 0.5,
          open_questions: [],
        });

        const result = await agent.execute(validInput, mockContext);

        const lowConfAssumption = result.assumptions.find(
          (a) => a.assumptionId === 'low_confidence'
        );
        expect(lowConfAssumption).toBeDefined();
        expect(lowConfAssumption?.risk).toBe('high');
      });
    });

    describe('error handling', () => {
      const validInput: DiagramInterpreterInput = {
        imageBase64: 'SGVsbG8gV29ybGQ=',
        mimeType: 'image/png',
      };

      it('should handle JSON parsing errors gracefully', async () => {
        mockGeminiResponse('invalid json {{{');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('parse');
        expect(result.error?.code).toBe('DIAGRAM_INTERPRETATION_ERROR');
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

    describe('base64 handling', () => {
      it('should handle base64 with data URL prefix', async () => {
        const inputWithPrefix: DiagramInterpreterInput = {
          imageBase64: 'data:image/png;base64,SGVsbG8gV29ybGQ=',
          mimeType: 'image/png',
        };

        mockGeminiResponse({
          plot: { width: 30, depth: 40, area: 1200, unit: 'feet' },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          road: { side: 'north', width: 30 },
          orientation: 'north',
          annotations: [],
          confidence: 0.9,
          open_questions: [],
        });

        const result = await agent.execute(inputWithPrefix, mockContext);

        expect(result.success).toBe(true);
      });
    });

    describe('response parsing', () => {
      const validInput: DiagramInterpreterInput = {
        imageBase64: 'SGVsbG8gV29ybGQ=',
        mimeType: 'image/png',
      };

      it('should handle markdown-wrapped JSON response', async () => {
        // Mock a response wrapped in markdown code blocks
        const wrappedResponse = '```json\n' + JSON.stringify({
          plot: { width: 30, depth: 40, area: 1200, unit: 'feet' },
          setbacks: { front: 5, rear: 5, left: 3, right: 3 },
          road: { side: 'north', width: 30 },
          orientation: 'north',
          annotations: [],
          confidence: 0.9,
          open_questions: [],
        }) + '\n```';

        mockGeminiResponse(wrappedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.plot.width).toBe(30);
      });
    });
  });
});
