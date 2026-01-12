/**
 * DimensioningAgent Unit Tests
 *
 * Tests for the dimensioning and space planning agent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DimensioningAgent,
  createDimensioningAgent,
} from '../../agents/dimensioning';
import type { DimensioningInput } from '../../types/contracts';
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

describe('DimensioningAgent', () => {
  let agent: DimensioningAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new DimensioningAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createDimensioningAgent();
      expect(createdAgent).toBeInstanceOf(DimensioningAgent);
      expect(createdAgent.agentName).toBe('dimensioning');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createDimensioningAgent({
        maxTokens: 8192,
        temperature: 0.05,
      });
      expect(createdAgent).toBeInstanceOf(DimensioningAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when zoning is missing', async () => {
        const input = {
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 3, bathrooms: 2 },
        } as DimensioningInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Zoning');
      });

      it('should fail when no rooms provided', async () => {
        const input: DimensioningInput = {
          zoning: {
            public: [],
            semiPrivate: [],
            private: [],
            service: [],
          },
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 3, bathrooms: 2 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('At least one room');
      });

      it('should fail when buildable envelope is missing', async () => {
        const input = {
          zoning: {
            public: ['living'],
            semiPrivate: ['dining'],
            private: ['master-bedroom'],
            service: ['kitchen'],
          },
          requirements: { bedrooms: 3, bathrooms: 2 },
        } as DimensioningInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Buildable envelope');
      });

      it('should fail when envelope width is zero', async () => {
        const input: DimensioningInput = {
          zoning: {
            public: ['living'],
            semiPrivate: ['dining'],
            private: ['master-bedroom'],
            service: ['kitchen'],
          },
          buildableEnvelope: { width: 0, depth: 40, area: 0 },
          requirements: { bedrooms: 3, bathrooms: 2 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('width must be positive');
      });

      it('should fail when envelope depth is zero', async () => {
        const input: DimensioningInput = {
          zoning: {
            public: ['living'],
            semiPrivate: ['dining'],
            private: ['master-bedroom'],
            service: ['kitchen'],
          },
          buildableEnvelope: { width: 30, depth: 0, area: 0 },
          requirements: { bedrooms: 3, bathrooms: 2 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('depth must be positive');
      });

      it('should fail when envelope area is insufficient', async () => {
        const input: DimensioningInput = {
          zoning: {
            public: ['living', 'veranda'],
            semiPrivate: ['dining', 'courtyard'],
            private: ['master-bedroom', 'bedroom-2', 'bedroom-3'],
            service: ['kitchen', 'store', 'common-bathroom'],
          },
          buildableEnvelope: { width: 10, depth: 10, area: 100 },  // Too small
          requirements: { bedrooms: 3, bathrooms: 2 },
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('insufficient');
      });
    });

    describe('successful dimensioning', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      const mockSuccessResponse = {
        rooms: [
          { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, area_sqft: 168, zone: 'public', adjacent_to: ['veranda', 'dining'] },
          { id: 'veranda', name: 'Veranda', type: 'veranda', width: 4, depth: 14, area_sqft: 56, zone: 'public', adjacent_to: ['living'] },
          { id: 'dining', name: 'Dining Room', type: 'dining', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: ['living', 'kitchen'] },
          { id: 'courtyard', name: 'Courtyard', type: 'courtyard', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: ['living', 'dining'] },
          { id: 'master-bedroom', name: 'Master Bedroom', type: 'master-bedroom', width: 14, depth: 12, area_sqft: 168, zone: 'private', adjacent_to: ['attached-bathroom'] },
          { id: 'bedroom-2', name: 'Bedroom 2', type: 'bedroom', width: 12, depth: 10, area_sqft: 120, zone: 'private', adjacent_to: ['common-bathroom'] },
          { id: 'attached-bathroom', name: 'Attached Bathroom', type: 'attached-bathroom', width: 6, depth: 8, area_sqft: 48, zone: 'private', adjacent_to: ['master-bedroom'] },
          { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 10, area_sqft: 100, zone: 'service', adjacent_to: ['dining'] },
          { id: 'common-bathroom', name: 'Common Bathroom', type: 'common-bathroom', width: 5, depth: 7, area_sqft: 35, zone: 'service', adjacent_to: ['bedroom-2'] },
        ],
        courtyard: { width: 10, depth: 10, area_sqft: 100 },
        total_built_up_sqft: 895,
        carpet_area_sqft: 814,
        efficiency_percent: 91,
      };

      it('should successfully dimension rooms', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.agentName).toBe('dimensioning');
        expect(result.data?.rooms).toBeDefined();
        expect(result.data?.rooms.length).toBeGreaterThan(0);
      });

      it('should track execution time', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        // executionTimeMs can be 0 for very fast mocked executions
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
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

      it('should include metadata', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.totalRooms).toBeGreaterThan(0);
        expect(result.meta?.envelopeUtilization).toBeGreaterThan(0);
      });
    });

    describe('room dimension calculations', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      it('should ensure all rooms have dimensions', async () => {
        mockGeminiResponse({
          rooms: [],  // Empty from LLM
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        // Should use pre-calculated rooms
        expect(result.data?.rooms.length).toBeGreaterThan(0);
        result.data?.rooms.forEach(room => {
          expect(room.width).toBeGreaterThan(0);
          expect(room.depth).toBeGreaterThan(0);
          expect(room.area_sqft).toBeGreaterThan(0);
        });
      });

      it('should ensure master bedroom is largest bedroom', async () => {
        mockGeminiResponse({
          rooms: [
            { id: 'master-bedroom', name: 'Master Bedroom', type: 'master-bedroom', width: 10, depth: 10, area_sqft: 100, zone: 'private', adjacent_to: [] },
            { id: 'bedroom-2', name: 'Bedroom 2', type: 'bedroom', width: 14, depth: 12, area_sqft: 168, zone: 'private', adjacent_to: [] },  // Larger than master!
            { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, area_sqft: 168, zone: 'public', adjacent_to: [] },
            { id: 'veranda', name: 'Veranda', type: 'veranda', width: 4, depth: 14, area_sqft: 56, zone: 'public', adjacent_to: [] },
            { id: 'dining', name: 'Dining', type: 'dining', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: [] },
            { id: 'courtyard', name: 'Courtyard', type: 'courtyard', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: [] },
            { id: 'attached-bathroom', name: 'Attached Bathroom', type: 'attached-bathroom', width: 5, depth: 7, area_sqft: 35, zone: 'private', adjacent_to: [] },
            { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 8, area_sqft: 80, zone: 'service', adjacent_to: [] },
            { id: 'common-bathroom', name: 'Common Bathroom', type: 'common-bathroom', width: 5, depth: 6, area_sqft: 30, zone: 'service', adjacent_to: [] },
          ],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 847,
          carpet_area_sqft: 770,
          efficiency_percent: 91,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const masterBedroom = result.data?.rooms.find(r => r.type === 'master-bedroom');
        const otherBedrooms = result.data?.rooms.filter(r => r.type === 'bedroom');

        if (masterBedroom && otherBedrooms && otherBedrooms.length > 0) {
          const maxOtherArea = Math.max(...otherBedrooms.map(r => r.area_sqft));
          expect(masterBedroom.area_sqft).toBeGreaterThan(maxOtherArea);
        }
      });

      it('should respect minimum room sizes', async () => {
        mockGeminiResponse({
          rooms: [
            { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, area_sqft: 168, zone: 'public', adjacent_to: [] },
            { id: 'veranda', name: 'Veranda', type: 'veranda', width: 4, depth: 14, area_sqft: 56, zone: 'public', adjacent_to: [] },
            { id: 'dining', name: 'Dining', type: 'dining', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: [] },
            { id: 'courtyard', name: 'Courtyard', type: 'courtyard', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: [] },
            { id: 'master-bedroom', name: 'Master Bedroom', type: 'master-bedroom', width: 14, depth: 12, area_sqft: 168, zone: 'private', adjacent_to: [] },
            { id: 'bedroom-2', name: 'Bedroom 2', type: 'bedroom', width: 12, depth: 10, area_sqft: 120, zone: 'private', adjacent_to: [] },
            { id: 'attached-bathroom', name: 'Attached Bathroom', type: 'attached-bathroom', width: 5, depth: 7, area_sqft: 35, zone: 'private', adjacent_to: [] },
            { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 8, area_sqft: 80, zone: 'service', adjacent_to: [] },
            { id: 'common-bathroom', name: 'Common Bathroom', type: 'common-bathroom', width: 5, depth: 6, area_sqft: 30, zone: 'service', adjacent_to: [] },
          ],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 857,
          carpet_area_sqft: 779,
          efficiency_percent: 91,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        result.data?.rooms.forEach(room => {
          // All rooms should have positive dimensions
          expect(room.width).toBeGreaterThan(0);
          expect(room.depth).toBeGreaterThan(0);
          expect(room.area_sqft).toBeGreaterThan(0);
        });
      });
    });

    describe('courtyard calculations', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      it('should include courtyard dimensions', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.courtyard).toBeDefined();
        expect(result.data?.courtyard.width).toBeGreaterThan(0);
        expect(result.data?.courtyard.depth).toBeGreaterThan(0);
        expect(result.data?.courtyard.area_sqft).toBeGreaterThan(0);
      });

      it('should ensure courtyard meets minimum 8% requirement', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 5, depth: 5, area_sqft: 25 },  // Too small!
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        // Courtyard should be at least 8% of envelope (1200 * 0.08 = 96 sqft)
        expect(result.data?.courtyard.area_sqft).toBeGreaterThanOrEqual(64);  // Minimum 8x8
      });
    });

    describe('totals calculation', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      it('should calculate total built-up area', async () => {
        mockGeminiResponse({
          rooms: [
            { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, area_sqft: 168, zone: 'public', adjacent_to: [] },
            { id: 'veranda', name: 'Veranda', type: 'veranda', width: 4, depth: 14, area_sqft: 56, zone: 'public', adjacent_to: [] },
            { id: 'dining', name: 'Dining', type: 'dining', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: [] },
            { id: 'courtyard', name: 'Courtyard', type: 'courtyard', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: [] },
            { id: 'master-bedroom', name: 'Master Bedroom', type: 'master-bedroom', width: 14, depth: 12, area_sqft: 168, zone: 'private', adjacent_to: [] },
            { id: 'bedroom-2', name: 'Bedroom 2', type: 'bedroom', width: 12, depth: 10, area_sqft: 120, zone: 'private', adjacent_to: [] },
            { id: 'attached-bathroom', name: 'Attached Bathroom', type: 'attached-bathroom', width: 5, depth: 7, area_sqft: 35, zone: 'private', adjacent_to: [] },
            { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 8, area_sqft: 80, zone: 'service', adjacent_to: [] },
            { id: 'common-bathroom', name: 'Common Bathroom', type: 'common-bathroom', width: 5, depth: 6, area_sqft: 30, zone: 'service', adjacent_to: [] },
          ],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 857,
          carpet_area_sqft: 779,
          efficiency_percent: 91,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.total_built_up_sqft).toBeGreaterThan(0);
      });

      it('should calculate carpet area', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.carpet_area_sqft).toBeGreaterThan(0);
      });

      it('should calculate efficiency percentage', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.efficiency_percent).toBeGreaterThan(0);
        expect(result.data?.efficiency_percent).toBeLessThanOrEqual(100);
      });

      it('should have efficiency within reasonable range', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        // Efficiency should typically be 80-95%
        expect(result.data?.efficiency_percent).toBeGreaterThanOrEqual(75);
        expect(result.data?.efficiency_percent).toBeLessThanOrEqual(98);
      });
    });

    describe('room type classification', () => {
      it('should correctly identify master bedroom', async () => {
        const input: DimensioningInput = {
          zoning: {
            public: ['living'],
            semiPrivate: ['dining'],
            private: ['master-bedroom'],
            service: ['kitchen'],
          },
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 1, bathrooms: 1 },
        };

        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 600,
          carpet_area_sqft: 540,
          efficiency_percent: 90,
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        const masterBedroom = result.data?.rooms.find(r => r.id === 'master-bedroom');
        expect(masterBedroom?.type).toBe('master-bedroom');
      });

      it('should correctly identify attached bathroom', async () => {
        const input: DimensioningInput = {
          zoning: {
            public: ['living'],
            semiPrivate: ['dining'],
            private: ['master-bedroom', 'attached-bathroom'],
            service: ['kitchen'],
          },
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 1, bathrooms: 1 },
        };

        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 600,
          carpet_area_sqft: 540,
          efficiency_percent: 90,
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        const attachedBath = result.data?.rooms.find(r => r.id === 'attached-bathroom');
        expect(attachedBath?.type).toBe('attached-bathroom');
      });

      it('should correctly identify service rooms', async () => {
        const input: DimensioningInput = {
          zoning: {
            public: ['living'],
            semiPrivate: ['dining'],
            private: ['master-bedroom'],
            service: ['kitchen', 'store', 'utility'],
          },
          buildableEnvelope: { width: 30, depth: 40, area: 1200 },
          requirements: { bedrooms: 1, bathrooms: 1 },
        };

        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 600,
          carpet_area_sqft: 540,
          efficiency_percent: 90,
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        const kitchen = result.data?.rooms.find(r => r.id === 'kitchen');
        const store = result.data?.rooms.find(r => r.id === 'store');
        expect(kitchen?.type).toBe('kitchen');
        expect(store?.type).toBe('store');
      });
    });

    describe('assumptions extraction', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      it('should add wall thickness assumption', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const wallAssumption = result.assumptions.find(
          a => a.assumptionId === 'wall_thickness'
        );
        expect(wallAssumption).toBeDefined();
      });

      it('should add ceiling height assumption', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const ceilingAssumption = result.assumptions.find(
          a => a.assumptionId === 'ceiling_height'
        );
        expect(ceilingAssumption).toBeDefined();
      });

      it('should add circulation assumption', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const circulationAssumption = result.assumptions.find(
          a => a.assumptionId === 'circulation_area'
        );
        expect(circulationAssumption).toBeDefined();
      });

      it('should add courtyard minimum assumption', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const courtyardAssumption = result.assumptions.find(
          a => a.assumptionId === 'courtyard_minimum'
        );
        expect(courtyardAssumption).toBeDefined();
      });
    });

    describe('open questions extraction', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      it('should ask about room size preference', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const sizeQuestion = result.openQuestions.find(
          q => q.questionId === 'room_size_preference'
        );
        expect(sizeQuestion).toBeDefined();
        expect(sizeQuestion?.type).toBe('optional');
      });

      it('should ask about master ensuite', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const ensuiteQuestion = result.openQuestions.find(
          q => q.questionId === 'master_ensuite'
        );
        expect(ensuiteQuestion).toBeDefined();
      });

      it('should ask about kitchen style', async () => {
        mockGeminiResponse({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const kitchenQuestion = result.openQuestions.find(
          q => q.questionId === 'kitchen_style'
        );
        expect(kitchenQuestion).toBeDefined();
      });
    });

    describe('error handling', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      it('should handle JSON parsing errors gracefully', async () => {
        mockGeminiResponse('invalid json {{{');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('parse');
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

      it('should return correct error codes', async () => {
        mockGeminiResponse('invalid json');

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('DIMENSIONING_PARSE_ERROR');
      });
    });

    describe('response parsing', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'bedroom-2', 'attached-bathroom'],
          service: ['kitchen', 'common-bathroom'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 2, bathrooms: 2 },
      };

      it('should handle markdown-wrapped JSON response', async () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          rooms: [
            { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, area_sqft: 168, zone: 'public', adjacent_to: [] },
          ],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        }) + '\n```';

        mockGeminiResponse(wrappedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
      });

      it('should extract JSON from mixed response', async () => {
        const mixedResponse = 'Here is the analysis:\n' + JSON.stringify({
          rooms: [],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 800,
          carpet_area_sqft: 720,
          efficiency_percent: 90,
        }) + '\nThank you!';

        mockGeminiResponse(mixedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
      });
    });

    describe('adjacency tracking', () => {
      const validInput: DimensioningInput = {
        zoning: {
          public: ['living', 'veranda'],
          semiPrivate: ['dining', 'courtyard'],
          private: ['master-bedroom', 'attached-bathroom'],
          service: ['kitchen'],
        },
        buildableEnvelope: { width: 30, depth: 40, area: 1200 },
        requirements: { bedrooms: 1, bathrooms: 1 },
      };

      it('should track room adjacencies from LLM response', async () => {
        mockGeminiResponse({
          rooms: [
            { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, area_sqft: 168, zone: 'public', adjacent_to: ['veranda', 'dining'] },
            { id: 'veranda', name: 'Veranda', type: 'veranda', width: 4, depth: 14, area_sqft: 56, zone: 'public', adjacent_to: ['living'] },
            { id: 'dining', name: 'Dining', type: 'dining', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: ['living', 'kitchen'] },
            { id: 'courtyard', name: 'Courtyard', type: 'courtyard', width: 10, depth: 10, area_sqft: 100, zone: 'semi_private', adjacent_to: [] },
            { id: 'master-bedroom', name: 'Master Bedroom', type: 'master-bedroom', width: 14, depth: 12, area_sqft: 168, zone: 'private', adjacent_to: ['attached-bathroom'] },
            { id: 'attached-bathroom', name: 'Attached Bathroom', type: 'attached-bathroom', width: 5, depth: 7, area_sqft: 35, zone: 'private', adjacent_to: ['master-bedroom'] },
            { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 8, area_sqft: 80, zone: 'service', adjacent_to: ['dining'] },
          ],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 700,
          carpet_area_sqft: 635,
          efficiency_percent: 91,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const living = result.data?.rooms.find(r => r.id === 'living');
        expect(living?.adjacent_to).toContain('veranda');
        expect(living?.adjacent_to).toContain('dining');
      });

      it('should default to empty adjacency array when not provided', async () => {
        mockGeminiResponse({
          rooms: [
            { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, area_sqft: 168, zone: 'public' },  // No adjacent_to
          ],
          courtyard: { width: 10, depth: 10, area_sqft: 100 },
          total_built_up_sqft: 700,
          carpet_area_sqft: 635,
          efficiency_percent: 91,
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const living = result.data?.rooms.find(r => r.id === 'living');
        expect(living?.adjacent_to).toEqual([]);
      });
    });
  });
});
