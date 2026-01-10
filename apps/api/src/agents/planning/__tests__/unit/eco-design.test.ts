/**
 * EcoDesignAgent Unit Tests
 *
 * Tests for the eco-friendly design agent.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  EcoDesignAgent,
  createEcoDesignAgent,
} from '../../agents/eco-design';
import type { EcoDesignInput } from '../../types/contracts';
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

describe('EcoDesignAgent', () => {
  let agent: EcoDesignAgent;
  let mockContext: DesignContext;

  beforeEach(() => {
    clearMocks();
    agent = new EcoDesignAgent();
    mockContext = createMockContext();
  });

  describe('factory function', () => {
    it('should create agent with default config', () => {
      const createdAgent = createEcoDesignAgent();
      expect(createdAgent).toBeInstanceOf(EcoDesignAgent);
      expect(createdAgent.agentName).toBe('eco-design');
    });

    it('should create agent with custom config', () => {
      const createdAgent = createEcoDesignAgent({
        maxTokens: 8192,
        temperature: 0.05,
      });
      expect(createdAgent).toBeInstanceOf(EcoDesignAgent);
    });
  });

  describe('execute', () => {
    describe('input validation', () => {
      it('should fail when plot dimensions are missing', async () => {
        const input = {
          orientation: 'east',
        } as EcoDesignInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot dimensions');
      });

      it('should fail when plot width is zero', async () => {
        const input: EcoDesignInput = {
          plot: { width: 0, depth: 40 },
          orientation: 'east',
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot width must be a positive number');
      });

      it('should fail when plot depth is zero', async () => {
        const input: EcoDesignInput = {
          plot: { width: 30, depth: 0 },
          orientation: 'east',
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Plot depth must be a positive number');
      });

      it('should fail when orientation is missing', async () => {
        const input = {
          plot: { width: 30, depth: 40 },
        } as EcoDesignInput;
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('orientation');
      });

      it('should fail for invalid orientation', async () => {
        const input = {
          plot: { width: 30, depth: 40 },
          orientation: 'invalid' as any,
        };
        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Invalid orientation');
      });
    });

    describe('successful eco design analysis', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      const mockSuccessResponse = {
        mandatory_elements: [
          'central-courtyard',
          'veranda',
          'cross-ventilation',
          'rainwater-harvesting',
          'natural-lighting',
          'west-wall-buffer',
        ],
        energy_strategy: {
          passive_cooling: true,
          cross_ventilation: true,
          west_wall_minimized: true,
          natural_lighting: true,
        },
        water_strategy: {
          rainwater_harvesting: true,
          greywater_recycling: false,
          sump_capacity_liters: 8000,
        },
        material_preferences: [
          {
            material: 'CSEB',
            reason: 'Local soil, minimal cement',
            carbon_impact: 'low',
          },
        ],
        courtyard: {
          required: true,
          min_area_sqft: 96,
          position: 'central',
        },
        veranda: {
          required: true,
          min_width_feet: 4,
          sides: ['east', 'south'],
        },
        violations_if_removed: [
          'If courtyard is removed: Loss of natural ventilation',
        ],
      };

      it('should successfully analyze plot', async () => {
        mockGeminiResponse(mockSuccessResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.agentName).toBe('eco-design');
        expect(result.data?.mandatory_elements).toBeDefined();
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

    describe('mandatory elements enforcement', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      it('should always include all mandatory eco elements', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],  // Only one provided
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        // Agent should enforce all mandatory elements
        expect(result.data?.mandatory_elements).toContain('central-courtyard');
        expect(result.data?.mandatory_elements).toContain('veranda');
        expect(result.data?.mandatory_elements).toContain('cross-ventilation');
        expect(result.data?.mandatory_elements).toContain('rainwater-harvesting');
        expect(result.data?.mandatory_elements).toContain('natural-lighting');
        expect(result.data?.mandatory_elements).toContain('west-wall-buffer');
      });

      it('should always require courtyard', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.courtyard.required).toBe(true);
      });

      it('should always require veranda', async () => {
        mockGeminiResponse({
          mandatory_elements: ['veranda'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.veranda.required).toBe(true);
      });
    });

    describe('courtyard calculations', () => {
      it('should calculate minimum courtyard area based on plot size', async () => {
        const input: EcoDesignInput = {
          plot: { width: 40, depth: 50 },  // 2000 sqft plot
          orientation: 'east',
        };

        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 10000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 160,  // 8% of 2000
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 5,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        // 8% of 2000 = 160 sqft
        expect(result.data?.courtyard.min_area_sqft).toBeGreaterThanOrEqual(80);
      });

      it('should use offset courtyard for narrow plots', async () => {
        const narrowInput: EcoDesignInput = {
          plot: { width: 20, depth: 60 },  // Narrow plot (0.33 aspect ratio)
          orientation: 'east',
        };

        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'offset',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(narrowInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.courtyard.position).toBe('offset');
      });

      it('should use central courtyard for square plots', async () => {
        const squareInput: EcoDesignInput = {
          plot: { width: 40, depth: 40 },  // Square plot
          orientation: 'east',
        };

        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 10000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 128,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 5,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(squareInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.courtyard.position).toBe('central');
      });
    });

    describe('veranda calculations', () => {
      it('should set veranda sides based on orientation', async () => {
        const eastInput: EcoDesignInput = {
          plot: { width: 30, depth: 40 },
          orientation: 'east',
        };

        mockGeminiResponse({
          mandatory_elements: ['veranda'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(eastInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.veranda.sides).toContain('east');
      });

      it('should use wider veranda for larger plots', async () => {
        const largeInput: EcoDesignInput = {
          plot: { width: 50, depth: 60 },  // Large plot
          orientation: 'east',
        };

        mockGeminiResponse({
          mandatory_elements: ['veranda'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 15000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 240,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 5,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(largeInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.veranda.min_width_feet).toBe(5);
      });
    });

    describe('water strategy', () => {
      it('should always require rainwater harvesting', async () => {
        const input: EcoDesignInput = {
          plot: { width: 30, depth: 40 },
          orientation: 'east',
        };

        mockGeminiResponse({
          mandatory_elements: ['rainwater-harvesting'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: false,  // LLM says false
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        // Should be enforced to true regardless of LLM response
        expect(result.data?.water_strategy.rainwater_harvesting).toBe(true);
      });

      it('should calculate sump capacity based on plot area', async () => {
        const input: EcoDesignInput = {
          plot: { width: 40, depth: 50 },  // 2000 sqft
          orientation: 'east',
        };

        mockGeminiResponse({
          mandatory_elements: ['rainwater-harvesting'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 10000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 160,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 5,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.water_strategy.sump_capacity_liters).toBeGreaterThanOrEqual(5000);
        expect(result.data?.water_strategy.sump_capacity_liters).toBeLessThanOrEqual(20000);
      });
    });

    describe('energy strategy', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      it('should always enable passive cooling', async () => {
        mockGeminiResponse({
          mandatory_elements: ['cross-ventilation'],
          energy_strategy: {
            passive_cooling: false,  // LLM says false
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        // Should be enforced to true
        expect(result.data?.energy_strategy.passive_cooling).toBe(true);
      });

      it('should always enable cross ventilation', async () => {
        mockGeminiResponse({
          mandatory_elements: ['cross-ventilation'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: false,  // LLM says false
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.energy_strategy.cross_ventilation).toBe(true);
      });

      it('should always minimize west wall', async () => {
        mockGeminiResponse({
          mandatory_elements: ['west-wall-buffer'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: false,  // LLM says false
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.energy_strategy.west_wall_minimized).toBe(true);
      });
    });

    describe('climate zone handling', () => {
      it('should use default climate zone when not specified', async () => {
        const input: EcoDesignInput = {
          plot: { width: 30, depth: 40 },
          orientation: 'east',
          // No climate zone
        };

        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.climateZone).toBe('default');
      });

      it('should track climate zone in meta', async () => {
        const input: EcoDesignInput = {
          plot: { width: 30, depth: 40 },
          orientation: 'east',
          climateZone: 'chennai-coastal',
        };

        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.meta?.climateZone).toBe('chennai-coastal');
      });
    });

    describe('material preferences', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      it('should provide sustainable material recommendations', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [
            {
              material: 'CSEB',
              reason: 'Local soil, minimal cement',
              carbon_impact: 'low',
            },
            {
              material: 'Filler slab',
              reason: 'Reduces cement usage',
              carbon_impact: 'low',
            },
          ],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.material_preferences.length).toBeGreaterThan(0);
      });

      it('should use pre-calculated materials if LLM provides few', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [
            {
              material: 'CSEB',
              reason: 'Eco-friendly',
              carbon_impact: 'low',
            },
          ],  // Only one material
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        // Should have at least 3 materials from pre-calculated
        expect(result.data?.material_preferences.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('violations tracking', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      it('should generate violations if not provided', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],  // Empty array
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.violations_if_removed.length).toBeGreaterThan(0);
      });

      it('should include courtyard violation consequences', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const courtyardViolation = result.data?.violations_if_removed.find(
          v => v.toLowerCase().includes('courtyard')
        );
        expect(courtyardViolation).toBeDefined();
      });
    });

    describe('assumptions extraction', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      it('should add climate zone assumption when not specified', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const climateAssumption = result.assumptions.find(
          a => a.assumptionId === 'climate_zone_default'
        );
        expect(climateAssumption).toBeDefined();
      });

      it('should include future expansion assumption', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const expansionAssumption = result.assumptions.find(
          a => a.assumptionId === 'future_expansion'
        );
        expect(expansionAssumption).toBeDefined();
      });
    });

    describe('open questions extraction', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      it('should ask about greywater recycling', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const greywaterQuestion = result.openQuestions.find(
          q => q.questionId === 'greywater_recycling'
        );
        expect(greywaterQuestion).toBeDefined();
        expect(greywaterQuestion?.type).toBe('optional');
      });

      it('should ask about solar provision', async () => {
        mockGeminiResponse({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: false,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: [],
        });

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        const solarQuestion = result.openQuestions.find(
          q => q.questionId === 'solar_provision'
        );
        expect(solarQuestion).toBeDefined();
      });
    });

    describe('error handling', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
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
    });

    describe('response parsing', () => {
      const validInput: EcoDesignInput = {
        plot: { width: 30, depth: 40 },
        orientation: 'east',
      };

      it('should handle markdown-wrapped JSON response', async () => {
        const wrappedResponse = '```json\n' + JSON.stringify({
          mandatory_elements: ['central-courtyard'],
          energy_strategy: {
            passive_cooling: true,
            cross_ventilation: true,
            west_wall_minimized: true,
            natural_lighting: true,
          },
          water_strategy: {
            rainwater_harvesting: true,
            greywater_recycling: true,
            sump_capacity_liters: 8000,
          },
          material_preferences: [],
          courtyard: {
            required: true,
            min_area_sqft: 96,
            position: 'central',
          },
          veranda: {
            required: true,
            min_width_feet: 4,
            sides: ['east', 'south'],
          },
          violations_if_removed: ['Test violation'],
        }) + '\n```';

        mockGeminiResponse(wrappedResponse);

        const result = await agent.execute(validInput, mockContext);

        expect(result.success).toBe(true);
        expect(result.data?.violations_if_removed.some(v => v === 'Test violation')).toBe(true);
      });
    });
  });
});
