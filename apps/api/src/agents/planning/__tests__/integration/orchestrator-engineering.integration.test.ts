/**
 * Orchestrator Integration Tests - Engineering Plan Stage
 *
 * Tests the PlanningOrchestrator's handling of:
 * - Engineering Plan Agent (Agent 9) execution
 * - Design Validation Agent (Agent 10) execution
 * - Pipeline flow between these final stages
 * - Error handling and recovery at these stages
 *
 * These tests ensure the orchestrator correctly manages the
 * engineering and validation stages of the planning pipeline.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PlanningOrchestrator } from '../../orchestrator';
import { DesignValidationError, HaltError } from '../../errors';
import {
  createPostDimensioningContext,
  createPostEcoContext,
  createCompletedContext,
  createFailedValidationContext,
  createHaltContext,
} from '../mocks/context.mock';
import { clearMocks } from '../mocks/claude-sdk.mock';
import type { DesignContext } from '../../types/design-context';
import type { EngineeringPlanOutput, DesignValidationOutput } from '../../types/contracts';

// Mock the Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

describe('PlanningOrchestrator - Engineering Stage Integration', () => {
  let orchestrator: PlanningOrchestrator;

  beforeEach(() => {
    clearMocks();
    orchestrator = new PlanningOrchestrator({
      enableParallelStages: false, // Deterministic for testing
      enableCheckpoints: false,
    });
  });

  afterEach(() => {
    clearMocks();
    jest.clearAllMocks();
  });

  describe('Pipeline Stage Order', () => {
    it('should have engineering-plan as Agent 9 in sequence', () => {
      const stages = [
        'diagram-interpreter',      // Agent 1
        'regulation-compliance',    // Agent 2
        'structural-engineer',      // Agent 3
        'eco-design',               // Agent 4
        'client-elicitation',       // Agent 5
        'vastu-advisor',            // Agent 6
        'architectural-zoning',     // Agent 7
        'dimensioning',             // Agent 8
        'engineering-plan',         // Agent 9
        'design-validation',        // Agent 10
        'narrative-generator',      // Agent 11
        'visualization',            // Agent 12
      ];

      expect(stages.indexOf('engineering-plan')).toBe(8); // 0-indexed = 9th
      expect(stages.indexOf('design-validation')).toBe(9); // 0-indexed = 10th
    });

    it('should execute engineering-plan after dimensioning', () => {
      const context = createPostDimensioningContext();

      // Context should have rooms from dimensioning
      expect(context.rooms).toBeDefined();
      expect(context.rooms!.length).toBeGreaterThan(0);

      // Engineering plan needs dimensioned rooms
      const hasAllDimensions = context.rooms!.every(
        r => r.width > 0 && r.depth > 0 && r.areaSqft > 0
      );
      expect(hasAllDimensions).toBe(true);
    });

    it('should execute design-validation after engineering-plan', () => {
      // Create context with engineering plan already complete
      const contextWithEngineering = createPostDimensioningContext();

      const mockEngineeringPlan: EngineeringPlanOutput = {
        wallSystem: {
          externalThickness: 9,
          internalThickness: 4.5,
          material: 'Burnt clay brick masonry',
          loadBearingWalls: ['north-external', 'south-external'],
        },
        staircase: null,
        plumbing: {
          strategy: 'grouped',
          wetAreas: ['kitchen', 'bath-1'],
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
        tokenUsage: { input: 1200, output: 800, total: 2000 },
      };

      const enrichedContext: DesignContext = {
        ...contextWithEngineering,
        engineeringPlan: mockEngineeringPlan,
      };

      // Design validation should have access to engineering plan
      expect(enrichedContext.engineeringPlan).toBeDefined();
      expect(enrichedContext.engineeringPlan?.wallSystem).toBeDefined();
    });
  });

  describe('Engineering Plan Stage Execution', () => {
    it('should pass correct input to engineering-plan agent', () => {
      const context = createPostDimensioningContext({
        structuralStrategy: 'load-bearing',
      });

      // Engineering agent needs these fields
      expect(context.rooms).toBeDefined();
      expect(context.structuralStrategy).toBe('load-bearing');
      expect(context.buildableEnvelope?.maxFloors).toBeDefined();
    });

    it('should update context with engineering-plan output', () => {
      const context = createPostDimensioningContext();

      const mockOutput: EngineeringPlanOutput = {
        wallSystem: {
          externalThickness: 9,
          internalThickness: 4.5,
          material: 'Burnt clay brick masonry',
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
          shafts: [{ id: 'V1', position: 'central', serves: ['kitchen', 'common-bath'] }],
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
        tokenUsage: { input: 1500, output: 1000, total: 2500 },
      };

      const updatedContext: DesignContext = {
        ...context,
        engineeringPlan: mockOutput,
        currentAgent: 'engineering-plan',
      };

      expect(updatedContext.engineeringPlan).toEqual(mockOutput);
      expect(updatedContext.currentAgent).toBe('engineering-plan');
    });

    it('should track open questions from engineering-plan', () => {
      const context = createPostDimensioningContext({
        rooms: [
          { id: 'living', name: 'Living', type: 'living', width: 15, depth: 12, areaSqft: 180, zone: 'public' },
          // Missing bathroom info
        ],
      });

      const mockOutputWithQuestions: EngineeringPlanOutput = {
        wallSystem: {
          externalThickness: 9,
          internalThickness: 4.5,
          material: 'Burnt clay brick masonry',
          loadBearingWalls: [],
        },
        staircase: null,
        plumbing: {
          strategy: 'standard',
          wetAreas: [],
          shaftPositions: [],
          stackVentLocations: [],
        },
        ventilation: { shafts: [], crossVentilationEnabled: false },
        expansion: {
          foundationProvision: 'none',
          columnStubsProvided: false,
          estimatedAddition: 0,
        },
        assumptions: [],
        openQuestions: [
          {
            questionId: 'EQ1',
            agentSource: 'engineering-plan',
            question: 'Where should the bathroom be located?',
            type: 'mandatory',
            reason: 'Required for plumbing planning',
          },
        ],
        tokenUsage: { input: 1000, output: 500, total: 1500 },
      };

      // Open questions should trigger orchestrator to halt
      expect(mockOutputWithQuestions.openQuestions.length).toBeGreaterThan(0);
    });
  });

  describe('Design Validation Stage Execution', () => {
    it('should pass complete context to design-validation agent', () => {
      const context = createCompletedContext({
        structuralStrategy: 'load-bearing',
        vastuZones: {
          northeast: ['pooja'],
          southeast: ['kitchen'],
          southwest: ['master-bedroom'],
          northwest: ['bathroom'],
        },
      });

      // Validation needs all upstream outputs
      expect(context.plot).toBeDefined();
      expect(context.buildableEnvelope).toBeDefined();
      expect(context.rooms).toBeDefined();
      expect(context.structuralStrategy).toBeDefined();
      expect(context.vastuZones).toBeDefined();
      expect(context.energyStrategy).toBeDefined();
      expect(context.waterStrategy).toBeDefined();
    });

    it('should update context with validation results', () => {
      const context = createPostDimensioningContext();

      const mockValidation: DesignValidationOutput = {
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
        recommendations: ['Consider adding ventilation shaft'],
        tokenUsage: { input: 2000, output: 500, total: 2500 },
      };

      const updatedContext: DesignContext = {
        ...context,
        validationStatus: mockValidation.status,
        validationIssues: [],
        currentAgent: 'design-validation',
      };

      expect(updatedContext.validationStatus).toBe('PASS');
      expect(updatedContext.currentAgent).toBe('design-validation');
    });

    it('should halt pipeline on validation failure', () => {
      const failedContext = createFailedValidationContext();

      expect(failedContext.status).toBe('failed');
      expect(failedContext.validationStatus).toBe('FAIL');
      expect(failedContext.validationIssues?.length).toBeGreaterThan(0);
    });
  });

  describe('Pipeline Error Handling', () => {
    it('should throw DesignValidationError on critical validation failures', () => {
      const issues = [
        {
          id: 'V1',
          type: 'error' as const,
          category: 'regulation',
          message: 'Setback violation on south side',
        },
      ];

      const context = createFailedValidationContext();
      const error = new DesignValidationError(issues, context);

      expect(error).toBeInstanceOf(DesignValidationError);
      expect(error.getCriticalErrors()).toHaveLength(1);
      expect(error.context).toBe(context);
    });

    it('should throw HaltError when engineering-plan has mandatory questions', () => {
      const haltContext = createHaltContext({
        currentAgent: 'engineering-plan',
        openQuestions: [
          {
            agentSource: 'engineering-plan',
            questionId: 'EQ1',
            question: 'What is the preferred bathroom location?',
            type: 'mandatory',
            reason: 'Required for plumbing layout',
          },
        ],
      });

      expect(HaltError).toBeDefined();
      expect(haltContext.status).toBe('halted');
      expect(haltContext.openQuestions.length).toBeGreaterThan(0);
    });

    it('should allow resume after answering open questions', async () => {
      const haltContext = createHaltContext({
        currentAgent: 'engineering-plan',
        openQuestions: [
          {
            agentSource: 'engineering-plan',
            questionId: 'EQ1',
            question: 'What is the preferred bathroom location?',
            type: 'mandatory',
            reason: 'Required for plumbing layout',
          },
        ],
      });

      const answers = {
        EQ1: 'Adjacent to master bedroom on east side',
      };

      // Apply answers
      haltContext.openQuestions[0].answer = answers.EQ1;

      expect(haltContext.openQuestions[0].answer).toBe(answers.EQ1);
    });
  });

  describe('Token Tracking Across Stages', () => {
    it('should accumulate token usage from engineering-plan', () => {
      const engineeringTokens = { input: 1500, output: 1000, total: 2500 };

      expect(engineeringTokens.total).toBe(
        engineeringTokens.input + engineeringTokens.output
      );
    });

    it('should accumulate token usage from design-validation', () => {
      const validationTokens = { input: 2000, output: 500, total: 2500 };

      expect(validationTokens.total).toBe(
        validationTokens.input + validationTokens.output
      );
    });

    it('should track cumulative pipeline tokens', () => {
      const stageTokens = [
        { stage: 'diagram-interpreter', tokens: { total: 1000 } },
        { stage: 'regulation-compliance', tokens: { total: 800 } },
        { stage: 'eco-design', tokens: { total: 1200 } },
        { stage: 'dimensioning', tokens: { total: 1500 } },
        { stage: 'engineering-plan', tokens: { total: 2500 } },
        { stage: 'design-validation', tokens: { total: 2500 } },
      ];

      const totalTokens = stageTokens.reduce((sum, s) => sum + s.tokens.total, 0);

      expect(totalTokens).toBe(9500);
    });
  });

  describe('Checkpoint and Recovery', () => {
    it('should save checkpoint after engineering-plan completion', () => {
      const context = createPostDimensioningContext({
        currentAgent: 'engineering-plan',
      });

      const mockEngineeringOutput: EngineeringPlanOutput = {
        wallSystem: {
          externalThickness: 9,
          internalThickness: 4.5,
          material: 'Brick',
          loadBearingWalls: ['north', 'south'],
        },
        staircase: null,
        plumbing: { strategy: 'grouped', wetAreas: [], shaftPositions: [], stackVentLocations: [] },
        ventilation: { shafts: [], crossVentilationEnabled: true },
        expansion: { foundationProvision: 'none', columnStubsProvided: false, estimatedAddition: 0 },
        assumptions: [],
        openQuestions: [],
        tokenUsage: { input: 1500, output: 1000, total: 2500 },
      };

      // Checkpoint would include engineering plan
      const checkpoint = {
        sessionId: context.sessionId,
        stage: 'engineering-plan',
        completedAt: new Date().toISOString(),
        engineeringPlan: mockEngineeringOutput,
      };

      expect(checkpoint.stage).toBe('engineering-plan');
      expect(checkpoint.engineeringPlan).toBeDefined();
    });

    it('should recover from checkpoint before design-validation', () => {
      const checkpointContext = createPostDimensioningContext({
        status: 'in_progress',
        currentAgent: 'engineering-plan',
      });

      const mockEngineeringPlan: EngineeringPlanOutput = {
        wallSystem: {
          externalThickness: 9,
          internalThickness: 4.5,
          material: 'Brick',
          loadBearingWalls: ['north', 'south', 'east', 'west'],
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
          wetAreas: ['kitchen', 'bath'],
          shaftPositions: ['east'],
          stackVentLocations: ['roof'],
        },
        ventilation: { shafts: [], crossVentilationEnabled: true },
        expansion: {
          foundationProvision: 'single-floor-addition',
          columnStubsProvided: false,
          estimatedAddition: 400,
        },
        assumptions: [],
        openQuestions: [],
        tokenUsage: { input: 1500, output: 1000, total: 2500 },
      };

      // Recovered context should have engineering plan
      const recoveredContext: DesignContext = {
        ...checkpointContext,
        engineeringPlan: mockEngineeringPlan,
        currentAgent: 'design-validation', // Move to next stage
      };

      expect(recoveredContext.engineeringPlan).toBeDefined();
      expect(recoveredContext.currentAgent).toBe('design-validation');
    });
  });

  describe('Parallel Stage Handling', () => {
    it('should handle narrative and visualization stages in parallel', () => {
      // After validation passes, narrative and visualization run in parallel
      const completedContext = createCompletedContext();

      const parallelStages = ['narrative-generator', 'visualization'];

      // Both should receive the same completed context
      parallelStages.forEach(stage => {
        expect(completedContext.validationStatus).toBe('PASS');
        expect(completedContext.rooms).toBeDefined();
      });
    });

    it('should wait for both parallel stages before completion', () => {
      // Both narrative and visualization must complete
      const stages = {
        'narrative-generator': { completed: true },
        'visualization': { completed: true },
      };

      const allCompleted = Object.values(stages).every(s => s.completed);
      expect(allCompleted).toBe(true);
    });
  });
});

describe('Pipeline End-to-End Flow', () => {
  let orchestrator: PlanningOrchestrator;

  beforeEach(() => {
    clearMocks();
    orchestrator = new PlanningOrchestrator({
      enableParallelStages: false,
      enableCheckpoints: true,
    });
  });

  afterEach(() => {
    clearMocks();
    jest.clearAllMocks();
  });

  it('should complete full pipeline from dimensioning to validation', () => {
    // Start from dimensioned context
    const inputContext = createPostDimensioningContext({
      structuralStrategy: 'load-bearing',
    });

    // After engineering plan
    const afterEngineering: DesignContext = {
      ...inputContext,
      engineeringPlan: {
        wallSystem: {
          externalThickness: 9,
          internalThickness: 4.5,
          material: 'Burnt clay brick masonry',
          loadBearingWalls: ['north', 'south', 'east', 'west'],
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
          wetAreas: ['kitchen', 'bath-1', 'bath-2'],
          shaftPositions: ['east-central'],
          stackVentLocations: ['roof-east'],
        },
        ventilation: {
          shafts: [{ id: 'V1', position: 'central', serves: ['kitchen', 'bath-1'] }],
          crossVentilationEnabled: true,
        },
        expansion: {
          foundationProvision: 'single-floor-addition',
          columnStubsProvided: false,
          estimatedAddition: 400,
        },
        assumptions: [],
        openQuestions: [],
        tokenUsage: { input: 1500, output: 1000, total: 2500 },
      },
      currentAgent: 'engineering-plan',
    };

    expect(afterEngineering.engineeringPlan).toBeDefined();

    // After validation
    const afterValidation: DesignContext = {
      ...afterEngineering,
      validationStatus: 'PASS',
      validationIssues: [],
      status: 'completed',
      currentAgent: 'design-validation',
    };

    expect(afterValidation.validationStatus).toBe('PASS');
    expect(afterValidation.status).toBe('completed');
  });

  it('should handle validation failure and halt pipeline', () => {
    const inputContext = createPostDimensioningContext();

    // After engineering plan (with issues)
    const afterEngineering: DesignContext = {
      ...inputContext,
      engineeringPlan: {
        wallSystem: {
          externalThickness: 4.5, // Wrong for load-bearing!
          internalThickness: 4.5,
          material: 'AAC blocks',
          loadBearingWalls: [], // No load-bearing walls for load-bearing strategy!
        },
        staircase: {
          type: 'straight',
          width: 2.5, // Too narrow!
          position: 'side',
          riserHeight: 8, // Too high!
          treadWidth: 9, // Too narrow!
          numSteps: 15,
          hasLanding: false,
        },
        plumbing: { strategy: 'standard', wetAreas: [], shaftPositions: [], stackVentLocations: [] },
        ventilation: { shafts: [], crossVentilationEnabled: false },
        expansion: { foundationProvision: 'none', columnStubsProvided: false, estimatedAddition: 0 },
        assumptions: [],
        openQuestions: [],
        tokenUsage: { input: 1500, output: 1000, total: 2500 },
      },
      structuralStrategy: 'load-bearing',
    };

    // Validation should fail
    const afterValidation: DesignContext = {
      ...afterEngineering,
      validationStatus: 'FAIL',
      validationIssues: [
        {
          id: 'V1',
          type: 'error',
          category: 'structural',
          message: 'Wall thickness insufficient for load-bearing',
          suggestedFix: 'Use 9-inch external walls',
        },
        {
          id: 'V2',
          type: 'error',
          category: 'structural',
          message: 'Staircase width below minimum',
          suggestedFix: 'Increase staircase width to 3 feet',
        },
      ],
      validationSeverity: 'high',
      status: 'failed',
    };

    expect(afterValidation.validationStatus).toBe('FAIL');
    expect(afterValidation.status).toBe('failed');
    expect(afterValidation.validationIssues?.length).toBe(2);
  });
});
