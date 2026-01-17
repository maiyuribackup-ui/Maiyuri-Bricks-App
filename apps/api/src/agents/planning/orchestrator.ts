/**
 * Planning Pipeline Orchestrator
 *
 * Controls the flow of the 12-agent pipeline.
 * Handles:
 * - Sequential and parallel agent execution
 * - Halt on open_questions
 * - Resume after human input
 * - State persistence
 * - Error recovery
 */

import type {
  DesignContext,
  PipelineStatus,
} from './types/design-context';
import { createDesignContext } from './types/design-context';
import type {
  AgentName,
  AgentResult,
  OpenQuestion,
  IAgent,
} from './types/agent-result';
import { logger } from './utils/logger';
import { tokenBudget, TokenBudget } from './utils/token-budget';
import {
  PipelineError,
  HaltError,
  DesignValidationError,
} from './errors';

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Maximum total token budget */
  maxTokenBudget: number;
  /** Pipeline timeout in milliseconds */
  timeoutMs: number;
  /** Enable parallel stage execution */
  enableParallelStages: boolean;
  /** Persist checkpoints after each stage */
  enableCheckpoints: boolean;
  /** Custom checkpoint handler */
  onCheckpoint?: (context: DesignContext) => Promise<void>;
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxTokenBudget: 100000,
  timeoutMs: 300000, // 5 minutes
  enableParallelStages: true,
  enableCheckpoints: true,
};

/**
 * Pipeline input (sketch image)
 */
export interface PipelineInput {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
}

/**
 * Agent registry type
 */
type AgentRegistry = Map<AgentName, IAgent>;

/**
 * Planning Pipeline Orchestrator
 *
 * Orchestrates the 12-agent pipeline from sketch to floor plan.
 */
export class PlanningOrchestrator {
  private config: PipelineConfig;
  private agents: AgentRegistry;
  private tokenBudget: TokenBudget;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.agents = new Map();
    this.tokenBudget = new TokenBudget({
      totalLimit: this.config.maxTokenBudget,
    });
  }

  /**
   * Register an agent in the pipeline
   */
  registerAgent(agent: IAgent): void {
    this.agents.set(agent.agentName, agent);
  }

  /**
   * Run the complete pipeline
   */
  async runPipeline(
    input: PipelineInput,
    existingContext?: Partial<DesignContext>,
    userId?: string,
    leadId?: string
  ): Promise<DesignContext> {
    // Initialize or restore context
    const context = this.initializeContext(existingContext, userId, leadId);

    // Set up token budget tracking
    this.tokenBudget.setSession(context.sessionId);

    try {
      logger.info('Starting pipeline execution', {
        sessionId: context.sessionId,
        hasExistingContext: !!existingContext,
      });

      // ============================================
      // Stage 1: Diagram Interpretation (Conditional)
      // ============================================
      // Only run diagram interpreter if we have an image to analyze
      // If manual dimensions were provided, skip this stage
      const hasImage = !!(input.imageUrl || input.imageBase64);

      if (hasImage) {
        await this.executeStage(context, 'diagram-interpreter', input);
        if (this.shouldHalt(context)) return this.halt(context);
      } else {
        // Manual dimensions provided - create plot context from existing data
        logger.info('Skipping diagram interpreter - using manual dimensions', {
          sessionId: context.sessionId,
        });

        // The plot dimensions should already be in the existingContext
        // from the planning service's mapInputsToContext method
        if (!context.plot || !context.plot.width || !context.plot.depth) {
          throw new PipelineError(
            'Manual dimensions required but not found in context. Expected plot.width and plot.depth.',
            context
          );
        }
      }

      // ============================================
      // Stage 2: Parallel - Regulation, Engineer, Eco
      // ============================================
      if (this.config.enableParallelStages) {
        await Promise.all([
          this.executeStage(context, 'regulation-compliance', this.extractRegulationInput(context)),
          this.executeStage(context, 'engineer-clarification', this.extractEngineerInput(context)),
          this.executeStage(context, 'eco-design', this.extractEcoInput(context)),
        ]);
      } else {
        await this.executeStage(context, 'regulation-compliance', this.extractRegulationInput(context));
        await this.executeStage(context, 'engineer-clarification', this.extractEngineerInput(context));
        await this.executeStage(context, 'eco-design', this.extractEcoInput(context));
      }
      if (this.shouldHalt(context)) return this.halt(context);

      // ============================================
      // Stage 3: Client Elicitation
      // ============================================
      await this.executeStage(context, 'client-elicitation', this.extractElicitationInput(context));
      if (this.shouldHalt(context)) return this.halt(context);

      // ============================================
      // Stage 4: Vastu Compliance
      // ============================================
      await this.executeStage(context, 'vastu-compliance', this.extractVastuInput(context));
      if (this.shouldHalt(context)) return this.halt(context);

      // ============================================
      // Stage 5: Architectural Zoning
      // ============================================
      await this.executeStage(context, 'architectural-zoning', this.extractZoningInput(context));
      if (this.shouldHalt(context)) return this.halt(context);

      // ============================================
      // Stage 6: Dimensioning
      // ============================================
      await this.executeStage(context, 'dimensioning', this.extractDimensioningInput(context));
      if (this.shouldHalt(context)) return this.halt(context);

      // ============================================
      // Stage 7: Engineering Plan
      // ============================================
      await this.executeStage(context, 'engineering-plan', this.extractEngineeringPlanInput(context));
      if (this.shouldHalt(context)) return this.halt(context);

      // ============================================
      // Stage 8: Design Validation (Critical Gate)
      // ============================================
      await this.executeStage(context, 'design-validation', { fullContext: context });

      if (context.validationStatus === 'FAIL') {
        context.status = 'failed';
        context.haltReason = 'Design validation failed - critical issues found';
        throw new DesignValidationError(
          context.validationIssues || [],
          context
        );
      }

      // ============================================
      // Stage 9: Parallel - Narrative & Visualization
      // ============================================
      if (this.config.enableParallelStages) {
        await Promise.all([
          this.executeStage(context, 'narrative', { fullContext: context }),
          this.executeStage(context, 'visualization', this.extractVisualizationInput(context)),
        ]);
      } else {
        await this.executeStage(context, 'narrative', { fullContext: context });
        await this.executeStage(context, 'visualization', this.extractVisualizationInput(context));
      }

      // ============================================
      // Stage 10: Floor Plan Image Generation
      // ============================================
      if (context.renderPrompts) {
        await this.executeStage(context, 'floor-plan-image', this.extractFloorPlanImageInput(context));
      }

      // Success!
      context.status = 'completed';
      context.updatedAt = new Date();
      context.tokenUsage = this.tokenBudget.toContextSummary();

      logger.info('Pipeline completed successfully', {
        sessionId: context.sessionId,
        totalTokens: this.tokenBudget.totalUsed,
      });

      return context;
    } catch (error) {
      if (error instanceof HaltError || error instanceof DesignValidationError) {
        throw error;
      }

      context.status = 'failed';
      context.haltReason = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Pipeline failed', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new PipelineError(
        error instanceof Error ? error.message : 'Pipeline failed',
        context,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Resume pipeline after human input
   */
  async resumePipeline(
    context: DesignContext,
    answers: Record<string, string>
  ): Promise<DesignContext> {
    // Apply answers to open questions
    for (const question of context.openQuestions) {
      if (answers[question.questionId]) {
        question.answer = answers[question.questionId];
      }
    }

    // Check if all mandatory questions are answered
    const unanswered = context.openQuestions.filter(
      q => q.type === 'mandatory' && !q.answer
    );

    if (unanswered.length > 0) {
      context.haltReason = `${unanswered.length} mandatory questions still unanswered`;
      logger.warn('Cannot resume: mandatory questions unanswered', {
        sessionId: context.sessionId,
        unansweredCount: unanswered.length,
      });
      return context;
    }

    // Apply answers to context (merge into requirements, etc.)
    this.applyAnswersToContext(context, answers);

    // Clear halt status and resume
    context.status = 'in_progress';
    context.haltReason = undefined;

    logger.info('Resuming pipeline', {
      sessionId: context.sessionId,
      fromAgent: context.currentAgent,
    });

    // Continue from where we left off
    return this.runPipeline({}, context);
  }

  /**
   * Execute a single stage
   */
  private async executeStage<TInput>(
    context: DesignContext,
    agentName: AgentName,
    input: TInput
  ): Promise<void> {
    context.currentAgent = agentName;
    context.updatedAt = new Date();

    const agent = this.agents.get(agentName);
    if (!agent) {
      logger.warn(`Agent not registered: ${agentName}, skipping stage`);
      return;
    }

    const result = await agent.execute(input, context);

    if (!result.success) {
      throw new PipelineError(
        `Agent ${agentName} failed: ${result.error?.message}`,
        context
      );
    }

    // Merge result into context
    this.mergeResult(context, agentName, result);

    // Accumulate open questions and assumptions
    context.openQuestions.push(...result.openQuestions);
    context.assumptions.push(...result.assumptions);

    // Checkpoint if enabled
    if (this.config.enableCheckpoints && this.config.onCheckpoint) {
      await this.config.onCheckpoint(context);
    }
  }

  /**
   * Check if pipeline should halt for human input
   */
  private shouldHalt(context: DesignContext): boolean {
    // Only halt if mandatory questions are unanswered
    // Optional questions can proceed with default values
    return context.openQuestions.some(q => q.type === 'mandatory' && !q.answer);
  }

  /**
   * Halt the pipeline for human input
   */
  private halt(context: DesignContext): DesignContext {
    const unanswered = context.openQuestions.filter(q => !q.answer);

    context.status = 'halted';
    context.haltReason = 'Awaiting human resolution of open questions';

    logger.pipelineHalted(context.sessionId, context.haltReason, unanswered.length);

    throw new HaltError(unanswered, context);
  }

  /**
   * Initialize or restore context
   */
  private initializeContext(
    existing?: Partial<DesignContext>,
    userId?: string,
    leadId?: string
  ): DesignContext {
    if (existing?.sessionId) {
      // Restore existing context
      return {
        ...createDesignContext(existing.sessionId, userId, leadId),
        ...existing,
        updatedAt: new Date(),
        status: 'in_progress' as PipelineStatus,
      };
    }

    // Create new context
    return createDesignContext(crypto.randomUUID(), userId, leadId);
  }

  /**
   * Merge agent result into context
   */
  private mergeResult(
    context: DesignContext,
    agentName: AgentName,
    result: AgentResult<unknown>
  ): void {
    const data = result.data as Record<string, unknown>;
    if (!data) return;

    switch (agentName) {
      case 'diagram-interpreter':
        context.plot = data.plot as DesignContext['plot'];
        context.setbacks = data.setbacks as DesignContext['setbacks'];
        context.road = data.road as DesignContext['road'];
        context.orientation = data.orientation as DesignContext['orientation'];
        context.annotations = data.annotations as DesignContext['annotations'];
        context.diagramConfidence = data.confidence as number;
        break;

      case 'regulation-compliance':
        context.buildableEnvelope = data.buildable_envelope as DesignContext['buildableEnvelope'];
        context.regulationConstraints = data.constraints as DesignContext['regulationConstraints'];
        context.regulationViolations = data.violations as DesignContext['regulationViolations'];
        break;

      case 'engineer-clarification':
        context.structuralStrategy = data.structural_strategy as DesignContext['structuralStrategy'];
        context.engineeringRisks = data.engineering_risks as DesignContext['engineeringRisks'];
        break;

      case 'eco-design':
        context.ecoMandatory = data.mandatory_elements as DesignContext['ecoMandatory'];
        context.energyStrategy = data.energy_strategy as DesignContext['energyStrategy'];
        context.waterStrategy = data.water_strategy as DesignContext['waterStrategy'];
        context.materialPreferences = data.material_preferences as DesignContext['materialPreferences'];
        context.courtyardSpec = data.courtyard as DesignContext['courtyardSpec'];
        context.verandaSpec = data.veranda as DesignContext['verandaSpec'];
        break;

      case 'client-elicitation':
        context.pendingQuestions = data.questions as DesignContext['pendingQuestions'];
        break;

      case 'vastu-compliance':
        context.vastuZones = data.recommended_zones as DesignContext['vastuZones'];
        context.vastuConflicts = data.conflicts as DesignContext['vastuConflicts'];
        context.vastuDeviations = data.acceptable_deviations as DesignContext['vastuDeviations'];
        break;

      case 'architectural-zoning':
        context.zones = data.zones as DesignContext['zones'];
        context.adjacencyRules = data.adjacency_rules as DesignContext['adjacencyRules'];
        context.circulationLogic = data.circulation_logic as string;
        context.entrySequence = data.entry_sequence as string[];
        break;

      case 'dimensioning':
        context.rooms = data.rooms as DesignContext['rooms'];
        context.courtyardSize = data.courtyard as DesignContext['courtyardSize'];
        context.totalBuiltUp = data.total_built_up_sqft as number;
        context.carpetArea = data.carpet_area_sqft as number;
        context.efficiency = data.efficiency_percent as number;
        break;

      case 'engineering-plan':
        context.wallSystem = data.wall_system as DesignContext['wallSystem'];
        context.staircase = data.staircase as DesignContext['staircase'];
        context.plumbingStrategy = data.plumbing_strategy as DesignContext['plumbingStrategy'];
        context.ventilationShafts = data.ventilation_shafts as DesignContext['ventilationShafts'];
        context.expansionProvision = data.expansion_provision as DesignContext['expansionProvision'];
        break;

      case 'design-validation':
        context.validationStatus = data.status as DesignContext['validationStatus'];
        context.validationIssues = data.issues as DesignContext['validationIssues'];
        context.validationSeverity = data.severity as DesignContext['validationSeverity'];
        context.complianceChecklist = data.compliance_checklist as DesignContext['complianceChecklist'];
        break;

      case 'narrative':
        context.designRationale = data.design_rationale as string;
        context.ecoSummary = data.eco_summary as string;
        context.vastuSummary = data.vastu_summary as string;
        context.constructionNotes = data.construction_notes as string;
        break;

      case 'visualization':
        context.renderPrompts = {
          courtyard: data.courtyard_prompt as string,
          exterior: data.exterior_prompt as string,
          interior: data.interior_prompt as string,
          floorPlan: data.floor_plan_prompt as string,
        };
        break;

      case 'floor-plan-image':
        if (data.floorPlan || data.courtyard || data.exterior || data.interior) {
          context.generatedImages = {
            floorPlan: data.floorPlan as DesignContext['generatedImages'] extends undefined ? undefined : NonNullable<DesignContext['generatedImages']>['floorPlan'],
            courtyard: data.courtyard as DesignContext['generatedImages'] extends undefined ? undefined : NonNullable<DesignContext['generatedImages']>['courtyard'],
            exterior: data.exterior as DesignContext['generatedImages'] extends undefined ? undefined : NonNullable<DesignContext['generatedImages']>['exterior'],
            interior: data.interior as DesignContext['generatedImages'] extends undefined ? undefined : NonNullable<DesignContext['generatedImages']>['interior'],
          };
        }
        break;
    }
  }

  /**
   * Apply human answers to context fields
   */
  private applyAnswersToContext(
    context: DesignContext,
    answers: Record<string, string>
  ): void {
    // Initialize requirements if not present
    if (!context.requirements) {
      context.requirements = {
        bedrooms: 2,
        bathrooms: 2,
        hasPooja: false,
        hasParking: false,
        hasStore: false,
        hasServantRoom: false,
        floors: 1,
      };
    }

    // Apply answers to requirements
    for (const [key, value] of Object.entries(answers)) {
      if (key.startsWith('bedrooms')) {
        context.requirements.bedrooms = parseInt(value) || 2;
      } else if (key.startsWith('bathrooms')) {
        context.requirements.bathrooms = parseInt(value) || 2;
      } else if (key.startsWith('pooja')) {
        context.requirements.hasPooja = value.toLowerCase() === 'yes';
      } else if (key.startsWith('parking')) {
        context.requirements.hasParking = value.toLowerCase() === 'yes';
      } else if (key.startsWith('floors')) {
        context.requirements.floors = parseInt(value) || 1;
      }
    }

    // Store all answers
    context.clientAnswers = { ...context.clientAnswers, ...answers };
  }

  // ============================================
  // Input Extraction Helpers
  // ============================================

  private extractRegulationInput(context: DesignContext) {
    return {
      plot: context.plot,
      setbacks: context.setbacks,
      cityAuthority: context.cityAuthority,
    };
  }

  private extractEngineerInput(context: DesignContext) {
    return {
      plot: context.plot,
      soilType: context.soilType,
    };
  }

  private extractEcoInput(context: DesignContext) {
    return {
      plot: context.plot,
      orientation: context.orientation,
    };
  }

  private extractElicitationInput(context: DesignContext) {
    return {
      plot: context.plot,
      buildableEnvelope: context.buildableEnvelope,
      existingAnswers: context.clientAnswers,
    };
  }

  private extractVastuInput(context: DesignContext) {
    return {
      orientation: context.orientation,
      buildableEnvelope: context.buildableEnvelope,
      requirements: context.requirements,
    };
  }

  private extractZoningInput(context: DesignContext) {
    return {
      requirements: context.requirements,
      vastuZones: context.vastuZones,
      ecoConstraints: context.ecoMandatory,
    };
  }

  private extractDimensioningInput(context: DesignContext) {
    return {
      zoning: context.zones,
      buildableEnvelope: context.buildableEnvelope,
      requirements: context.requirements,
    };
  }

  private extractEngineeringPlanInput(context: DesignContext) {
    return {
      rooms: context.rooms,
      structuralStrategy: context.structuralStrategy,
      buildableEnvelope: context.buildableEnvelope,
    };
  }

  private extractVisualizationInput(context: DesignContext) {
    return {
      rooms: context.rooms,
      ecoElements: context.ecoMandatory,
      materials: context.materialPreferences?.map(m => m.material),
      orientation: context.orientation,
    };
  }

  private extractFloorPlanImageInput(context: DesignContext) {
    return {
      renderPrompts: context.renderPrompts || {},
      rooms: context.rooms?.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        width: r.width,
        depth: r.depth,
        area_sqft: r.areaSqft,
        zone: r.zone,
        adjacent_to: r.adjacentTo || [],
      })),
      plotDimensions: context.plot
        ? {
            width: context.plot.width,
            depth: context.plot.depth,
            unit: context.plot.unit,
          }
        : undefined,
      orientation: context.orientation,
      ecoElements: context.ecoMandatory,
      materials: context.materialPreferences?.map(m => m.material),
      // Vastu zones for room placement algorithm
      vastuZones: context.vastuZones,
      // Road side for entrance/verandah placement
      roadSide: context.road?.side,
    };
  }
}
