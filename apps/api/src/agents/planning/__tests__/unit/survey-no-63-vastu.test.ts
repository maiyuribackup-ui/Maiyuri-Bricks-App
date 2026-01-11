/**
 * Survey No. 63 - Vastu Compliance Tests
 *
 * Tests for Vastu-compliant floor plan generation based on
 * the handwritten plot survey (Survey No. 63).
 *
 * Plot Details:
 * - West-facing (road on west side)
 * - Irregular trapezoidal shape
 * - ~848 sq.ft buildable area
 * - Required: Living, Dining, Kitchen, Double Bedroom, Dress Room,
 *   Common Toilet, Staircase, Verandah
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  VastuComplianceAgent,
  createVastuComplianceAgent,
} from '../../agents/vastu-compliance';
import type { VastuComplianceInput, VastuComplianceOutput } from '../../types/contracts';
import type { DesignContext } from '../../types/design-context';
import { createMockContext } from '../mocks/context.mock';
import {
  VASTU_INPUT,
  EXPECTED_VASTU_OUTPUT,
  TEST_SCENARIOS,
  validateWestFacingVastu,
  VASTU_ROOM_PLACEMENT,
  REQUIRED_ROOMS,
} from '../fixtures/survey-no-63.fixture';

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

function mockGeminiResponse(response: unknown): void {
  mockResponseQueue.push(
    typeof response === 'string' ? response : JSON.stringify(response)
  );
}

function clearMocks(): void {
  mockResponseQueue = [];
}

describe('Survey No. 63 - Vastu Compliance', () => {
  let agent: VastuComplianceAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = createVastuComplianceAgent();
    mockContext = createMockContext();
  });

  describe('West-Facing Plot Configuration', () => {
    it('should accept west as valid orientation', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.meta?.orientation).toBe('west');
    });

    it('should recommend entrance on west side for west-facing plot', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.west).toContain('main-entrance');
    });

    it('should flag west-facing as minor conflict (not major)', async () => {
      mockGeminiResponse({
        ...EXPECTED_VASTU_OUTPUT,
        conflicts: [
          {
            conflict: 'West-facing plot - main entrance in West',
            severity: 'minor',
            resolution: 'West entrance acceptable when road is on West',
          },
        ],
      });

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const westConflicts = result.data?.conflicts.filter(
        c => c.conflict.toLowerCase().includes('west')
      );
      expect(westConflicts?.every(c => c.severity !== 'major')).toBe(true);
    });

    it('should recommend veranda on west for sun protection', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.west).toContain('veranda');
    });
  });

  describe('Kitchen Placement (Fire Element - Southeast)', () => {
    it('should recommend kitchen in southeast zone', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.southeast).toContain('kitchen');
    });

    it('should NOT recommend kitchen in northeast (water zone)', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.northeast).not.toContain('kitchen');
    });

    it('should flag kitchen in northeast as major conflict', async () => {
      // Test case where kitchen is incorrectly placed
      const badPlacement = {
        ...EXPECTED_VASTU_OUTPUT,
        recommended_zones: {
          ...EXPECTED_VASTU_OUTPUT.recommended_zones,
          northeast: ['kitchen'], // BAD
          southeast: ['toilet'], // BAD
        },
        conflicts: [
          {
            conflict: 'Kitchen in Northeast violates Vastu (fire in water zone)',
            severity: 'major',
            resolution: 'Relocate kitchen to Southeast',
          },
        ],
      };
      mockGeminiResponse(badPlacement);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      // Agent should identify this as problematic
      const kitchenConflict = result.data?.conflicts.find(
        c => c.conflict.toLowerCase().includes('kitchen') &&
             c.conflict.toLowerCase().includes('northeast')
      );
      if (kitchenConflict) {
        expect(kitchenConflict.severity).toBe('major');
      }
    });
  });

  describe('Bedroom Placement (Southwest for Master)', () => {
    it('should recommend master bedroom in southwest', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const swZone = result.data?.recommended_zones.southwest || [];
      const hasBedroomInSW = swZone.some(
        z => z.includes('bedroom') || z.includes('master')
      );
      expect(hasBedroomInSW).toBe(true);
    });

    it('should recommend dressing room adjacent to bedroom in southwest', async () => {
      mockGeminiResponse({
        ...EXPECTED_VASTU_OUTPUT,
        recommended_zones: {
          ...EXPECTED_VASTU_OUTPUT.recommended_zones,
          southwest: ['master-bedroom', 'dressing'],
        },
      });

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.southwest).toContain('dressing');
    });

    it('should NOT recommend bedroom in northeast', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const neZone = result.data?.recommended_zones.northeast || [];
      const hasBedroomInNE = neZone.some(z => z.includes('bedroom'));
      expect(hasBedroomInNE).toBe(false);
    });
  });

  describe('Toilet Placement (Northwest)', () => {
    it('should recommend toilet in northwest zone', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.northwest).toContain('toilet');
    });

    it('should NOT recommend toilet in northeast (highly inauspicious)', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.northeast).not.toContain('toilet');
    });

    it('should flag toilet in northeast as major violation', async () => {
      const badPlacement = {
        ...EXPECTED_VASTU_OUTPUT,
        recommended_zones: {
          ...EXPECTED_VASTU_OUTPUT.recommended_zones,
          northeast: ['toilet'], // MAJOR VIOLATION
        },
        conflicts: [
          {
            conflict: 'Toilet in Northeast is highly inauspicious',
            severity: 'major',
            resolution: 'Move toilet to Northwest or West',
          },
        ],
      };
      mockGeminiResponse(badPlacement);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      const toiletConflict = result.data?.conflicts.find(
        c => c.conflict.toLowerCase().includes('toilet') &&
             c.conflict.toLowerCase().includes('northeast')
      );
      if (toiletConflict) {
        expect(toiletConflict.severity).toBe('major');
      }
    });
  });

  describe('Living and Dining Placement', () => {
    it('should recommend living room in north or east zones', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const hasLivingInNorth = result.data?.recommended_zones.north?.includes('living');
      const hasLivingInEast = result.data?.recommended_zones.east?.includes('living');
      expect(hasLivingInNorth || hasLivingInEast).toBe(true);
    });

    it('should recommend dining in west or northwest', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const hasInWest = result.data?.recommended_zones.west?.includes('dining');
      const hasInNW = result.data?.recommended_zones.northwest?.includes('dining');
      expect(hasInWest || hasInNW).toBe(true);
    });
  });

  describe('Staircase Placement', () => {
    it('should recommend staircase in south or southwest', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const hasInSouth = result.data?.recommended_zones.south?.includes('staircase');
      const hasInSW = result.data?.recommended_zones.southwest?.some(
        z => z.includes('stair')
      );
      expect(hasInSouth || hasInSW).toBe(true);
    });

    it('should NOT recommend staircase in center (Brahmasthana)', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const centerZone = result.data?.recommended_zones.center || [];
      const hasStaircaseInCenter = centerZone.some(z => z.includes('stair'));
      expect(hasStaircaseInCenter).toBe(false);
    });
  });

  describe('Center (Brahmasthana) - Courtyard', () => {
    it('should recommend courtyard or open space in center', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const centerZone = result.data?.recommended_zones.center || [];
      const hasOpenSpace = centerZone.some(
        z => z.includes('courtyard') || z.includes('open')
      );
      expect(hasOpenSpace).toBe(true);
    });

    it('should NOT recommend construction in center', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const centerZone = result.data?.recommended_zones.center || [];
      const hasBuilding = centerZone.some(
        z => z.includes('bedroom') || z.includes('kitchen') || z.includes('toilet')
      );
      expect(hasBuilding).toBe(false);
    });
  });

  describe('Buildable Area Constraints', () => {
    it('should handle small buildable area (~848 sqft)', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      // Should succeed without major violations for typical requirements
      const majorConflicts = result.data?.conflicts.filter(c => c.severity === 'major');
      expect(majorConflicts?.length || 0).toBeLessThanOrEqual(1);
    });

    it('should add small plot assumption when area < 1000 sqft', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const smallPlotAssumption = result.assumptions.find(
        a => a.assumptionId === 'small_plot_vastu'
      );
      expect(smallPlotAssumption).toBeDefined();
    });
  });

  describe('Required Rooms Coverage', () => {
    /**
     * Verify all required rooms have valid Vastu placements
     */
    it('should provide zones for all required rooms', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);

      const allZones = Object.values(result.data?.recommended_zones || {}).flat();

      // Check living room
      expect(allZones.some(z => z.includes('living'))).toBe(true);

      // Check dining
      expect(allZones.some(z => z.includes('dining'))).toBe(true);

      // Check kitchen
      expect(allZones.some(z => z.includes('kitchen'))).toBe(true);

      // Check bedroom
      expect(allZones.some(z => z.includes('bedroom'))).toBe(true);

      // Check toilet
      expect(allZones.some(z => z.includes('toilet'))).toBe(true);

      // Check staircase
      expect(allZones.some(z => z.includes('stair'))).toBe(true);

      // Check veranda
      expect(allZones.some(z => z.includes('veranda') || z.includes('verandah'))).toBe(true);
    });
  });

  describe('Vastu Validation Helper', () => {
    it('should validate correct west-facing layout', () => {
      const validZones: VastuComplianceOutput['recommended_zones'] = {
        northeast: ['water-element', 'meditation'],
        east: ['living', 'study'],
        southeast: ['kitchen'],
        south: ['staircase'],
        southwest: ['master-bedroom'],
        west: ['main-entrance', 'veranda'],
        northwest: ['toilet', 'guest-room'],
        north: ['living', 'treasury'],
        center: ['courtyard'],
      };

      const validation = validateWestFacingVastu(validZones);
      expect(validation.valid).toBe(true);
      expect(validation.violations).toHaveLength(0);
    });

    it('should catch kitchen not in southeast', () => {
      const invalidZones: VastuComplianceOutput['recommended_zones'] = {
        northeast: ['kitchen'], // WRONG
        east: ['living'],
        southeast: ['bedroom'], // Kitchen should be here
        south: ['staircase'],
        southwest: ['master-bedroom'],
        west: ['main-entrance'],
        northwest: ['toilet'],
        north: ['living'],
        center: ['courtyard'],
      };

      const validation = validateWestFacingVastu(invalidZones);
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('Kitchen'))).toBe(true);
    });

    it('should catch toilet in northeast', () => {
      const invalidZones: VastuComplianceOutput['recommended_zones'] = {
        northeast: ['toilet'], // WRONG
        east: ['living'],
        southeast: ['kitchen'],
        south: ['staircase'],
        southwest: ['master-bedroom'],
        west: ['main-entrance'],
        northwest: ['guest-room'],
        north: ['living'],
        center: ['courtyard'],
      };

      const validation = validateWestFacingVastu(invalidZones);
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('Toilet'))).toBe(true);
    });

    it('should catch missing entrance on west', () => {
      const invalidZones: VastuComplianceOutput['recommended_zones'] = {
        northeast: ['water-element'],
        east: ['main-entrance'], // Wrong for west-facing
        southeast: ['kitchen'],
        south: ['staircase'],
        southwest: ['master-bedroom'],
        west: ['veranda'], // Missing entrance
        northwest: ['toilet'],
        north: ['living'],
        center: ['courtyard'],
      };

      const validation = validateWestFacingVastu(invalidZones);
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('entrance'))).toBe(true);
    });
  });

  describe('Test Scenarios', () => {
    it('should handle happy path scenario', async () => {
      mockGeminiResponse(TEST_SCENARIOS.happyPath.expected);

      const result = await agent.execute(
        TEST_SCENARIOS.happyPath.input,
        mockContext
      );

      expect(result.success).toBe(true);
    });

    it('should handle pooja room requirement', async () => {
      mockGeminiResponse({
        ...EXPECTED_VASTU_OUTPUT,
        recommended_zones: {
          ...EXPECTED_VASTU_OUTPUT.recommended_zones,
          northeast: ['pooja', 'water-element'],
        },
      });

      const result = await agent.execute(
        TEST_SCENARIOS.withPooja.input,
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.northeast).toContain('pooja');
      expect(result.meta?.hasPooja).toBe(true);
    });

    it('should handle multiple bedrooms', async () => {
      mockGeminiResponse({
        ...EXPECTED_VASTU_OUTPUT,
        recommended_zones: {
          ...EXPECTED_VASTU_OUTPUT.recommended_zones,
          southwest: ['master-bedroom'],
          south: ['bedroom'],
        },
      });

      const result = await agent.execute(
        TEST_SCENARIOS.multipleBedrooms.input,
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data?.recommended_zones.southwest).toContain('master-bedroom');
      // Second bedroom can be in south or west
      const hasBedroom2 =
        result.data?.recommended_zones.south?.includes('bedroom') ||
        result.data?.recommended_zones.west?.some(z => z.includes('bedroom'));
      expect(hasBedroom2).toBe(true);
    });

    it('should handle small plot with compromises', async () => {
      mockGeminiResponse({
        ...EXPECTED_VASTU_OUTPUT,
        conflicts: [
          {
            conflict: 'Small buildable area requires Vastu compromises',
            severity: 'minor',
            resolution: 'Prioritize essential Vastu principles',
          },
        ],
      });

      const result = await agent.execute(
        TEST_SCENARIOS.smallPlot.input,
        mockContext
      );

      expect(result.success).toBe(true);
      // Small plot should still work, possibly with minor conflicts
    });
  });

  describe('Open Questions Generation', () => {
    it('should ask about Vastu priority when major conflicts exist', async () => {
      mockGeminiResponse({
        ...EXPECTED_VASTU_OUTPUT,
        conflicts: [
          {
            conflict: 'Major Vastu violation detected',
            severity: 'major',
            resolution: 'Requires compromise',
          },
        ],
      });

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const priorityQuestion = result.openQuestions.find(
        q => q.questionId === 'vastu_priority'
      );
      expect(priorityQuestion).toBeDefined();
    });
  });

  describe('Assumptions Extraction', () => {
    it('should include entrance orientation assumption', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const entranceAssumption = result.assumptions.find(
        a => a.assumptionId === 'entrance_orientation'
      );
      expect(entranceAssumption).toBeDefined();
      expect(entranceAssumption?.assumption).toContain('west');
    });

    it('should include Vastu flexibility assumption', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const flexAssumption = result.assumptions.find(
        a => a.assumptionId === 'vastu_flexibility'
      );
      expect(flexAssumption).toBeDefined();
    });

    it('should include courtyard Brahmasthana assumption', async () => {
      mockGeminiResponse(EXPECTED_VASTU_OUTPUT);

      const result = await agent.execute(VASTU_INPUT, mockContext);

      expect(result.success).toBe(true);
      const courtyardAssumption = result.assumptions.find(
        a => a.assumptionId === 'courtyard_brahmasthana'
      );
      expect(courtyardAssumption).toBeDefined();
    });
  });
});
