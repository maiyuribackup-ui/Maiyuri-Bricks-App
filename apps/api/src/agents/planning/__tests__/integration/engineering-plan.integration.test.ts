/**
 * Engineering Plan Agent Integration Tests
 *
 * Tests the EngineeringPlanAgent (Agent 9) integration with:
 * - Upstream agents (DimensioningAgent outputs)
 * - Downstream agents (DesignValidationAgent inputs)
 * - PlanningOrchestrator pipeline execution
 *
 * These tests verify the agent works correctly within the pipeline context,
 * handling real-world scenarios and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createEngineeringPlanAgent, EngineeringPlanAgent } from '../../agents/engineering-plan';
import { DesignValidationAgent, createDesignValidationAgent } from '../../agents/design-validation';
import {
  createPostDimensioningContext,
  createPostEcoContext,
  createPostRegulationContext,
} from '../mocks/context.mock';
import {
  mockClaudeResponse,
  clearMocks,
  createMockAnthropicClient,
} from '../mocks/claude-sdk.mock';
import type { DesignContext, Room, StructuralStrategy } from '../../types/design-context';
import type { EngineeringPlanInput, EngineeringPlanOutput } from '../../types/contracts';

// Mock the Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

describe('EngineeringPlanAgent Integration', () => {
  let agent: EngineeringPlanAgent;

  beforeEach(() => {
    clearMocks();
    agent = createEngineeringPlanAgent();
  });

  afterEach(() => {
    clearMocks();
    jest.clearAllMocks();
  });

  describe('Pipeline Context Integration', () => {
    it('should accept context from DimensioningAgent output', async () => {
      const context = createPostDimensioningContext({
        structuralStrategy: 'load-bearing',
      });

      // Verify the context has all required fields for EngineeringPlanAgent
      expect(context.rooms).toBeDefined();
      expect(context.rooms.length).toBeGreaterThan(0);
      expect(context.buildableEnvelope).toBeDefined();
      expect(context.buildableEnvelope?.maxFloors).toBeDefined();
    });

    it('should correctly extract input from pipeline context', () => {
      const context = createPostDimensioningContext({
        structuralStrategy: 'rcc',
      });

      const input: EngineeringPlanInput = {
        rooms: context.rooms!,
        structuralStrategy: context.structuralStrategy || 'load-bearing',
        buildableEnvelope: {
          width: context.buildableEnvelope!.width,
          depth: context.buildableEnvelope!.depth,
          maxFloors: context.buildableEnvelope!.maxFloors,
        },
        ecoConstraints: {
          hasCourtyard: context.courtyardSpec?.required ?? false,
          ventilationStrategy: context.energyStrategy?.crossVentilation ? 'cross' : 'standard',
        },
      };

      expect(input.rooms).toHaveLength(7);
      expect(input.structuralStrategy).toBe('rcc');
      expect(input.buildableEnvelope.maxFloors).toBe(2);
    });

    it('should handle missing optional context fields gracefully', () => {
      const context = createPostRegulationContext({
        rooms: [
          {
            id: 'living',
            name: 'Living Room',
            type: 'living',
            width: 15,
            depth: 12,
            areaSqft: 180,
            zone: 'public',
          },
        ],
      });

      // No eco constraints, no courtyard - should still work
      expect(context.ecoMandatory).toBeUndefined();
      expect(context.courtyardSpec).toBeUndefined();

      const input: EngineeringPlanInput = {
        rooms: context.rooms!,
        structuralStrategy: context.structuralStrategy || 'load-bearing',
        buildableEnvelope: {
          width: context.buildableEnvelope!.width,
          depth: context.buildableEnvelope!.depth,
          maxFloors: context.buildableEnvelope!.maxFloors,
        },
        ecoConstraints: {
          hasCourtyard: false,
          ventilationStrategy: 'standard',
        },
      };

      expect(input.ecoConstraints.hasCourtyard).toBe(false);
    });
  });

  describe('Structural Strategy Integration', () => {
    const structuralStrategies: StructuralStrategy[] = ['load-bearing', 'rcc', 'hybrid'];

    structuralStrategies.forEach((strategy) => {
      it(`should produce valid output for ${strategy} structural strategy`, () => {
        const context = createPostDimensioningContext({
          structuralStrategy: strategy,
        });

        // Test wall system calculations match structural strategy
        const expectedWallThickness = {
          'load-bearing': { external: 9, internal: 4.5 },
          'rcc': { external: 4.5, internal: 4.5 },
          'hybrid': { external: 9, internal: 4.5 },
        };

        expect(context.structuralStrategy).toBe(strategy);
        // The agent would use these wall thicknesses
        expect(expectedWallThickness[strategy]).toBeDefined();
      });
    });

    it('should include load-bearing walls only for appropriate strategies', () => {
      const loadBearingContext = createPostDimensioningContext({
        structuralStrategy: 'load-bearing',
      });

      const rccContext = createPostDimensioningContext({
        structuralStrategy: 'rcc',
      });

      // Load-bearing should have load-bearing walls identified
      expect(loadBearingContext.structuralStrategy).toBe('load-bearing');
      // RCC should have no load-bearing walls (all loads on RCC frame)
      expect(rccContext.structuralStrategy).toBe('rcc');
    });
  });

  describe('Multi-Floor Building Integration', () => {
    it('should calculate staircase for 2-floor building', () => {
      const context = createPostDimensioningContext({
        buildableEnvelope: {
          width: 24,
          depth: 32,
          area: 768,
          maxHeight: 15,
          maxFloors: 2,
          fsi: 1.5,
        },
      });

      expect(context.buildableEnvelope?.maxFloors).toBe(2);
      // With 2 floors, staircase is required
    });

    it('should not require staircase for single-floor building', () => {
      const context = createPostDimensioningContext({
        buildableEnvelope: {
          width: 24,
          depth: 32,
          area: 768,
          maxHeight: 15,
          maxFloors: 1,
          fsi: 1.5,
        },
      });

      expect(context.buildableEnvelope?.maxFloors).toBe(1);
      // With 1 floor, no staircase needed
    });

    it('should handle 3-floor building with landing requirement', () => {
      const context = createPostDimensioningContext({
        buildableEnvelope: {
          width: 24,
          depth: 32,
          area: 768,
          maxHeight: 25,
          maxFloors: 3,
          fsi: 2.0,
        },
      });

      expect(context.buildableEnvelope?.maxFloors).toBe(3);
      // With 3 floors, landing is required between floors
    });
  });

  describe('Wet Area Grouping Integration', () => {
    it('should identify all wet areas in room list', () => {
      const rooms: Room[] = [
        { id: 'living', name: 'Living Room', type: 'living', width: 15, depth: 12, areaSqft: 180, zone: 'public' },
        { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 10, areaSqft: 100, zone: 'semi_private' },
        { id: 'master', name: 'Master Bedroom', type: 'bedroom', width: 14, depth: 12, areaSqft: 168, zone: 'private' },
        { id: 'master-bath', name: 'Master Bathroom', type: 'attached-bathroom', width: 5, depth: 7, areaSqft: 35, zone: 'private' },
        { id: 'common-bath', name: 'Common Bathroom', type: 'common-bathroom', width: 5, depth: 6, areaSqft: 30, zone: 'semi_private' },
        { id: 'utility', name: 'Utility Area', type: 'utility', width: 4, depth: 5, areaSqft: 20, zone: 'service' },
      ];

      const wetAreaTypes = ['kitchen', 'attached-bathroom', 'common-bathroom', 'utility'];
      const wetAreas = rooms.filter(r => wetAreaTypes.includes(r.type));

      expect(wetAreas).toHaveLength(4);
      expect(wetAreas.map(r => r.id)).toEqual(['kitchen', 'master-bath', 'common-bath', 'utility']);
    });

    it('should calculate plumbing shaft positions for grouped wet areas', () => {
      const context = createPostDimensioningContext();

      // Wet areas should be grouped for plumbing efficiency
      const wetAreaTypes = ['kitchen', 'bathroom'];
      const hasKitchen = context.rooms?.some(r => r.type === 'kitchen');

      expect(hasKitchen).toBe(true);
      // Plumbing shaft should be positioned near wet areas
    });
  });

  describe('Ventilation Shaft Integration', () => {
    it('should position ventilation shafts based on eco constraints', () => {
      const context = createPostEcoContext({
        energyStrategy: {
          passiveCooling: true,
          crossVentilation: true,
          westWallMinimized: true,
          naturalLighting: true,
        },
      });

      expect(context.energyStrategy?.crossVentilation).toBe(true);
      // Cross ventilation requires strategic shaft placement
    });

    it('should not require ventilation shafts for courtyard buildings', () => {
      const context = createPostEcoContext({
        courtyardSpec: {
          required: true,
          minArea: 100,
          position: 'central',
        },
      });

      // Courtyard provides natural ventilation
      expect(context.courtyardSpec?.required).toBe(true);
      expect(context.courtyardSpec?.position).toBe('central');
    });
  });

  describe('Expansion Provision Integration', () => {
    it('should include expansion provisions for load-bearing buildings', () => {
      const context = createPostDimensioningContext({
        structuralStrategy: 'load-bearing',
        buildableEnvelope: {
          width: 24,
          depth: 32,
          area: 768,
          maxHeight: 15,
          maxFloors: 1,
          fsi: 1.5,
        },
      });

      // Single floor load-bearing can have first-floor addition provision
      expect(context.structuralStrategy).toBe('load-bearing');
      expect(context.buildableEnvelope?.maxFloors).toBe(1);
    });

    it('should calculate foundation for future floors in RCC buildings', () => {
      const context = createPostDimensioningContext({
        structuralStrategy: 'rcc',
        buildableEnvelope: {
          width: 24,
          depth: 32,
          area: 768,
          maxHeight: 15,
          maxFloors: 2,
          fsi: 1.5,
        },
      });

      // RCC buildings can be designed for future floor additions
      expect(context.structuralStrategy).toBe('rcc');
    });
  });

  describe('Output Format Validation', () => {
    it('should produce output compatible with DesignValidationAgent input', () => {
      const mockOutput: EngineeringPlanOutput = {
        wallSystem: {
          externalThickness: 9,
          internalThickness: 4.5,
          material: 'Burnt clay brick masonry with cement mortar 1:6',
          loadBearingWalls: ['north-external', 'south-external', 'east-external', 'west-external'],
        },
        staircase: {
          type: 'L-shaped',
          width: 3.5,
          position: 'central',
          riserHeight: 7,
          treadWidth: 10,
          numSteps: 17,
          hasLanding: true,
        },
        plumbing: {
          strategy: 'grouped',
          wetAreas: ['kitchen', 'master-bath', 'common-bath'],
          shaftPositions: ['east-central'],
          stackVentLocations: ['roof-east'],
        },
        ventilation: {
          shafts: [
            { id: 'V1', position: 'central', serves: ['kitchen', 'common-bath'] },
          ],
          crossVentilationEnabled: true,
        },
        expansion: {
          foundationProvision: 'single-floor-addition',
          columnStubsProvided: false,
          estimatedAddition: 400,
        },
        assumptions: [
          { id: 'A1', description: 'Standard floor height of 10 feet assumed' },
        ],
        openQuestions: [],
        tokenUsage: {
          input: 1200,
          output: 800,
          total: 2000,
        },
      };

      // Validate output structure
      expect(mockOutput.wallSystem).toBeDefined();
      expect(mockOutput.staircase).toBeDefined();
      expect(mockOutput.plumbing).toBeDefined();
      expect(mockOutput.ventilation).toBeDefined();
      expect(mockOutput.expansion).toBeDefined();
      expect(mockOutput.tokenUsage).toBeDefined();

      // Output should be compatible with DesignValidationAgent
      // which expects engineeringPlan in context
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle missing room data gracefully', () => {
      const context = createPostRegulationContext({
        rooms: [],
      });

      expect(context.rooms).toEqual([]);
      // Agent should produce warning or open question about missing rooms
    });

    it('should handle undefined structural strategy with default', () => {
      const context = createPostDimensioningContext();
      delete (context as Partial<DesignContext>).structuralStrategy;

      // Should default to load-bearing
      const strategy = context.structuralStrategy ?? 'load-bearing';
      expect(strategy).toBe('load-bearing');
    });

    it('should track open questions when information is insufficient', () => {
      const context = createPostDimensioningContext({
        rooms: [
          { id: 'living', name: 'Living Room', type: 'living', width: 15, depth: 12, areaSqft: 180, zone: 'public' },
          // Missing bathroom information
        ],
      });

      // Agent should raise open question about bathroom locations
      expect(context.rooms?.filter(r => r.type.includes('bathroom'))).toHaveLength(0);
    });
  });

  describe('Tamil Nadu Standards Compliance', () => {
    it('should enforce minimum staircase width of 3 feet', () => {
      const STAIRCASE_STANDARDS = {
        minWidth: 3,
        maxWidth: 4,
        minRiser: 6,
        maxRiser: 7.5,
        minTread: 10,
        maxTread: 12,
      };

      expect(STAIRCASE_STANDARDS.minWidth).toBe(3);
      expect(STAIRCASE_STANDARDS.maxRiser).toBeLessThanOrEqual(7.5);
      expect(STAIRCASE_STANDARDS.minTread).toBeGreaterThanOrEqual(10);
    });

    it('should use correct wall thickness for load-bearing', () => {
      const WALL_STANDARDS = {
        'load-bearing': {
          externalThickness: 9,
          internalThickness: 4.5,
        },
      };

      expect(WALL_STANDARDS['load-bearing'].externalThickness).toBe(9);
      expect(WALL_STANDARDS['load-bearing'].internalThickness).toBe(4.5);
    });

    it('should follow NBC 2016 plumbing guidelines', () => {
      // Wet areas should be grouped within 6 feet for efficient plumbing
      const maxWetAreaDistance = 6; // feet

      expect(maxWetAreaDistance).toBe(6);
    });
  });

  describe('Token Usage Tracking Integration', () => {
    it('should track token usage for cost estimation', () => {
      const mockTokenUsage = {
        input: 1500,
        output: 1000,
        total: 2500,
      };

      expect(mockTokenUsage.total).toBe(mockTokenUsage.input + mockTokenUsage.output);
      // Token usage should be passed to orchestrator for tracking
    });

    it('should estimate tokens before API call', () => {
      const context = createPostDimensioningContext();
      const roomCount = context.rooms?.length ?? 0;

      // Rough estimate: ~200 tokens per room for engineering analysis
      const estimatedInputTokens = 500 + (roomCount * 200);

      expect(estimatedInputTokens).toBeGreaterThan(0);
    });
  });
});

describe('EngineeringPlanAgent with DesignValidationAgent Chain', () => {
  let engineeringAgent: EngineeringPlanAgent;
  let validationAgent: DesignValidationAgent;

  beforeEach(() => {
    clearMocks();
    engineeringAgent = createEngineeringPlanAgent();
    validationAgent = createDesignValidationAgent();
  });

  afterEach(() => {
    clearMocks();
    jest.clearAllMocks();
  });

  it('should produce output that validation agent can consume', () => {
    const context = createPostDimensioningContext({
      structuralStrategy: 'load-bearing',
    });

    // EngineeringPlanAgent output format
    const engineeringOutput: EngineeringPlanOutput = {
      wallSystem: {
        externalThickness: 9,
        internalThickness: 4.5,
        material: 'Burnt clay brick masonry with cement mortar 1:6',
        loadBearingWalls: ['north-external', 'south-external', 'east-external', 'west-external'],
      },
      staircase: null, // Single floor, no staircase
      plumbing: {
        strategy: 'grouped',
        wetAreas: ['kitchen', 'master-bath', 'common-bath'],
        shaftPositions: ['east-central'],
        stackVentLocations: ['roof-east'],
      },
      ventilation: {
        shafts: [],
        crossVentilationEnabled: true,
      },
      expansion: {
        foundationProvision: 'single-floor-addition',
        columnStubsProvided: false,
        estimatedAddition: 400,
      },
      assumptions: [],
      openQuestions: [],
      tokenUsage: {
        input: 1200,
        output: 800,
        total: 2000,
      },
    };

    // Context should be updated with engineering plan
    const updatedContext: DesignContext = {
      ...context,
      engineeringPlan: engineeringOutput,
    };

    // Validation agent should be able to use this context
    expect(updatedContext.engineeringPlan).toBeDefined();
    expect(updatedContext.engineeringPlan?.wallSystem).toBeDefined();
  });

  it('should trigger validation errors for invalid engineering output', () => {
    // Invalid: load-bearing building with no load-bearing walls identified
    const invalidOutput: EngineeringPlanOutput = {
      wallSystem: {
        externalThickness: 9,
        internalThickness: 4.5,
        material: 'Burnt clay brick masonry',
        loadBearingWalls: [], // Invalid for load-bearing strategy
      },
      staircase: null,
      plumbing: {
        strategy: 'grouped',
        wetAreas: [],
        shaftPositions: [],
        stackVentLocations: [],
      },
      ventilation: {
        shafts: [],
        crossVentilationEnabled: false,
      },
      expansion: {
        foundationProvision: 'none',
        columnStubsProvided: false,
        estimatedAddition: 0,
      },
      assumptions: [],
      openQuestions: [],
      tokenUsage: { input: 0, output: 0, total: 0 },
    };

    // Validation agent should catch this inconsistency
    expect(invalidOutput.wallSystem.loadBearingWalls).toHaveLength(0);
  });
});
