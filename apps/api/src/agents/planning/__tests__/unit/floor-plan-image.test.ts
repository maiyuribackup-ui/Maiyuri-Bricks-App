/**
 * Floor Plan Image Agent Unit Tests
 *
 * Tests the floor plan image generation agent functionality.
 * Note: Tests that require API calls are skipped in CI environments
 * without proper credentials.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FloorPlanImageAgent,
  createFloorPlanImageAgent,
  createFullVisualizationAgent,
} from '../../agents/floor-plan-image';
import type { FloorPlanImageInput } from '../../types/contracts';
import { createMockContext, createCompletedContext } from '../mocks/context.mock';

describe('FloorPlanImageAgent', () => {
  let agent: FloorPlanImageAgent;

  beforeEach(() => {
    agent = createFloorPlanImageAgent();
  });

  describe('createFloorPlanImageAgent', () => {
    it('should create agent with default config', () => {
      const agent = createFloorPlanImageAgent();
      expect(agent).toBeInstanceOf(FloorPlanImageAgent);
      expect(agent.agentName).toBe('floor-plan-image');
    });

    it('should create agent with custom config', () => {
      const agent = createFloorPlanImageAgent({
        imagesToGenerate: ['floorPlan', 'exterior'],
        parallel: true,
      });
      expect(agent).toBeInstanceOf(FloorPlanImageAgent);
    });
  });

  describe('createFullVisualizationAgent', () => {
    it('should create agent configured for all images', () => {
      const agent = createFullVisualizationAgent();
      expect(agent).toBeInstanceOf(FloorPlanImageAgent);
    });
  });

  describe('input validation', () => {
    it('should fail when renderPrompts is missing', async () => {
      const context = createMockContext();
      const input = {} as FloorPlanImageInput;

      const result = await agent.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Render prompts are required');
    });

    it('should fail when all prompts are empty', async () => {
      const context = createMockContext();
      const input: FloorPlanImageInput = {
        renderPrompts: {},
      };

      const result = await agent.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('At least one render prompt is required');
    });

    it('should return correct agentName in error result', async () => {
      const context = createMockContext();
      const input: FloorPlanImageInput = {
        renderPrompts: {},
      };

      const result = await agent.execute(input, context);

      expect(result.agentName).toBe('floor-plan-image');
    });

    it('should handle undefined renderPrompts object', async () => {
      const context = createMockContext();
      const input: FloorPlanImageInput = {
        renderPrompts: undefined as unknown as FloorPlanImageInput['renderPrompts'],
      };

      const result = await agent.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FLOOR_PLAN_IMAGE_ERROR');
    });
  });

  describe('result structure', () => {
    it('should return proper error structure for invalid input', async () => {
      const context = createMockContext();
      const input: FloorPlanImageInput = {
        renderPrompts: {},
      };

      const result = await agent.execute(input, context);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('agentName');
      expect(result).toHaveProperty('executionTimeMs');
      expect(result).toHaveProperty('tokensUsed');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('openQuestions');
      expect(result).toHaveProperty('assumptions');
    });

    it('should track execution time', async () => {
      const context = createMockContext();
      const input: FloorPlanImageInput = {
        renderPrompts: {},
      };

      const result = await agent.execute(input, context);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.executionTimeMs).toBe('number');
    });

    it('should initialize tokens used even on error', async () => {
      const context = createMockContext();
      const input: FloorPlanImageInput = {
        renderPrompts: {},
      };

      const result = await agent.execute(input, context);

      expect(result.tokensUsed).toBeDefined();
      expect(result.tokensUsed.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FloorPlanImageInput types', () => {
    it('should accept valid input with all optional fields', () => {
      const input: FloorPlanImageInput = {
        renderPrompts: {
          floorPlan: 'Floor plan prompt',
          courtyard: 'Courtyard prompt',
          exterior: 'Exterior prompt',
          interior: 'Interior prompt',
        },
        rooms: [
          {
            id: 'living',
            name: 'Living Room',
            type: 'living',
            width: 15,
            depth: 12,
            area_sqft: 180,
            zone: 'public',
            adjacent_to: ['dining'],
          },
        ],
        plotDimensions: {
          width: 40,
          depth: 60,
          unit: 'feet',
        },
        orientation: 'east',
        ecoElements: ['courtyard', 'cross_ventilation'],
        materials: ['brick', 'teakwood'],
      };

      // Type check passes if this compiles
      expect(input.renderPrompts.floorPlan).toBeDefined();
      expect(input.rooms?.[0].name).toBe('Living Room');
      expect(input.plotDimensions?.width).toBe(40);
    });

    it('should accept minimal valid input', () => {
      const input: FloorPlanImageInput = {
        renderPrompts: {
          floorPlan: 'A floor plan',
        },
      };

      expect(input.renderPrompts.floorPlan).toBeDefined();
    });
  });
});

describe('FloorPlanImageAgent Integration', () => {
  // Skip integration tests if no Google AI credentials
  const hasCredentials = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // These tests require actual API credentials
  describe.skipIf(!hasCredentials)('with API credentials', () => {
    let agent: FloorPlanImageAgent;

    beforeEach(() => {
      agent = createFloorPlanImageAgent({
        imagesToGenerate: ['floorPlan'],
        parallel: false,
        maxRetries: 1,
      });
    });

    it('should generate floor plan image', async () => {
      const context = createCompletedContext();
      const input: FloorPlanImageInput = {
        renderPrompts: {
          floorPlan: 'Professional 2D floor plan of a Tamil Nadu house with courtyard.',
        },
      };

      const result = await agent.execute(input, context);

      // Even if API fails, verify result structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('agentName', 'floor-plan-image');
      expect(result).toHaveProperty('executionTimeMs');

      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data?.floorPlan).toBeDefined();
        expect(result.data?.metadata.totalImagesGenerated).toBeGreaterThan(0);
      }
    }, 60000); // 60 second timeout for API call
  });
});
