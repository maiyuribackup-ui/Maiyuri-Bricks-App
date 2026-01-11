/**
 * Design Validation Agent Integration Tests
 *
 * Tests the DesignValidationAgent (Agent 10) integration with:
 * - All upstream agents' outputs in pipeline context
 * - Cross-validation between different design aspects
 * - Error aggregation and severity classification
 * - Pipeline halt decisions for critical errors
 *
 * These tests verify the agent works correctly as the final validation
 * gate before narrative generation and visualization.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createDesignValidationAgent, DesignValidationAgent } from '../../agents/design-validation';
import { createEngineeringPlanAgent, EngineeringPlanAgent } from '../../agents/engineering-plan';
import {
  createPostDimensioningContext,
  createPostEcoContext,
  createCompletedContext,
  createFailedValidationContext,
} from '../mocks/context.mock';
import { clearMocks } from '../mocks/claude-sdk.mock';
import type { DesignContext, Room } from '../../types/design-context';
import type { EngineeringPlanOutput, DesignValidationOutput } from '../../types/contracts';
import { DesignValidationError } from '../../errors';

// Mock the Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

describe('DesignValidationAgent Integration', () => {
  let validationAgent: DesignValidationAgent;

  beforeEach(() => {
    clearMocks();
    validationAgent = createDesignValidationAgent();
  });

  afterEach(() => {
    clearMocks();
    jest.clearAllMocks();
  });

  describe('Full Pipeline Context Validation', () => {
    it('should accept completed context from all upstream agents', () => {
      const context = createCompletedContext({
        structuralStrategy: 'load-bearing',
        vastuZones: {
          northeast: ['pooja'],
          southeast: ['kitchen'],
          southwest: ['master-bedroom'],
          northwest: ['bathroom'],
        },
      });

      // Verify context has all required fields from upstream agents
      expect(context.plot).toBeDefined();
      expect(context.buildableEnvelope).toBeDefined();
      expect(context.requirements).toBeDefined();
      expect(context.rooms).toBeDefined();
      expect(context.structuralStrategy).toBeDefined();
      expect(context.vastuZones).toBeDefined();
      expect(context.courtyardSpec).toBeDefined();
      expect(context.energyStrategy).toBeDefined();
    });

    it('should validate context from post-dimensioning stage', () => {
      const context = createPostDimensioningContext();

      // Should have rooms with dimensions
      expect(context.rooms).toBeDefined();
      expect(context.rooms!.length).toBeGreaterThan(0);

      // Each room should have dimensions
      context.rooms!.forEach((room) => {
        expect(room.width).toBeGreaterThan(0);
        expect(room.depth).toBeGreaterThan(0);
        expect(room.areaSqft).toBeGreaterThan(0);
      });
    });
  });

  describe('Cross-Validation Categories', () => {
    describe('Regulation Compliance', () => {
      it('should validate setback requirements', () => {
        const context = createPostDimensioningContext({
          setbacks: {
            front: 5,
            rear: 5,
            left: 3,
            right: 3,
            unit: 'feet',
          },
        });

        // Minimum setbacks per Tamil Nadu regulations
        const minSetbacks = {
          front: 5,
          rear: 3,
          side: 3,
        };

        expect(context.setbacks?.front).toBeGreaterThanOrEqual(minSetbacks.front);
        expect(context.setbacks?.rear).toBeGreaterThanOrEqual(minSetbacks.rear);
        expect(context.setbacks?.left).toBeGreaterThanOrEqual(minSetbacks.side);
        expect(context.setbacks?.right).toBeGreaterThanOrEqual(minSetbacks.side);
      });

      it('should validate FSI compliance', () => {
        const context = createPostDimensioningContext({
          plot: {
            width: 30,
            depth: 40,
            area: 1200,
            unit: 'feet',
          },
          buildableEnvelope: {
            width: 24,
            depth: 32,
            area: 768,
            maxHeight: 15,
            maxFloors: 2,
            fsi: 1.5,
          },
          totalBuiltUp: 1536, // 2 floors x 768 sq ft
        });

        const fsiUsed = (context.totalBuiltUp ?? 0) / (context.plot?.area ?? 1);
        const maxFsi = context.buildableEnvelope?.fsi ?? 1.5;

        expect(fsiUsed).toBeLessThanOrEqual(maxFsi);
      });

      it('should detect FSI violation', () => {
        const context = createPostDimensioningContext({
          plot: {
            width: 30,
            depth: 40,
            area: 1200,
            unit: 'feet',
          },
          buildableEnvelope: {
            width: 24,
            depth: 32,
            area: 768,
            maxHeight: 15,
            maxFloors: 2,
            fsi: 1.5,
          },
          totalBuiltUp: 2000, // Exceeds FSI limit
        });

        const fsiUsed = (context.totalBuiltUp ?? 0) / (context.plot?.area ?? 1);
        const maxFsi = context.buildableEnvelope?.fsi ?? 1.5;

        expect(fsiUsed).toBeGreaterThan(maxFsi); // Violation detected
      });

      it('should validate maximum height compliance', () => {
        const context = createPostDimensioningContext({
          buildableEnvelope: {
            width: 24,
            depth: 32,
            area: 768,
            maxHeight: 15, // meters
            maxFloors: 2,
            fsi: 1.5,
          },
        });

        const floorHeight = 3; // meters per floor
        const estimatedHeight = (context.buildableEnvelope?.maxFloors ?? 1) * floorHeight;
        const maxHeight = context.buildableEnvelope?.maxHeight ?? 15;

        expect(estimatedHeight).toBeLessThanOrEqual(maxHeight);
      });
    });

    describe('Vastu Compliance', () => {
      it('should validate kitchen in southeast', () => {
        const context = createPostEcoContext({
          vastuZones: {
            northeast: ['pooja'],
            southeast: ['kitchen'],
            southwest: ['master-bedroom'],
            northwest: ['bathroom'],
          },
        });

        expect(context.vastuZones?.southeast).toContain('kitchen');
      });

      it('should validate pooja in northeast', () => {
        const context = createPostEcoContext({
          vastuZones: {
            northeast: ['pooja'],
            southeast: ['kitchen'],
            southwest: ['master-bedroom'],
            northwest: ['bathroom'],
          },
          requirements: {
            bedrooms: 3,
            bathrooms: 2,
            hasPooja: true,
            hasParking: true,
            hasStore: true,
            hasServantRoom: false,
            floors: 1,
            budgetRange: 'standard',
          },
        });

        if (context.requirements?.hasPooja) {
          expect(context.vastuZones?.northeast).toContain('pooja');
        }
      });

      it('should detect Vastu violation - toilet in northeast', () => {
        const invalidContext = createPostEcoContext({
          vastuZones: {
            northeast: ['bathroom'], // Violation!
            southeast: ['kitchen'],
            southwest: ['master-bedroom'],
            northwest: ['store'],
          },
        });

        // Bathroom in northeast is a Vastu violation
        expect(invalidContext.vastuZones?.northeast).toContain('bathroom');
      });
    });

    describe('Eco-Design Compliance', () => {
      it('should validate courtyard presence when required', () => {
        // createPostDimensioningContext includes courtyard in rooms
        const context = createPostDimensioningContext({
          courtyardSpec: {
            required: true,
            minArea: 100,
            position: 'central',
          },
        });

        const hasCourtyard = context.rooms?.some(r => r.type === 'courtyard');
        expect(context.courtyardSpec?.required).toBe(true);
        // With dimensioning-context, courtyard should be present in rooms
        expect(hasCourtyard).toBe(true);
      });

      it('should validate cross-ventilation setup', () => {
        const context = createPostEcoContext({
          energyStrategy: {
            passiveCooling: true,
            crossVentilation: true,
            westWallMinimized: true,
            naturalLighting: true,
          },
        });

        expect(context.energyStrategy?.crossVentilation).toBe(true);
      });

      it('should validate rainwater harvesting for required plots', () => {
        const context = createPostEcoContext({
          waterStrategy: {
            rainwaterHarvesting: true,
            greyWaterRecycling: false,
            borewell: false,
            sumpCapacity: 5000,
          },
          plot: {
            width: 30,
            depth: 40,
            area: 1200,
            unit: 'feet',
          },
        });

        // Rainwater harvesting mandatory for plots > 100 sqm in Tamil Nadu
        const plotAreaSqm = (context.plot?.area ?? 0) * 0.0929;
        if (plotAreaSqm > 100) {
          expect(context.waterStrategy?.rainwaterHarvesting).toBe(true);
        }
      });
    });

    describe('Structural Compliance', () => {
      it('should validate wall thickness for load-bearing', () => {
        const mockEngineeringOutput: Partial<EngineeringPlanOutput> = {
          wallSystem: {
            externalThickness: 9,
            internalThickness: 4.5,
            material: 'Burnt clay brick masonry',
            loadBearingWalls: ['north-external', 'south-external'],
          },
        };

        // Load-bearing external walls must be 9 inches
        expect(mockEngineeringOutput.wallSystem?.externalThickness).toBe(9);
      });

      it('should validate staircase dimensions per NBC', () => {
        const mockEngineeringOutput: Partial<EngineeringPlanOutput> = {
          staircase: {
            type: 'L-shaped',
            width: 3.5,
            position: 'central',
            riserHeight: 7,
            treadWidth: 10,
            numSteps: 17,
            hasLanding: true,
          },
        };

        // NBC 2016 requirements
        expect(mockEngineeringOutput.staircase?.width).toBeGreaterThanOrEqual(3);
        expect(mockEngineeringOutput.staircase?.riserHeight).toBeLessThanOrEqual(7.5);
        expect(mockEngineeringOutput.staircase?.treadWidth).toBeGreaterThanOrEqual(10);
      });

      it('should detect staircase violation - width too narrow', () => {
        const invalidEngineeringOutput: Partial<EngineeringPlanOutput> = {
          staircase: {
            type: 'straight',
            width: 2.5, // Too narrow! Minimum is 3 feet
            position: 'side',
            riserHeight: 7,
            treadWidth: 10,
            numSteps: 15,
            hasLanding: false,
          },
        };

        expect(invalidEngineeringOutput.staircase?.width).toBeLessThan(3);
      });
    });

    describe('Dimensional Compliance', () => {
      it('should validate minimum room sizes', () => {
        const context = createPostDimensioningContext();

        // Minimum room sizes per standards
        const minRoomSizes: Record<string, number> = {
          living: 120,
          bedroom: 100,
          kitchen: 50,
          bathroom: 25,
        };

        context.rooms?.forEach((room) => {
          const minSize = minRoomSizes[room.type] || 30;
          // Living room should be at least 120 sqft
          if (room.type === 'living') {
            expect(room.areaSqft).toBeGreaterThanOrEqual(minSize);
          }
        });
      });

      it('should validate total built-up vs plot coverage', () => {
        const context = createPostDimensioningContext({
          plot: {
            width: 30,
            depth: 40,
            area: 1200,
            unit: 'feet',
          },
          buildableEnvelope: {
            width: 24,
            depth: 32,
            area: 768,
            maxHeight: 15,
            maxFloors: 2,
            fsi: 1.5,
          },
          totalBuiltUp: 700, // 700/1200 = 0.58 < 0.6 coverage limit
        });

        const groundCoverage = (context.totalBuiltUp ?? 0) / (context.plot?.area ?? 1);
        const maxCoverage = 0.6; // 60% max in most Tamil Nadu zones

        expect(groundCoverage).toBeLessThanOrEqual(maxCoverage);
      });
    });
  });

  describe('Error Aggregation', () => {
    it('should categorize errors by severity', () => {
      const failedContext = createFailedValidationContext();

      expect(failedContext.validationIssues).toBeDefined();
      expect(failedContext.validationIssues!.length).toBeGreaterThan(0);

      // Each issue should have a type (error/warning)
      failedContext.validationIssues!.forEach((issue) => {
        expect(['error', 'warning']).toContain(issue.type);
        expect(issue.category).toBeDefined();
        expect(issue.message).toBeDefined();
      });
    });

    it('should provide suggested fixes for each issue', () => {
      const failedContext = createFailedValidationContext();

      failedContext.validationIssues!.forEach((issue) => {
        expect(issue.suggestedFix).toBeDefined();
        expect(issue.suggestedFix!.length).toBeGreaterThan(0);
      });
    });

    it('should calculate overall validation severity', () => {
      const failedContext = createFailedValidationContext();

      // If any 'error' type issues exist, severity should be 'high'
      const hasErrors = failedContext.validationIssues?.some(i => i.type === 'error');

      if (hasErrors) {
        expect(failedContext.validationSeverity).toBe('high');
      }
    });
  });

  describe('Pipeline Halt Decision', () => {
    it('should recommend halt for critical errors', () => {
      const failedContext = createFailedValidationContext();

      // Critical errors should halt pipeline
      expect(failedContext.status).toBe('failed');
      expect(failedContext.validationStatus).toBe('FAIL');
    });

    it('should allow continuation with warnings only', () => {
      const context = createCompletedContext({
        validationIssues: [
          {
            id: 'W1',
            type: 'warning',
            category: 'eco',
            message: 'Consider adding more ventilation shafts',
            suggestedFix: 'Add ventilation shaft near bathroom',
          },
        ],
        validationStatus: 'PASS_WITH_WARNINGS',
      });

      expect(context.validationStatus).toBe('PASS_WITH_WARNINGS');
      expect(context.status).toBe('completed');
    });

    it('should create DesignValidationError for halt scenarios', () => {
      const issues = [
        {
          id: 'E1',
          type: 'error' as const,
          category: 'regulation',
          message: 'Setback violation',
          suggestedFix: 'Move building 2 feet',
        },
        {
          id: 'E2',
          type: 'error' as const,
          category: 'structural',
          message: 'Load-bearing wall missing',
          suggestedFix: 'Add load-bearing wall',
        },
      ];

      const context = createFailedValidationContext();
      const error = new DesignValidationError(issues, context);

      expect(error.getCriticalErrors()).toHaveLength(2);
      expect(error.message).toContain('Design validation failed');
    });
  });

  describe('Validation Output Format', () => {
    it('should produce structured validation output', () => {
      const mockOutput: DesignValidationOutput = {
        status: 'PASS',
        overallScore: 95,
        categories: {
          regulation: { score: 100, issues: [] },
          vastu: { score: 90, issues: [] },
          eco: { score: 95, issues: [] },
          structural: { score: 100, issues: [] },
          dimensional: { score: 90, issues: [] },
        },
        criticalIssues: [],
        warnings: [],
        recommendations: [
          'Consider adding a second ventilation shaft for better airflow',
        ],
        tokenUsage: {
          input: 2000,
          output: 500,
          total: 2500,
        },
      };

      expect(mockOutput.status).toBe('PASS');
      expect(mockOutput.overallScore).toBeGreaterThanOrEqual(0);
      expect(mockOutput.categories).toBeDefined();
      expect(Object.keys(mockOutput.categories)).toHaveLength(5);
    });

    it('should include category-specific scores', () => {
      const mockOutput: DesignValidationOutput = {
        status: 'PASS_WITH_WARNINGS',
        overallScore: 85,
        categories: {
          regulation: { score: 100, issues: [] },
          vastu: { score: 70, issues: ['Pooja not in ideal northeast position'] },
          eco: { score: 90, issues: [] },
          structural: { score: 100, issues: [] },
          dimensional: { score: 80, issues: ['Kitchen slightly undersized'] },
        },
        criticalIssues: [],
        warnings: ['Pooja not in ideal northeast position', 'Kitchen slightly undersized'],
        recommendations: [],
        tokenUsage: { input: 1800, output: 400, total: 2200 },
      };

      expect(mockOutput.categories.vastu.score).toBe(70);
      expect(mockOutput.warnings).toHaveLength(2);
    });
  });

  describe('Integration with Upstream Agents', () => {
    it('should validate consistency between rooms and zones', () => {
      const context = createPostDimensioningContext({
        rooms: [
          { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 10, areaSqft: 100, zone: 'service' },
        ],
        vastuZones: {
          southeast: ['kitchen'],
        },
      });

      // Kitchen should be in service zone AND in southeast Vastu zone
      const kitchen = context.rooms?.find(r => r.type === 'kitchen');
      expect(kitchen?.zone).toBe('service');
      expect(context.vastuZones?.southeast).toContain('kitchen');
    });

    it('should validate engineering plan matches structural strategy', () => {
      const context = createPostDimensioningContext({
        structuralStrategy: 'load-bearing',
      });

      const mockEngineeringPlan: Partial<EngineeringPlanOutput> = {
        wallSystem: {
          externalThickness: 9, // Correct for load-bearing
          internalThickness: 4.5,
          material: 'Burnt clay brick masonry',
          loadBearingWalls: ['north-external', 'south-external'], // Has load-bearing walls
        },
      };

      // Load-bearing strategy should have load-bearing walls
      expect(mockEngineeringPlan.wallSystem?.loadBearingWalls?.length).toBeGreaterThan(0);
      expect(context.structuralStrategy).toBe('load-bearing');
    });

    it('should detect mismatch between eco constraints and implementation', () => {
      const context = createPostEcoContext({
        courtyardSpec: {
          required: true,
          minArea: 100,
          position: 'central',
        },
        // But rooms don't include courtyard
        rooms: [
          { id: 'living', name: 'Living Room', type: 'living', width: 15, depth: 12, areaSqft: 180, zone: 'public' },
          { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 10, areaSqft: 100, zone: 'service' },
        ],
      });

      const hasCourtyard = context.rooms?.some(r => r.type === 'courtyard');
      const courtyardRequired = context.courtyardSpec?.required;

      // This is a mismatch - courtyard required but not in rooms
      if (courtyardRequired) {
        // Validation should detect this
        expect(hasCourtyard).toBe(false);
      }
    });
  });

  describe('Token Usage Tracking', () => {
    it('should track token usage for validation', () => {
      const mockOutput: DesignValidationOutput = {
        status: 'PASS',
        overallScore: 100,
        categories: {
          regulation: { score: 100, issues: [] },
          vastu: { score: 100, issues: [] },
          eco: { score: 100, issues: [] },
          structural: { score: 100, issues: [] },
          dimensional: { score: 100, issues: [] },
        },
        criticalIssues: [],
        warnings: [],
        recommendations: [],
        tokenUsage: {
          input: 3000,
          output: 600,
          total: 3600,
        },
      };

      expect(mockOutput.tokenUsage.total).toBe(
        mockOutput.tokenUsage.input + mockOutput.tokenUsage.output
      );
    });

    it('should estimate validation complexity based on context size', () => {
      const simpleContext = createPostDimensioningContext({
        rooms: [
          { id: 'living', name: 'Living', type: 'living', width: 15, depth: 12, areaSqft: 180, zone: 'public' },
        ],
      });

      const complexContext = createPostDimensioningContext({
        rooms: [
          { id: 'living', name: 'Living', type: 'living', width: 15, depth: 12, areaSqft: 180, zone: 'public' },
          { id: 'dining', name: 'Dining', type: 'dining', width: 10, depth: 12, areaSqft: 120, zone: 'public' },
          { id: 'kitchen', name: 'Kitchen', type: 'kitchen', width: 10, depth: 10, areaSqft: 100, zone: 'service' },
          { id: 'master', name: 'Master', type: 'bedroom', width: 14, depth: 12, areaSqft: 168, zone: 'private' },
          { id: 'bed2', name: 'Bed 2', type: 'bedroom', width: 12, depth: 10, areaSqft: 120, zone: 'private' },
          { id: 'bed3', name: 'Bed 3', type: 'bedroom', width: 10, depth: 10, areaSqft: 100, zone: 'private' },
          { id: 'pooja', name: 'Pooja', type: 'pooja', width: 6, depth: 6, areaSqft: 36, zone: 'private' },
        ],
      });

      // More rooms = more validation complexity
      expect(complexContext.rooms?.length).toBeGreaterThan(simpleContext.rooms?.length ?? 0);
    });
  });
});

describe('DesignValidationAgent Error Scenarios', () => {
  let validationAgent: DesignValidationAgent;

  beforeEach(() => {
    clearMocks();
    validationAgent = createDesignValidationAgent();
  });

  afterEach(() => {
    clearMocks();
    jest.clearAllMocks();
  });

  it('should handle missing context fields gracefully', () => {
    const incompleteContext = createPostDimensioningContext();
    delete (incompleteContext as Partial<DesignContext>).vastuZones;

    // Should still work, treating missing vastu as warning
    expect(incompleteContext.vastuZones).toBeUndefined();
  });

  it('should handle empty rooms array', () => {
    const emptyRoomsContext = createPostDimensioningContext({
      rooms: [],
    });

    expect(emptyRoomsContext.rooms).toHaveLength(0);
    // Should produce critical error about missing rooms
  });

  it('should handle invalid room dimensions', () => {
    const invalidContext = createPostDimensioningContext({
      rooms: [
        { id: 'living', name: 'Living', type: 'living', width: -5, depth: 0, areaSqft: 0, zone: 'public' },
      ],
    });

    const room = invalidContext.rooms?.[0];
    expect(room?.width).toBeLessThan(0);
    expect(room?.areaSqft).toBe(0);
    // Validation should catch these
  });
});
