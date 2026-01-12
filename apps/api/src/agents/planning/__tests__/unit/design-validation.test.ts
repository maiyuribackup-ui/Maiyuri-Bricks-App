/**
 * Unit Tests for DesignValidationAgent
 *
 * Tests the design validation agent's ability to:
 * - Validate Tamil Nadu building regulations
 * - Check Vastu Shastra room placement rules
 * - Verify eco-design elements
 * - Confirm structural integrity requirements
 * - Validate dimensional constraints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DesignValidationAgent,
  createDesignValidationAgent,
} from '../../agents/design-validation';
import type { DesignValidationInput } from '../../types/contracts';
import type { DesignContext, Room } from '../../types/design-context';

// Mock response queue
let mockResponseQueue: string[] = [];

// Mock Google Generative AI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockImplementation(async () => {
        if (mockResponseQueue.length === 0) {
          throw new Error('No mock response available');
        }
        return {
          response: {
            text: () => mockResponseQueue.shift(),
          },
        };
      }),
    }),
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
    plot: {
      width: 40,
      depth: 60,
      area: 2400,
      unit: 'feet',
    },
    road: {
      side: 'east',
      width: 30,
    },
    buildableEnvelope: {
      width: 30,
      depth: 46,
      area: 1380,  // 57.5% coverage (under 60% max)
      maxFloors: 2,
    },
    requirements: {
      bedrooms: 2,
      bathrooms: 2,
      hasPooja: true,
      hasParking: true,
      hasStore: false,
      hasServantRoom: false,
      floors: 2,
    },
    structuralStrategy: 'load-bearing',
    vastuZones: {
      northeast: ['pooja'],
      southeast: ['kitchen'],
      southwest: ['bedroom'],
      northwest: ['bathroom'],
    },
    courtyardSpec: {
      required: true,
      minArea: 100,
      position: 'central',
    },
    energyStrategy: {
      passiveCooling: true,
      crossVentilation: true,
      westWallMinimized: true,
      naturalLighting: true,
    },
    waterStrategy: {
      rainwaterHarvesting: true,
    },
  };
}

/**
 * Create sample rooms for testing
 */
function createSampleRooms(): Room[] {
  return [
    { id: 'living', name: 'Living Room', type: 'living', width: 14, depth: 12, areaSqft: 168, zone: 'public' },
    { id: 'dining', name: 'Dining Room', type: 'dining', width: 10, depth: 10, areaSqft: 100, zone: 'semi_private' },
    { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 8, areaSqft: 80, zone: 'service' },
    { id: 'bedroom-1', name: 'Master Bedroom', type: 'bedroom', width: 14, depth: 12, areaSqft: 168, zone: 'private' },
    { id: 'bedroom-2', name: 'Bedroom 2', type: 'bedroom', width: 12, depth: 10, areaSqft: 120, zone: 'private' },
    { id: 'bathroom-1', name: 'Attached Bathroom', type: 'bathroom', width: 6, depth: 8, areaSqft: 48, zone: 'private', adjacentTo: ['bedroom-1'] },
    { id: 'bathroom-2', name: 'Common Bathroom', type: 'bathroom', width: 5, depth: 7, areaSqft: 35, zone: 'service', adjacentTo: ['kitchen'] },
  ];
}

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

/**
 * Mock LLM success response
 */
const mockSuccessResponse = {
  additional_issues: [],
  additional_checks: [
    { item: 'Circulation space adequate', passed: true, notes: 'Sufficient 3ft corridors' },
    { item: 'Kitchen-dining connection', passed: true, notes: 'Adjacent placement' },
  ],
  severity_assessment: 'low',
  recommendations: [
    'Consider adding a secondary entrance for service access',
    'Ensure window placement for cross-ventilation',
  ],
};

describe('DesignValidationAgent', () => {
  let agent: DesignValidationAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new DesignValidationAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createDesignValidationAgent();
      expect(createdAgent).toBeInstanceOf(DesignValidationAgent);
      expect(createdAgent.agentName).toBe('design-validation');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createDesignValidationAgent({
        maxTokens: 8192,
        temperature: 0.05,
      });
      expect(createdAgent).toBeInstanceOf(DesignValidationAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when fullContext is missing', async () => {
        const input = {} as DesignValidationInput;

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Full context is required');
      });

      it('should fail when fullContext is not an object', async () => {
        const input = {
          fullContext: 'not an object' as unknown as Record<string, unknown>,
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('must be an object');
      });
    });

    describe('regulation validation', () => {
      it('should check plot area minimum', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: { plot: mockContext.plot },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const plotCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('plot area')
          );
          expect(plotCheck).toBeDefined();
          expect(plotCheck?.passed).toBe(true);
        }
      });

      it('should fail on small plot area', async () => {
        mockGeminiResponse(mockSuccessResponse);

        // Set small plot (< 40 sqm = ~430 sqft)
        mockContext.plot = {
          width: 20,
          depth: 20,
          area: 400,
          unit: 'feet',
        };

        const input: DesignValidationInput = {
          fullContext: { plot: mockContext.plot },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const plotCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('plot area')
          );
          expect(plotCheck).toBeDefined();
          expect(plotCheck?.passed).toBe(false);
        }
      });

      it('should check ground coverage', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: {
            plot: mockContext.plot,
            buildableEnvelope: mockContext.buildableEnvelope,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const coverageCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('coverage')
          );
          expect(coverageCheck).toBeDefined();
        }
      });

      it('should flag excessive ground coverage', async () => {
        mockGeminiResponse(mockSuccessResponse);

        // Set envelope that covers > 60% of plot
        mockContext.buildableEnvelope = {
          width: 38,
          depth: 55,
          area: 2090,
          maxFloors: 2,
        };

        const input: DesignValidationInput = {
          fullContext: {
            plot: mockContext.plot,
            buildableEnvelope: mockContext.buildableEnvelope,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const coverageIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'reg-003'
          );
          expect(coverageIssue).toBeDefined();
          expect(coverageIssue?.type).toBe('error');
        }
      });
    });

    describe('vastu validation', () => {
      it('should pass when entrance faces preferred direction', async () => {
        mockGeminiResponse(mockSuccessResponse);

        // East is preferred for entrance
        mockContext.road = { side: 'east', width: 30 };

        const input: DesignValidationInput = {
          fullContext: { road: mockContext.road },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const entranceCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('entrance direction')
          );
          expect(entranceCheck).toBeDefined();
          expect(entranceCheck?.passed).toBe(true);
        }
      });

      it('should warn when entrance faces non-preferred direction', async () => {
        mockGeminiResponse(mockSuccessResponse);

        // West is not preferred for entrance
        mockContext.road = { side: 'west', width: 30 };

        const input: DesignValidationInput = {
          fullContext: { road: mockContext.road },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const entranceIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'vastu-001'
          );
          expect(entranceIssue).toBeDefined();
          expect(entranceIssue?.type).toBe('warning');
          expect(entranceIssue?.category).toBe('vastu');
        }
      });

      it('should check pooja room placement in northeast', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: {
            vastuZones: mockContext.vastuZones,
            requirements: mockContext.requirements,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const poojaCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Pooja room')
          );
          expect(poojaCheck).toBeDefined();
          expect(poojaCheck?.passed).toBe(true);
        }
      });

      it('should warn when pooja room not in northeast', async () => {
        mockGeminiResponse(mockSuccessResponse);

        // Move pooja from northeast to southwest
        mockContext.vastuZones = {
          northeast: [],
          southeast: ['kitchen'],
          southwest: ['bedroom', 'pooja'],
          northwest: ['bathroom'],
        };

        const input: DesignValidationInput = {
          fullContext: {
            vastuZones: mockContext.vastuZones,
            requirements: mockContext.requirements,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const poojaIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'vastu-002'
          );
          expect(poojaIssue).toBeDefined();
          expect(poojaIssue?.type).toBe('warning');
        }
      });

      it('should check kitchen placement in southeast', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: {
            vastuZones: mockContext.vastuZones,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const kitchenCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Kitchen in southeast')
          );
          expect(kitchenCheck).toBeDefined();
          expect(kitchenCheck?.passed).toBe(true);
        }
      });

      it('should warn when kitchen not in southeast', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.vastuZones = {
          northeast: ['pooja', 'kitchen'], // Kitchen in wrong place
          southeast: [],
          southwest: ['bedroom'],
          northwest: ['bathroom'],
        };

        const input: DesignValidationInput = {
          fullContext: {
            vastuZones: mockContext.vastuZones,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const kitchenIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'vastu-003'
          );
          expect(kitchenIssue).toBeDefined();
          expect(kitchenIssue?.type).toBe('warning');
        }
      });
    });

    describe('eco validation', () => {
      it('should check courtyard provision', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: {
            courtyardSpec: mockContext.courtyardSpec,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const courtyardCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Courtyard')
          );
          expect(courtyardCheck).toBeDefined();
          expect(courtyardCheck?.passed).toBe(true);
        }
      });

      it('should check cross-ventilation', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: {
            energyStrategy: mockContext.energyStrategy,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const ventCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Cross-ventilation')
          );
          expect(ventCheck).toBeDefined();
          expect(ventCheck?.passed).toBe(true);
        }
      });

      it('should warn when cross-ventilation not planned', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.energyStrategy = {
          passiveCooling: true,
          crossVentilation: false,
          westWallMinimized: true,
          naturalLighting: true,
        };

        const input: DesignValidationInput = {
          fullContext: {
            energyStrategy: mockContext.energyStrategy,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const ventIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'eco-001'
          );
          expect(ventIssue).toBeDefined();
          expect(ventIssue?.type).toBe('warning');
        }
      });

      it('should check rainwater harvesting', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: {
            waterStrategy: mockContext.waterStrategy,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const rwhCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Rainwater')
          );
          expect(rwhCheck).toBeDefined();
          expect(rwhCheck?.passed).toBe(true);
        }
      });

      it('should inform when rainwater harvesting not planned', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.waterStrategy = {
          rainwaterHarvesting: false,
        };

        const input: DesignValidationInput = {
          fullContext: {
            waterStrategy: mockContext.waterStrategy,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const rwhIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'eco-002'
          );
          expect(rwhIssue).toBeDefined();
          expect(rwhIssue?.type).toBe('info');
        }
      });
    });

    describe('structural validation', () => {
      it('should check structural strategy is defined', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const input: DesignValidationInput = {
          fullContext: {
            structuralStrategy: mockContext.structuralStrategy,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const strategyCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Structural strategy defined')
          );
          expect(strategyCheck).toBeDefined();
          expect(strategyCheck?.passed).toBe(true);
        }
      });

      it('should error when structural strategy is missing', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.structuralStrategy = undefined;

        const input: DesignValidationInput = {
          fullContext: {},
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const strategyIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'struct-001'
          );
          expect(strategyIssue).toBeDefined();
          expect(strategyIssue?.type).toBe('error');
        }
      });

      it('should error when load-bearing used for 3+ floors', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.structuralStrategy = 'load-bearing';
        mockContext.requirements = {
          bedrooms: 3,
          bathrooms: 3,
          hasPooja: true,
          hasParking: true,
          hasStore: false,
          hasServantRoom: false,
          floors: 3, // 3 floors with load-bearing is problematic
        };

        const input: DesignValidationInput = {
          fullContext: {
            structuralStrategy: mockContext.structuralStrategy,
            requirements: mockContext.requirements,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const floorIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'struct-002'
          );
          expect(floorIssue).toBeDefined();
          expect(floorIssue?.type).toBe('error');
        }
      });

      it('should pass when RCC used for 3+ floors', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.structuralStrategy = 'rcc';
        mockContext.requirements = {
          bedrooms: 3,
          bathrooms: 3,
          hasPooja: true,
          hasParking: true,
          hasStore: false,
          hasServantRoom: false,
          floors: 3,
        };

        const input: DesignValidationInput = {
          fullContext: {
            structuralStrategy: mockContext.structuralStrategy,
            requirements: mockContext.requirements,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const floorIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'struct-002'
          );
          expect(floorIssue).toBeUndefined();
        }
      });
    });

    describe('dimensional validation', () => {
      it('should check minimum room sizes', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: {
            rooms: mockContext.rooms,
            buildableEnvelope: mockContext.buildableEnvelope,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          // All rooms should pass minimum size checks
          const sizeChecks = result.data.compliance_checklist.filter(
            (c: { item: string }) => c.item.includes('minimum area')
          );
          expect(sizeChecks.length).toBeGreaterThan(0);
          expect(sizeChecks.every((c: { passed: boolean }) => c.passed)).toBe(true);
        }
      });

      it('should error when bedroom is too small', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = [
          // Bedroom below minimum (9.5 sqm = ~102 sqft)
          { id: 'bedroom-1', name: 'Bedroom 1', type: 'bedroom', width: 9, depth: 10, areaSqft: 90, zone: 'private' },
        ];

        const input: DesignValidationInput = {
          fullContext: {
            rooms: mockContext.rooms,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const sizeIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'dim-bedroom-1'
          );
          expect(sizeIssue).toBeDefined();
          expect(sizeIssue?.type).toBe('error');
          expect(sizeIssue?.category).toBe('dimensional');
        }
      });

      it('should error when no rooms defined', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = undefined;

        const input: DesignValidationInput = {
          fullContext: {},
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const noRoomsIssue = result.data.issues.find(
            (i: { id: string }) => i.id === 'dim-no-rooms'
          );
          expect(noRoomsIssue).toBeDefined();
          expect(noRoomsIssue?.type).toBe('error');
        }
      });

      it('should check space efficiency', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: {
            rooms: mockContext.rooms,
            buildableEnvelope: mockContext.buildableEnvelope,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const efficiencyCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Space efficiency')
          );
          expect(efficiencyCheck).toBeDefined();
        }
      });
    });

    describe('status determination', () => {
      it('should return valid status when no errors', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: {
            plot: mockContext.plot,
            requirements: mockContext.requirements,
            vastuZones: mockContext.vastuZones,
            courtyardSpec: mockContext.courtyardSpec,
            energyStrategy: mockContext.energyStrategy,
            waterStrategy: mockContext.waterStrategy,
            structuralStrategy: mockContext.structuralStrategy,
            buildableEnvelope: mockContext.buildableEnvelope,
            rooms: mockContext.rooms,
          },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          // Status depends on pre-validation results
          expect(['PASS', 'PASS_WITH_WARNINGS']).toContain(result.data.status);
        }
      });

      it('should return FAIL when errors exist', async () => {
        mockGeminiResponse(mockSuccessResponse);

        // Set up conditions that cause errors
        mockContext.structuralStrategy = undefined;
        mockContext.rooms = undefined;

        const input: DesignValidationInput = {
          fullContext: {},
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.status).toBe('FAIL');
        }
      });
    });

    describe('severity assessment', () => {
      it('should assess severity based on error count', async () => {
        mockGeminiResponse({
          additional_issues: [],
          additional_checks: [],
          severity_assessment: 'high',
          recommendations: [],
        });

        // Set up multiple error conditions
        mockContext.structuralStrategy = undefined; // Error
        mockContext.rooms = undefined; // Error
        mockContext.plot = {
          width: 20,
          depth: 20,
          area: 400, // Too small - Error
          unit: 'feet',
        };

        const input: DesignValidationInput = {
          fullContext: {},
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.severity).toBe('high');
        }
      });
    });

    describe('assumptions and open questions', () => {
      it('should include TN regulations assumption', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.assumptions.length).toBeGreaterThan(0);

        const tnAssumption = result.assumptions.find(
          a => a.assumptionId === 'tn_regulations'
        );
        expect(tnAssumption).toBeDefined();
        expect(tnAssumption?.risk).toBe('low');
      });

      it('should include Vastu assumption', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);

        const vastuAssumption = result.assumptions.find(
          a => a.assumptionId === 'vastu_standard'
        );
        expect(vastuAssumption).toBeDefined();
      });
    });

    describe('token usage estimation', () => {
      it('should estimate token usage', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.tokensUsed.input).toBeGreaterThan(0);
        expect(result.tokensUsed.output).toBeGreaterThan(0);
        expect(result.tokensUsed.total).toBe(result.tokensUsed.input + result.tokensUsed.output);
      });
    });

    describe('execution time tracking', () => {
      it('should track execution time', async () => {
        mockGeminiResponse(mockSuccessResponse);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('error handling', () => {
      it('should handle Gemini API errors gracefully', async () => {
        // No mock response = will throw error

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe('DESIGN_VALIDATION_ERROR');
        expect(result.error?.retryable).toBe(true);
      });

      it('should include error details in response', async () => {
        // No mock response = will throw error

        const input: DesignValidationInput = {
          fullContext: {},
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.assumptions).toEqual([]);
        expect(result.openQuestions).toEqual([]);
      });
    });

    describe('LLM response parsing', () => {
      it('should merge LLM issues with pre-validation issues', async () => {
        mockGeminiResponse({
          additional_issues: [
            {
              id: 'llm-001',
              type: 'warning',
              category: 'dimensional',
              message: 'Corridor width may be insufficient',
              affected_element: 'corridor',
              suggested_fix: 'Increase corridor width to 4 feet',
            },
          ],
          additional_checks: [],
          severity_assessment: 'medium',
          recommendations: ['Review corridor dimensions'],
        });

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const llmIssue = result.data.issues.find((i: { id: string }) => i.id === 'llm-001');
          expect(llmIssue).toBeDefined();
        }
      });

      it('should merge LLM checks with pre-validation checks', async () => {
        mockGeminiResponse({
          additional_issues: [],
          additional_checks: [
            {
              item: 'Natural light access',
              passed: true,
              notes: 'All habitable rooms have windows',
            },
          ],
          severity_assessment: 'low',
          recommendations: [],
        });

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const lightCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Natural light')
          );
          expect(lightCheck).toBeDefined();
        }
      });

      it('should handle malformed LLM response', async () => {
        // Invalid JSON in response
        mockGeminiResponse('This is not valid JSON');

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        // Should still succeed using pre-validation results only
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          // Should have pre-validation checks
          expect(result.data.compliance_checklist.length).toBeGreaterThan(0);
        }
      });

      it('should extract JSON from markdown code blocks', async () => {
        mockGeminiResponse(`Here is my analysis:

\`\`\`json
{
  "additional_issues": [],
  "additional_checks": [
    {
      "item": "Privacy design",
      "passed": true,
      "notes": "Bedroom-bathroom proximity is appropriate"
    }
  ],
  "severity_assessment": "low",
  "recommendations": ["Good privacy design"]
}
\`\`\`

Let me know if you need more details.`);

        mockContext.rooms = createSampleRooms();

        const input: DesignValidationInput = {
          fullContext: { rooms: mockContext.rooms },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        if (result.success && result.data) {
          const privacyCheck = result.data.compliance_checklist.find(
            (c: { item: string }) => c.item.includes('Privacy design')
          );
          expect(privacyCheck).toBeDefined();
        }
      });
    });
  });
});
