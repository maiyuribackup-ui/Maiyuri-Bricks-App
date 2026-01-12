/**
 * Unit Tests for EngineeringPlanAgent
 *
 * Tests the engineering plan agent's ability to:
 * - Calculate wall systems based on structural strategy
 * - Plan staircases for multi-floor buildings
 * - Design plumbing strategies with wet area grouping
 * - Position ventilation shafts
 * - Plan expansion provisions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EngineeringPlanAgent,
  createEngineeringPlanAgent,
} from '../../agents/engineering-plan';
import type { EngineeringPlanInput } from '../../types/contracts';
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
    { id: 'master-bedroom', name: 'Master Bedroom', type: 'bedroom', width: 14, depth: 12, areaSqft: 168, zone: 'private' },
    { id: 'bedroom-2', name: 'Bedroom 2', type: 'bedroom', width: 12, depth: 10, areaSqft: 120, zone: 'private' },
    { id: 'attached-bathroom', name: 'Attached Bathroom', type: 'bathroom', width: 6, depth: 8, areaSqft: 48, zone: 'private', adjacentTo: ['master-bedroom'] },
    { id: 'common-bathroom', name: 'Common Bathroom', type: 'bathroom', width: 5, depth: 7, areaSqft: 35, zone: 'service', adjacentTo: ['kitchen'] },
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

describe('EngineeringPlanAgent', () => {
  let agent: EngineeringPlanAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new EngineeringPlanAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createEngineeringPlanAgent();
      expect(createdAgent).toBeInstanceOf(EngineeringPlanAgent);
      expect(createdAgent.agentName).toBe('engineering-plan');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createEngineeringPlanAgent({
        maxTokens: 8192,
        temperature: 0.1,
      });
      expect(createdAgent).toBeInstanceOf(EngineeringPlanAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when rooms are missing', async () => {
        const input = {
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        } as EngineeringPlanInput;

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Rooms');
      });

      it('should fail when rooms array is empty', async () => {
        const input: EngineeringPlanInput = {
          rooms: [],
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Rooms');
      });

      it('should fail when structural strategy is missing', async () => {
        const input = {
          rooms: createSampleRooms(),
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        } as EngineeringPlanInput;

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Structural strategy');
      });

      it('should fail when structural strategy is invalid', async () => {
        const input = {
          rooms: createSampleRooms(),
          structuralStrategy: 'invalid' as any,
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Invalid structural strategy');
      });

      it('should fail when buildable envelope is missing', async () => {
        const input = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
        } as EngineeringPlanInput;

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Buildable envelope');
      });

      it('should fail when envelope width is zero', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 0, depth: 40, maxFloors: 2 },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('width');
      });

      it('should fail when maxFloors is zero', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 0 },
        };

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('floors');
      });
    });

    describe('wall system calculations', () => {
      const validInput: EngineeringPlanInput = {
        rooms: createSampleRooms(),
        structuralStrategy: 'load-bearing',
        buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
      };

      const mockSuccessResponse = {
        wall_system: {
          external_thickness_inches: 9,
          internal_thickness_inches: 4.5,
          material: 'Burnt clay brick masonry',
          load_bearing_walls: ['north-external', 'south-external'],
        },
        staircase: {
          type: 'straight',
          position: 'Near living room entrance',
          width_feet: 3.5,
          riser_height_inches: 7,
          tread_width_inches: 10,
        },
        plumbing_strategy: {
          wet_areas_grouped: true,
          shaft_positions: ['Kitchen shaft'],
          sewer_connection: 'south',
        },
        ventilation_shafts: [
          { position: 'Kitchen exhaust', serves_rooms: ['kitchen'] },
        ],
        expansion_provision: {
          direction: 'south',
          type: 'horizontal',
          notes: 'Horizontal expansion recommended',
        },
      };

      it('should return correct wall thickness for load-bearing', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.wall_system.external_thickness_inches).toBe(9);
        expect(result.data?.wall_system.internal_thickness_inches).toBe(4.5);
      });

      it('should return correct wall thickness for RCC', async () => {
        const rccInput: EngineeringPlanInput = {
          ...validInput,
          structuralStrategy: 'rcc',
        };
        mockGeminiResponse({
          ...mockSuccessResponse,
          wall_system: {
            external_thickness_inches: 4.5,
            internal_thickness_inches: 4.5,
            material: 'RCC frame with AAC block infill',
            load_bearing_walls: [],
          },
        });

        const result = await agent.execute(rccInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.wall_system.external_thickness_inches).toBe(4.5);
        expect(result.data?.wall_system.load_bearing_walls).toEqual([]);
      });

      it('should return correct wall thickness for hybrid', async () => {
        const hybridInput: EngineeringPlanInput = {
          ...validInput,
          structuralStrategy: 'hybrid',
        };
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(hybridInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.wall_system.external_thickness_inches).toBe(9);
        expect(result.data?.wall_system.internal_thickness_inches).toBe(4.5);
      });

      it('should identify load-bearing walls for multi-floor buildings', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.wall_system.load_bearing_walls).toBeDefined();
        expect(result.data?.wall_system.load_bearing_walls.length).toBeGreaterThan(0);
      });
    });

    describe('staircase planning', () => {
      it('should plan staircase for multi-floor building', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'rcc',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 4.5,
            internal_thickness_inches: 4.5,
            material: 'RCC frame',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'l-shaped',
            position: 'Adjacent to living room',
            width_feet: 3.5,
            riser_height_inches: 7,
            tread_width_inches: 10,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: ['Central shaft'],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'vertical',
            notes: 'Vertical expansion supported',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.staircase.width_feet).toBe(3.5);
        expect(result.data?.staircase.riser_height_inches).toBe(7);
        expect(result.data?.staircase.tread_width_inches).toBe(10);
      });

      it('should return zero dimensions for single-floor building', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: ['north-external', 'south-external'],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.staircase.width_feet).toBe(0);
        expect(result.data?.staircase.riser_height_inches).toBe(0);
      });

      it('should validate staircase type', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'rcc',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 4.5,
            internal_thickness_inches: 4.5,
            material: 'RCC frame',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'u-shaped',
            position: 'Center of building',
            width_feet: 3.5,
            riser_height_inches: 7,
            tread_width_inches: 10,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'vertical',
            notes: 'Vertical expansion supported',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        const validTypes = ['straight', 'l-shaped', 'u-shaped', 'spiral'];
        expect(validTypes).toContain(result.data?.staircase.type);
      });
    });

    describe('plumbing strategy', () => {
      const input: EngineeringPlanInput = {
        rooms: createSampleRooms(),
        structuralStrategy: 'load-bearing',
        buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
      };

      it('should identify wet areas', async () => {
        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: ['Kitchen shaft', 'Bathroom shaft'],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.plumbing_strategy.shaft_positions.length).toBeGreaterThan(0);
      });

      it('should detect wet areas grouping', async () => {
        // Rooms with adjacent wet areas
        const roomsWithGroupedWetAreas: Room[] = [
          ...createSampleRooms().filter(r => r.type !== 'bathroom'),
          { id: 'attached-bathroom', name: 'Attached Bathroom', type: 'bathroom', width: 6, depth: 8, areaSqft: 48, zone: 'private', adjacentTo: ['common-bathroom'] },
          { id: 'common-bathroom', name: 'Common Bathroom', type: 'bathroom', width: 5, depth: 7, areaSqft: 35, zone: 'service', adjacentTo: ['attached-bathroom'] },
        ];

        const groupedInput: EngineeringPlanInput = {
          rooms: roomsWithGroupedWetAreas,
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: ['Shared bathroom shaft'],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(groupedInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.plumbing_strategy.wet_areas_grouped).toBe(true);
      });

      it('should validate sewer connection direction', async () => {
        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'west',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        const validDirs = ['north', 'south', 'east', 'west'];
        expect(validDirs).toContain(result.data?.plumbing_strategy.sewer_connection);
      });
    });

    describe('ventilation shafts', () => {
      it('should identify rooms needing ventilation', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [
            { position: 'Kitchen exhaust shaft', serves_rooms: ['kitchen'] },
            { position: 'Bathroom shaft', serves_rooms: ['attached-bathroom', 'common-bathroom'] },
          ],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.ventilation_shafts.length).toBeGreaterThan(0);
      });

      it('should group ventilation needs efficiently', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [
            { position: 'Combined wet area shaft', serves_rooms: ['kitchen', 'attached-bathroom', 'common-bathroom'] },
          ],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        result.data?.ventilation_shafts.forEach(shaft => {
          expect(shaft.position).toBeDefined();
          expect(shaft.serves_rooms).toBeDefined();
        });
      });
    });

    describe('expansion provision', () => {
      it('should recommend horizontal expansion for load-bearing', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal expansion recommended for load-bearing structure',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.expansion_provision.type).toBe('horizontal');
      });

      it('should allow vertical expansion for RCC', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'rcc',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 4.5,
            internal_thickness_inches: 4.5,
            material: 'RCC frame',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Near entrance',
            width_feet: 3.5,
            riser_height_inches: 7,
            tread_width_inches: 10,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'vertical',
            notes: 'Vertical expansion supported by RCC frame',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.expansion_provision.type).toBe('vertical');
      });

      it('should validate expansion direction', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'hybrid',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Hybrid',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'east',
            type: 'horizontal',
            notes: 'East side expansion possible',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        const validDirs = ['north', 'south', 'east', 'west'];
        expect(validDirs).toContain(result.data?.expansion_provision.direction);
      });
    });

    describe('assumptions and open questions', () => {
      it('should include structural strategy assumption', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.assumptions.length).toBeGreaterThan(0);
        expect(result.assumptions.some(a => a.assumptionId === 'structural_strategy')).toBe(true);
      });

      it('should include soil capacity assumption', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'rcc',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 4.5,
            internal_thickness_inches: 4.5,
            material: 'RCC frame',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Near entrance',
            width_feet: 3.5,
            riser_height_inches: 7,
            tread_width_inches: 10,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'vertical',
            notes: 'Vertical expansion supported',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.assumptions.some(a => a.assumptionId === 'soil_capacity')).toBe(true);
      });

      it('should ask about soil testing', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.openQuestions.some(q => q.questionId === 'soil_test')).toBe(true);
      });

      it('should ask about staircase position for multi-floor', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'rcc',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 2 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 4.5,
            internal_thickness_inches: 4.5,
            material: 'RCC frame',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Near entrance',
            width_feet: 3.5,
            riser_height_inches: 7,
            tread_width_inches: 10,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'vertical',
            notes: 'Vertical expansion supported',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.openQuestions.some(q => q.questionId === 'staircase_position')).toBe(true);
      });

      it('should ask about future floors for single-floor load-bearing', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.openQuestions.some(q => q.questionId === 'future_floors')).toBe(true);
      });
    });

    describe('token estimation', () => {
      it('should estimate token usage', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse({
          wall_system: {
            external_thickness_inches: 9,
            internal_thickness_inches: 4.5,
            material: 'Brick masonry',
            load_bearing_walls: [],
          },
          staircase: {
            type: 'straight',
            position: 'Not applicable',
            width_feet: 0,
            riser_height_inches: 0,
            tread_width_inches: 0,
          },
          plumbing_strategy: {
            wet_areas_grouped: true,
            shaft_positions: [],
            sewer_connection: 'south',
          },
          ventilation_shafts: [],
          expansion_provision: {
            direction: 'south',
            type: 'horizontal',
            notes: 'Horizontal only',
          },
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.tokensUsed.input).toBeGreaterThan(0);
        expect(result.tokensUsed.output).toBeGreaterThan(0);
        expect(result.tokensUsed.total).toBe(result.tokensUsed.input + result.tokensUsed.output);
      });
    });

    describe('error handling', () => {
      it('should handle invalid JSON response', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse('invalid json response');

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('parse');
      });

      it('should handle API errors', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        // No mock response - will throw "No mock response available"

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should handle empty response', async () => {
        const input: EngineeringPlanInput = {
          rooms: createSampleRooms(),
          structuralStrategy: 'load-bearing',
          buildableEnvelope: { width: 30, depth: 40, maxFloors: 1 },
        };

        mockGeminiResponse('{}');

        const result = await agent.execute(input, mockContext);

        // Should still succeed with defaults applied
        expect(result.success).toBe(true);
        expect(result.data?.wall_system).toBeDefined();
      });
    });
  });
});
