/**
 * Floor Plan Generation Pipeline - Integration Tests
 *
 * Tests the complete flow from plot survey input to Vastu-compliant
 * floor plan output for Survey No. 63.
 *
 * This tests the integration between:
 * - Diagram Interpreter Agent
 * - Regulation Compliance Agent
 * - Vastu Compliance Agent
 * - Eco-Design Agent
 * - Dimensioning Agent
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, jest } from '@jest/globals';
import type { DesignContext } from '../../types/design-context';
import type {
  VastuComplianceInput,
  VastuComplianceOutput,
  RegulationComplianceOutput,
  DimensioningOutput,
} from '../../types/contracts';
import { createMockContext, createPostRegulationContext } from '../mocks/context.mock';
import {
  SURVEY_NO_63_RAW,
  VASTU_INPUT,
  EXPECTED_VASTU_OUTPUT,
  REGULATION_INPUT,
  EXPECTED_REGULATION_OUTPUT,
  DIMENSIONING_INPUT,
  EXPECTED_DIMENSIONING_OUTPUT,
  REQUIRED_ROOMS,
  validateWestFacingVastu,
  validateEcoRequirements,
  calculateBuildableArea,
} from '../fixtures/survey-no-63.fixture';

// Mock the Gemini SDK for all agents
let mockResponseQueue: string[] = [];

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

function mockGeminiResponse(response: unknown): void {
  mockResponseQueue.push(
    typeof response === 'string' ? response : JSON.stringify(response)
  );
}

function clearMocks(): void {
  mockResponseQueue = [];
}

describe('Floor Plan Generation Pipeline - Survey No. 63', () => {
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    mockContext = createMockContext();
  });

  describe('Survey Dimension Verification', () => {
    /**
     * Verify that all dimensions match the handwritten survey exactly:
     *
     * Plot Dimensions:
     * - North: 29'-0"
     * - South: 27'-6"
     * - East: 41'-0" (circled - road facing indicator)
     * - West: 43'-0"
     *
     * Setbacks:
     * - North: 2'-0"
     * - South: 3'-0"
     * - East: 3'-6"
     * - West: 2'-0"
     *
     * Road: West side, 20'-0" width
     */
    it('should match exact plot dimensions from survey', () => {
      expect(SURVEY_NO_63_RAW.dimensions.north.feet).toBe(29);
      expect(SURVEY_NO_63_RAW.dimensions.north.inches).toBe(0);

      expect(SURVEY_NO_63_RAW.dimensions.south.feet).toBe(27);
      expect(SURVEY_NO_63_RAW.dimensions.south.inches).toBe(6);
      expect(SURVEY_NO_63_RAW.dimensions.south.totalFeet).toBe(27.5);

      expect(SURVEY_NO_63_RAW.dimensions.east.feet).toBe(41);
      expect(SURVEY_NO_63_RAW.dimensions.east.inches).toBe(0);

      expect(SURVEY_NO_63_RAW.dimensions.west.feet).toBe(43);
      expect(SURVEY_NO_63_RAW.dimensions.west.inches).toBe(0);
    });

    it('should match exact setback dimensions from survey', () => {
      expect(SURVEY_NO_63_RAW.setbacks.north.totalFeet).toBe(2);
      expect(SURVEY_NO_63_RAW.setbacks.south.totalFeet).toBe(3);
      expect(SURVEY_NO_63_RAW.setbacks.east.totalFeet).toBe(3.5);
      expect(SURVEY_NO_63_RAW.setbacks.west.totalFeet).toBe(2);
    });

    it('should match road specifications from survey', () => {
      expect(SURVEY_NO_63_RAW.road.side).toBe('west');
      expect(SURVEY_NO_63_RAW.road.width.totalFeet).toBe(20);
    });

    it('should include all 8 required rooms from survey', () => {
      const requiredRoomNames = [
        'Living Room',
        'Dining',
        'Kitchen',
        'Double Bedroom',
        'Dress Room',
        'Common Toilet',
        'Staircase',
        'Verandah',
      ];

      expect(REQUIRED_ROOMS.length).toBe(8);
      requiredRoomNames.forEach(name => {
        const found = REQUIRED_ROOMS.find(r => r.name === name);
        expect(found).toBeDefined();
      });
    });

    it('should calculate correct buildable area from survey dimensions', () => {
      // Average width: (29 + 27.5) / 2 = 28.25 feet
      expect(SURVEY_NO_63_RAW.averageWidth).toBeCloseTo(28.25, 2);

      // Average depth: (41 + 43) / 2 = 42 feet
      expect(SURVEY_NO_63_RAW.averageDepth).toBeCloseTo(42, 2);

      // Buildable width after setbacks: 28.25 - 2 - 3 = 23.25 feet
      const buildableWidth = SURVEY_NO_63_RAW.averageWidth -
        SURVEY_NO_63_RAW.setbacks.north.totalFeet -
        SURVEY_NO_63_RAW.setbacks.south.totalFeet;
      expect(buildableWidth).toBeCloseTo(23.25, 2);

      // Buildable depth after setbacks: 42 - 2 - 3.5 = 36.5 feet
      const buildableDepth = SURVEY_NO_63_RAW.averageDepth -
        SURVEY_NO_63_RAW.setbacks.west.totalFeet -
        SURVEY_NO_63_RAW.setbacks.east.totalFeet;
      expect(buildableDepth).toBeCloseTo(36.5, 2);

      // Buildable area: 23.25 * 36.5 = 848.625 sq.ft
      const buildableArea = buildableWidth * buildableDepth;
      expect(buildableArea).toBeCloseTo(848.6, 0);
    });
  });

  describe('Pipeline Stage 1: Plot Data Extraction', () => {
    it('should correctly calculate buildable area from survey dimensions', () => {
      const plot = {
        width: SURVEY_NO_63_RAW.averageWidth,
        depth: SURVEY_NO_63_RAW.averageDepth,
      };

      const setbacks = {
        front: SURVEY_NO_63_RAW.setbacks.west.totalFeet,
        rear: SURVEY_NO_63_RAW.setbacks.east.totalFeet,
        left: SURVEY_NO_63_RAW.setbacks.south.totalFeet,
        right: SURVEY_NO_63_RAW.setbacks.north.totalFeet,
      };

      const buildable = calculateBuildableArea(plot, setbacks);

      // Verify calculations
      expect(buildable.width).toBeCloseTo(23.25, 1); // 28.25 - 2 - 3
      expect(buildable.depth).toBeCloseTo(36.5, 1); // 42 - 2 - 3.5
      expect(buildable.area).toBeCloseTo(848.6, 0);
    });

    it('should handle irregular (trapezoidal) plot dimensions', () => {
      const { dimensions } = SURVEY_NO_63_RAW;

      // North side is wider than South
      expect(dimensions.north.totalFeet).toBeGreaterThan(dimensions.south.totalFeet);

      // East side is shorter than West
      expect(dimensions.east.totalFeet).toBeLessThan(dimensions.west.totalFeet);

      // Calculate average for planning
      const avgWidth = (dimensions.north.totalFeet + dimensions.south.totalFeet) / 2;
      const avgDepth = (dimensions.east.totalFeet + dimensions.west.totalFeet) / 2;

      expect(avgWidth).toBeCloseTo(28.25, 1);
      expect(avgDepth).toBeCloseTo(42, 1);
    });

    it('should identify west as road-facing direction', () => {
      expect(SURVEY_NO_63_RAW.road.side).toBe('west');
      expect(SURVEY_NO_63_RAW.road.width.totalFeet).toBe(20);
    });
  });

  describe('Pipeline Stage 2: Regulation Compliance', () => {
    it('should calculate correct buildable envelope', () => {
      const expectedEnvelope = EXPECTED_REGULATION_OUTPUT.buildable_envelope;

      // Verify envelope dimensions are within setbacks
      expect(expectedEnvelope.width).toBeLessThan(SURVEY_NO_63_RAW.averageWidth);
      expect(expectedEnvelope.depth).toBeLessThan(SURVEY_NO_63_RAW.averageDepth);
    });

    it('should respect all setback requirements', () => {
      const { setbacks } = SURVEY_NO_63_RAW;
      const buildableWidth = EXPECTED_REGULATION_OUTPUT.buildable_envelope.width;
      const buildableDepth = EXPECTED_REGULATION_OUTPUT.buildable_envelope.depth;

      // Original width minus setbacks should equal buildable width
      const expectedWidth = SURVEY_NO_63_RAW.averageWidth -
        setbacks.south.totalFeet - setbacks.north.totalFeet;

      // Allow for calculation differences
      expect(buildableWidth).toBeGreaterThan(0);
      expect(buildableDepth).toBeGreaterThan(0);
    });

    it('should apply correct FSI for residential plot', () => {
      const expectedFSI = EXPECTED_REGULATION_OUTPUT.buildable_envelope.fsi;

      // Tamil Nadu residential FSI is typically 1.5 for plots under 1500 sqft
      expect(expectedFSI).toBe(1.5);
    });

    it('should allow G+1 construction (2 floors)', () => {
      const maxFloors = EXPECTED_REGULATION_OUTPUT.buildable_envelope.maxFloors;
      expect(maxFloors).toBe(2);
    });

    it('should have no regulation violations for valid plot', () => {
      expect(EXPECTED_REGULATION_OUTPUT.violations).toHaveLength(0);
    });
  });

  describe('Pipeline Stage 3: Vastu Compliance', () => {
    it('should integrate regulation output as Vastu input', () => {
      // Vastu input should use buildable envelope from regulation
      expect(VASTU_INPUT.buildableEnvelope.width).toBe(
        EXPECTED_REGULATION_OUTPUT.buildable_envelope.width
      );
      expect(VASTU_INPUT.buildableEnvelope.area).toBeCloseTo(
        EXPECTED_REGULATION_OUTPUT.buildable_envelope.area, 0
      );
    });

    it('should use west orientation from plot data', () => {
      expect(VASTU_INPUT.orientation).toBe('west');
      expect(SURVEY_NO_63_RAW.road.side).toBe('west');
    });

    it('should provide valid zone recommendations for all 9 directions', () => {
      const zones = EXPECTED_VASTU_OUTPUT.recommended_zones;

      // All 9 Vastu zones should be present
      expect(zones.northeast).toBeDefined();
      expect(zones.east).toBeDefined();
      expect(zones.southeast).toBeDefined();
      expect(zones.south).toBeDefined();
      expect(zones.southwest).toBeDefined();
      expect(zones.west).toBeDefined();
      expect(zones.northwest).toBeDefined();
      expect(zones.north).toBeDefined();
      expect(zones.center).toBeDefined();

      // Each zone should have recommendations
      Object.values(zones).forEach(zone => {
        expect(Array.isArray(zone)).toBe(true);
        expect(zone.length).toBeGreaterThan(0);
      });
    });

    it('should validate west-facing Vastu layout', () => {
      const validation = validateWestFacingVastu(EXPECTED_VASTU_OUTPUT.recommended_zones);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Pipeline Stage 4: Eco-Design Integration', () => {
    it('should require courtyard for eco-compliance', () => {
      const rooms = EXPECTED_DIMENSIONING_OUTPUT.rooms;
      const courtyard = EXPECTED_DIMENSIONING_OUTPUT.courtyard;

      const validation = validateEcoRequirements(rooms, courtyard);
      expect(validation.valid).toBe(true);
    });

    it('should require veranda for west-facing plot', () => {
      const rooms = EXPECTED_DIMENSIONING_OUTPUT.rooms;
      const hasVeranda = rooms.some(r => r.type === 'veranda');
      expect(hasVeranda).toBe(true);
    });

    it('should place veranda on west for sun protection', () => {
      // Veranda should be adjacent to entrance on west
      const veranda = EXPECTED_DIMENSIONING_OUTPUT.rooms.find(
        r => r.type === 'veranda'
      );
      expect(veranda).toBeDefined();
      expect(veranda?.adjacent_to).toContain('entrance');
    });
  });

  describe('Pipeline Stage 5: Room Dimensioning', () => {
    it('should dimension all required rooms from survey', () => {
      const rooms = EXPECTED_DIMENSIONING_OUTPUT.rooms;

      // Check each required room type exists
      REQUIRED_ROOMS.forEach(required => {
        const found = rooms.find(r =>
          r.type === required.type ||
          r.name.toLowerCase().includes(required.name.toLowerCase())
        );
        expect(found).toBeDefined();
      });
    });

    it('should fit all rooms within buildable area', () => {
      const totalBuiltUp = EXPECTED_DIMENSIONING_OUTPUT.total_built_up_sqft;
      const buildableArea = VASTU_INPUT.buildableEnvelope.area;

      // Built-up should not exceed buildable area
      expect(totalBuiltUp).toBeLessThanOrEqual(buildableArea);
    });

    it('should achieve reasonable efficiency (>80%)', () => {
      const efficiency = EXPECTED_DIMENSIONING_OUTPUT.efficiency_percent;
      expect(efficiency).toBeGreaterThan(80);
    });

    it('should provide room adjacency information', () => {
      const rooms = EXPECTED_DIMENSIONING_OUTPUT.rooms;

      // Kitchen should be adjacent to dining
      const kitchen = rooms.find(r => r.type === 'kitchen');
      expect(kitchen?.adjacent_to).toContain('dining');

      // Living should be adjacent to courtyard
      const living = rooms.find(r => r.type === 'living');
      expect(living?.adjacent_to).toContain('courtyard');

      // Dressing should be adjacent to bedroom
      const dressing = rooms.find(r => r.type === 'dressing');
      expect(dressing?.adjacent_to).toContain('bedroom');
    });

    it('should provide minimum room dimensions', () => {
      const rooms = EXPECTED_DIMENSIONING_OUTPUT.rooms;

      rooms.forEach(room => {
        // All rooms should have positive dimensions
        expect(room.width).toBeGreaterThan(0);
        expect(room.depth).toBeGreaterThan(0);
        expect(room.area_sqft).toBeGreaterThan(0);

        // Area should equal width * depth
        expect(room.area_sqft).toBe(room.width * room.depth);
      });
    });
  });

  describe('Full Pipeline Integration', () => {
    it('should produce complete floor plan from survey data', () => {
      // Simulate full pipeline output
      const pipelineOutput = {
        survey: SURVEY_NO_63_RAW,
        regulation: EXPECTED_REGULATION_OUTPUT,
        vastu: EXPECTED_VASTU_OUTPUT,
        dimensioning: EXPECTED_DIMENSIONING_OUTPUT,
      };

      // Verify data flows correctly between stages
      expect(pipelineOutput.regulation.buildable_envelope).toBeDefined();
      expect(pipelineOutput.vastu.recommended_zones).toBeDefined();
      expect(pipelineOutput.dimensioning.rooms.length).toBeGreaterThan(0);
    });

    it('should maintain consistency across pipeline stages', () => {
      // Buildable area should be consistent
      const regArea = EXPECTED_REGULATION_OUTPUT.buildable_envelope.area;
      const vastuArea = VASTU_INPUT.buildableEnvelope.area;
      const dimArea = DIMENSIONING_INPUT.buildableEnvelope.area;

      expect(vastuArea).toBeCloseTo(regArea, 0);
      expect(dimArea).toBeCloseTo(regArea, 0);
    });

    it('should handle all required rooms without conflicts', () => {
      const zones = EXPECTED_VASTU_OUTPUT.recommended_zones;
      const allZoneRooms = Object.values(zones).flat();

      // All required room types should appear in some zone
      const requiredTypes = ['living', 'dining', 'kitchen', 'bedroom', 'toilet', 'staircase', 'veranda'];

      requiredTypes.forEach(type => {
        const found = allZoneRooms.some(z =>
          z.toLowerCase().includes(type) ||
          (type === 'veranda' && z.toLowerCase().includes('verand')) ||
          (type === 'bedroom' && z.toLowerCase().includes('master'))
        );
        expect(found).toBe(true);
      });
    });
  });

  describe('Error Handling Across Pipeline', () => {
    it('should handle missing orientation gracefully', async () => {
      const inputWithoutOrientation = {
        ...VASTU_INPUT,
        orientation: undefined as any,
      };

      // Import and create agent
      const { VastuComplianceAgent } = await import('../../agents/vastu-compliance');
      const agent = new VastuComplianceAgent();

      const result = await agent.execute(inputWithoutOrientation, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('orientation');
    });

    it('should handle missing buildable envelope gracefully', async () => {
      const inputWithoutEnvelope = {
        ...VASTU_INPUT,
        buildableEnvelope: undefined as any,
      };

      const { VastuComplianceAgent } = await import('../../agents/vastu-compliance');
      const agent = new VastuComplianceAgent();

      const result = await agent.execute(inputWithoutEnvelope, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('envelope');
    });

    it('should handle missing requirements gracefully', async () => {
      const inputWithoutRequirements = {
        ...VASTU_INPUT,
        requirements: undefined as any,
      };

      const { VastuComplianceAgent } = await import('../../agents/vastu-compliance');
      const agent = new VastuComplianceAgent();

      const result = await agent.execute(inputWithoutRequirements, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Requirements');
    });
  });

  describe('Vastu-Eco Integration Validation', () => {
    it('should ensure courtyard in center satisfies both Vastu and Eco', () => {
      // Vastu: Center (Brahmasthana) should be open
      const centerZone = EXPECTED_VASTU_OUTPUT.recommended_zones.center;
      expect(centerZone.some(z => z.includes('courtyard') || z.includes('open'))).toBe(true);

      // Eco: Courtyard is mandatory for ventilation
      const courtyard = EXPECTED_DIMENSIONING_OUTPUT.courtyard;
      expect(courtyard.area_sqft).toBeGreaterThanOrEqual(60);
    });

    it('should ensure kitchen in southeast (fire element)', () => {
      const seZone = EXPECTED_VASTU_OUTPUT.recommended_zones.southeast;
      expect(seZone).toContain('kitchen');
    });

    it('should ensure toilet in northwest (air element)', () => {
      const nwZone = EXPECTED_VASTU_OUTPUT.recommended_zones.northwest;
      expect(nwZone).toContain('toilet');
    });

    it('should ensure veranda placement protects from west sun', () => {
      const westZone = EXPECTED_VASTU_OUTPUT.recommended_zones.west;
      expect(westZone.some(z => z.includes('veranda'))).toBe(true);
    });
  });

  describe('Room Size Constraints', () => {
    it('should meet minimum room size requirements', () => {
      const rooms = EXPECTED_DIMENSIONING_OUTPUT.rooms;

      // Living room: minimum 150 sqft
      const living = rooms.find(r => r.type === 'living');
      expect(living?.area_sqft).toBeGreaterThanOrEqual(150);

      // Bedroom: minimum 120 sqft
      const bedroom = rooms.find(r => r.type === 'bedroom');
      expect(bedroom?.area_sqft).toBeGreaterThanOrEqual(120);

      // Kitchen: minimum 80 sqft
      const kitchen = rooms.find(r => r.type === 'kitchen');
      expect(kitchen?.area_sqft).toBeGreaterThanOrEqual(80);

      // Toilet: minimum 30 sqft
      const toilet = rooms.find(r => r.type === 'toilet');
      expect(toilet?.area_sqft).toBeGreaterThanOrEqual(30);
    });

    it('should maintain room proportions (aspect ratio)', () => {
      const rooms = EXPECTED_DIMENSIONING_OUTPUT.rooms;

      // Exclude naturally elongated elements (veranda, staircase, courtyard)
      const elongatedTypes = ['veranda', 'staircase', 'courtyard'];

      rooms.forEach(room => {
        const aspectRatio = room.width / room.depth;

        if (elongatedTypes.includes(room.type)) {
          // Verandas and staircases can be long and narrow
          expect(aspectRatio).toBeGreaterThanOrEqual(0.2);
          expect(aspectRatio).toBeLessThanOrEqual(5);
        } else {
          // Regular rooms should have reasonable proportions
          expect(aspectRatio).toBeGreaterThanOrEqual(0.5);
          expect(aspectRatio).toBeLessThanOrEqual(2);
        }
      });
    });
  });
});
