/**
 * Planning Service
 *
 * Bridge between web API routes and the planning agents backend.
 * Manages session state, orchestrates the 12-agent pipeline, and
 * handles the conversational flow for floor plan generation.
 *
 * Now with Supabase persistence for session memory.
 */

import { planning } from '@maiyuri/api';
import { floorPlanSupabase, type DbFloorPlanSession } from './floor-plan-supabase';

const {
  createPlanningPipeline,
  createDiagramInterpreterAgent,
  HaltError,
  PipelineError,
  DesignValidationError,
} = planning;

type DesignContext = planning.DesignContext;
type PipelineStatus = planning.PipelineStatus;

// Flag to enable/disable Supabase persistence (for gradual rollout)
const USE_SUPABASE = process.env.ENABLE_FLOOR_PLAN_PERSISTENCE === 'true';

/**
 * Session data stored for each planning session
 */
export interface PlanningSession {
  sessionId: string;
  projectType: 'residential' | 'compound' | 'commercial';
  status: 'collecting' | 'generating' | 'awaiting_blueprint_confirmation' | 'generating_isometric' | 'presenting' | 'iterating' | 'halted' | 'complete' | 'failed';
  inputs: Record<string, unknown>;
  currentQuestionIndex: number;
  createdAt: Date;
  updatedAt: Date;
  designContext?: DesignContext;
  generationProgress?: GenerationProgress;
  blueprintImage?: { base64Data: string; mimeType: string };
  error?: string;
}

/**
 * Generation progress tracking
 */
export interface GenerationProgress {
  status: 'pending' | 'in_progress' | 'awaiting_confirmation' | 'complete' | 'failed';
  currentStage: string;
  currentAgent?: string;
  stageIndex: number;
  percent: number;
  startedAt: Date;
  completedAt?: Date;
  phase: 'blueprint' | 'isometric';
  result?: {
    images: {
      floorPlan?: { base64Data: string; mimeType: string };
      courtyard?: { base64Data: string; mimeType: string };
      exterior?: { base64Data: string; mimeType: string };
    };
    designContext?: Partial<DesignContext>;
  };
  error?: string;
}

/**
 * Generation stages for progress tracking - Blueprint Phase
 */
const BLUEPRINT_STAGES = [
  { id: 'diagram', label: 'Analyzing plot', icon: '📐', agentName: 'diagram-interpreter' },
  { id: 'parallel1', label: 'Checking regulations & eco', icon: '📋', agentName: 'regulation-compliance' },
  { id: 'vastu', label: 'Applying Vastu principles', icon: '🏛️', agentName: 'vastu-compliance' },
  { id: 'zoning', label: 'Planning room zones', icon: '📍', agentName: 'architectural-zoning' },
  { id: 'dimensions', label: 'Calculating dimensions', icon: '📐', agentName: 'dimensioning' },
  { id: 'engineering', label: 'Engineering plan', icon: '🔧', agentName: 'engineering-plan' },
  { id: 'validation', label: 'Validating design', icon: '✅', agentName: 'design-validation' },
  { id: 'blueprint', label: 'Generating blueprint', icon: '🗺️', agentName: 'floor-plan-image' },
];

/**
 * Generation stages for progress tracking - Isometric Phase (after blueprint confirmation)
 */
const ISOMETRIC_STAGES = [
  { id: 'visualization', label: 'Preparing 3D visualization', icon: '🎨', agentName: 'visualization' },
  { id: 'isometric', label: 'Rendering isometric view', icon: '🏠', agentName: 'isometric-render' },
];

/**
 * Combined stages for full progress display
 */
const ALL_STAGES = [...BLUEPRINT_STAGES, { id: 'confirmation', label: 'Awaiting blueprint confirmation', icon: '✋', agentName: 'user-confirmation' }, ...ISOMETRIC_STAGES];

/**
 * In-memory session store (fallback when Supabase is disabled)
 */
const sessions = new Map<string, PlanningSession>();

/**
 * Convert DB session to local PlanningSession format
 */
/**
 * Calculate current question index based on collected inputs
 * This is needed when loading sessions from database
 */
function calculateQuestionIndex(
  projectType: string,
  inputs: Record<string, unknown>
): number {
  // Import question configs from the answer route
  // For now, return a reasonable default based on input count
  // The answer route will recalculate the correct next question
  const inputKeys = Object.keys(inputs);

  // If budgetRange is answered (last question for residential), we're done
  if (inputs.budgetRange) {
    return 100; // High number to indicate all questions answered
  }

  // Otherwise, use the number of answered questions as a rough index
  return inputKeys.length;
}

function dbToSession(db: DbFloorPlanSession): PlanningSession {
  const inputs = db.collected_inputs as Record<string, unknown>;
  return {
    sessionId: db.id,
    projectType: db.project_type || 'residential',
    status: db.status,
    inputs,
    currentQuestionIndex: calculateQuestionIndex(db.project_type || 'residential', inputs),
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
    designContext: db.design_context as unknown as DesignContext | undefined,
    blueprintImage: db.blueprint_image || undefined,
    generationProgress: undefined, // Loaded separately from progress table
  };
}

/**
 * Convert local session to DB update format
 */
function sessionToDbUpdate(session: PlanningSession): Partial<DbFloorPlanSession> {
  // Convert image objects to base64 strings for DB storage
  const resultImages = session.generationProgress?.result?.images;
  const generatedImages = resultImages ? {
    floorPlan: resultImages.floorPlan?.base64Data,
    courtyard: resultImages.courtyard?.base64Data,
    exterior: resultImages.exterior?.base64Data,
  } : {};

  return {
    status: session.status,
    collected_inputs: session.inputs as Record<string, unknown>,
    design_context: session.designContext as unknown as DbFloorPlanSession['design_context'],
    blueprint_image: session.blueprintImage || null,
    generated_images: generatedImages,
  };
}

/**
 * Create the planning pipeline with all agents
 */
function createPipeline() {
  return createPlanningPipeline({
    maxTokenBudget: 150000,
    timeoutMs: 600000, // 10 minutes
    enableParallelStages: true,
    enableCheckpoints: true,
  });
}

/**
 * Planning Service singleton
 */
export const planningService = {
  /**
   * Create a new planning session
   */
  async createSession(
    projectType: 'residential' | 'compound' | 'commercial',
    userId?: string
  ): Promise<PlanningSession> {
    if (USE_SUPABASE) {
      const result = await floorPlanSupabase.createSession(userId, projectType);
      if (result.success && result.data) {
        const session = dbToSession(result.data);
        // Also cache locally for fast reads
        sessions.set(session.sessionId, session);
        return session;
      }
      // Fall through to in-memory if Supabase fails
      console.warn('Supabase createSession failed, using in-memory:', result.error);
    }

    const sessionId = crypto.randomUUID();
    const session: PlanningSession = {
      sessionId,
      projectType,
      status: 'collecting',
      inputs: { projectType },
      currentQuestionIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sessions.set(sessionId, session);
    return session;
  },

  /**
   * Get a session by ID
   */
  async getSessionAsync(sessionId: string): Promise<PlanningSession | undefined> {
    // Check local cache first
    const cached = sessions.get(sessionId);
    if (cached) return cached;

    if (USE_SUPABASE) {
      const result = await floorPlanSupabase.getSession(sessionId);
      if (result.success && result.data) {
        const session = dbToSession(result.data);
        // Load progress if exists
        const progressResult = await floorPlanSupabase.getProgress(sessionId);
        if (progressResult.success && progressResult.data) {
          session.generationProgress = {
            status: progressResult.data.percent === 100 ? 'complete' : 'in_progress',
            currentStage: progressResult.data.current_stage,
            stageIndex: ALL_STAGES.findIndex(s => s.label === progressResult.data!.current_stage),
            percent: progressResult.data.percent,
            phase: progressResult.data.phase,
            startedAt: new Date(progressResult.data.created_at),
          };
        }
        sessions.set(sessionId, session);
        return session;
      }
    }

    return undefined;
  },

  /**
   * Get a session by ID (sync version for backward compatibility)
   */
  getSession(sessionId: string): PlanningSession | undefined {
    return sessions.get(sessionId);
  },

  /**
   * Update session inputs
   */
  async updateInputs(sessionId: string, inputs: Record<string, unknown>): Promise<PlanningSession | null> {
    // Try to get from memory first, then load from database if needed
    let session = sessions.get(sessionId);
    if (!session) {
      session = await this.getSessionAsync(sessionId);
      if (!session) return null;
    }

    session.inputs = { ...session.inputs, ...inputs };
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    // Persist to Supabase
    if (USE_SUPABASE) {
      await floorPlanSupabase.updateCollectedInputs(sessionId, inputs as Record<string, unknown>);

      // If client info is in inputs, also update the dedicated columns
      if (inputs.clientName || inputs.clientContact || inputs.clientLocation) {
        await floorPlanSupabase.updateClientInfo(sessionId, {
          clientName: inputs.clientName as string | undefined,
          clientContact: inputs.clientContact as string | undefined,
          clientLocation: inputs.clientLocation as string | undefined,
        });
      }
    }

    return session;
  },

  /**
   * Update client information for a session
   */
  async updateClientInfo(
    sessionId: string,
    clientInfo: {
      clientName?: string;
      clientContact?: string;
      clientLocation?: string;
    }
  ): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      // Update local session inputs
      session.inputs = { ...session.inputs, ...clientInfo };
      session.updatedAt = new Date();
      sessions.set(sessionId, session);
    }

    // Persist to Supabase
    if (USE_SUPABASE) {
      await floorPlanSupabase.updateClientInfo(sessionId, clientInfo);
    }
  },

  /**
   * Set session question index
   */
  async setQuestionIndex(sessionId: string, index: number): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      session.currentQuestionIndex = index;
      session.updatedAt = new Date();
      sessions.set(sessionId, session);
    }
  },

  /**
   * Map user-provided setbacks (north, south, east, west) to orientation-based setbacks (front, rear, left, right)
   * based on the road-facing side
   */
  mapSetbacksToOrientation(inputs: Record<string, unknown>): {
    front: number;
    rear: number;
    left: number;
    right: number;
    unit: 'feet';
  } {
    const setbackData = inputs.setbacks as Record<string, unknown> | undefined;
    const roadSide = (inputs.roadSide as string) || 'east';

    // Default setbacks for Tamil Nadu residential (in feet)
    const defaultSetbacks = {
      front: 10,
      rear: 6,
      left: 3,
      right: 3,
    };

    // If user didn't provide setbacks, use defaults
    if (!setbackData) {
      return { ...defaultSetbacks, unit: 'feet' as const };
    }

    // Extract user-provided values (in feet)
    const north = typeof setbackData.north === 'string' ? parseFloat(setbackData.north) : (setbackData.north as number) || defaultSetbacks.front;
    const south = typeof setbackData.south === 'string' ? parseFloat(setbackData.south) : (setbackData.south as number) || defaultSetbacks.rear;
    const east = typeof setbackData.east === 'string' ? parseFloat(setbackData.east) : (setbackData.east as number) || defaultSetbacks.left;
    const west = typeof setbackData.west === 'string' ? parseFloat(setbackData.west) : (setbackData.west as number) || defaultSetbacks.right;

    // Map based on road-facing direction
    let front: number, rear: number, left: number, right: number;

    switch (roadSide) {
      case 'north':
        front = north;
        rear = south;
        left = west;
        right = east;
        break;
      case 'south':
        front = south;
        rear = north;
        left = east;
        right = west;
        break;
      case 'east':
        front = east;
        rear = west;
        left = north;
        right = south;
        break;
      case 'west':
        front = west;
        rear = east;
        left = south;
        right = north;
        break;
      default:
        front = defaultSetbacks.front;
        rear = defaultSetbacks.rear;
        left = defaultSetbacks.left;
        right = defaultSetbacks.right;
    }

    return { front, rear, left, right, unit: 'feet' as const };
  },

  /**
   * Map chatbot inputs to DesignContext
   */
  mapInputsToContext(session: PlanningSession): Partial<DesignContext> {
    const inputs = session.inputs;
    const plotDims = inputs.plotDimensions as Record<string, number> | undefined;

    // Parse bedrooms/bathrooms
    const bedroomsStr = inputs.bedrooms as string;
    const bedrooms = bedroomsStr === '4+' ? 4 : parseInt(bedroomsStr) || 2;
    const bathroomsStr = inputs.bathrooms as string;
    const bathrooms = bathroomsStr === '3+' ? 3 : parseInt(bathroomsStr) || 2;

    // Parse floors
    const floorsStr = inputs.floors as string;
    const floors = floorsStr === 'g+2' ? 3 : floorsStr === 'g+1' ? 2 : 1;

    // Parse eco features
    const ecoFeatures = Array.isArray(inputs.ecoFeatures)
      ? (inputs.ecoFeatures as string[])
      : inputs.ecoFeatures
        ? [inputs.ecoFeatures as string]
        : ['rainwater', 'ventilation'];

    return {
      sessionId: session.sessionId,
      status: 'pending' as PipelineStatus,
      plot: plotDims
        ? {
            width: plotDims.east || plotDims.west || 40,
            depth: plotDims.north || plotDims.south || 60,
            area: (plotDims.east || 40) * (plotDims.north || 60),
            unit: 'feet' as const,
          }
        : { width: 40, depth: 60, area: 2400, unit: 'feet' as const },
      orientation: ((inputs.roadSide as string) || 'east') as 'north' | 'south' | 'east' | 'west',
      road: {
        side: ((inputs.roadSide as string) || 'east') as 'north' | 'south' | 'east' | 'west',
        width: 30,
      },
      // Map user-provided setbacks or use defaults
      setbacks: this.mapSetbacksToOrientation(inputs),
      requirements: {
        bedrooms,
        bathrooms,
        hasPooja: inputs.hasPooja === 'separate' || inputs.hasPooja === 'corner',
        hasParking: inputs.parking !== 'none',
        hasStore: true,
        hasServantRoom: false,
        floors,
        budgetRange: inputs.budgetRange as 'economy' | 'standard' | 'premium' | undefined,
      },
      ecoMandatory: ecoFeatures,
      energyStrategy: {
        passiveCooling: true,
        crossVentilation: ecoFeatures.includes('ventilation'),
        westWallMinimized: true,
        naturalLighting: true,
        solarProvision: ecoFeatures.includes('solar'),
      },
      waterStrategy: {
        rainwaterHarvesting: ecoFeatures.includes('rainwater'),
        greyWaterRecycling: ecoFeatures.includes('greywater'),
      },
      materialPreferences: [
        {
          material: (inputs.wallMaterial as string) || 'mud-interlock',
          reason: 'User preference',
          carbonImpact: (inputs.wallMaterial === 'mud-interlock' ? 'low' : 'medium') as 'low' | 'medium' | 'high',
        },
        {
          material: (inputs.flooringType as string) || 'oxide',
          reason: 'User preference',
          carbonImpact: (inputs.flooringType === 'oxide' ? 'low' : 'medium') as 'low' | 'medium' | 'high',
        },
      ],
      courtyardSpec: inputs.hasMutram === 'yes' ? {
        required: true as const,
        minArea: 64,
        position: 'central' as const,
      } : undefined,
      verandaSpec: inputs.hasVerandah === 'yes' ? {
        required: true as const,
        width: 6,
        sides: [((inputs.roadSide as string) || 'east') as 'north' | 'south' | 'east' | 'west'],
      } : undefined,
      clientAnswers: inputs as Record<string, string>,
    };
  },

  /**
   * Start floor plan generation - runs full pipeline but pauses for blueprint confirmation
   */
  async startGeneration(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // Update session status
    session.status = 'generating';
    session.generationProgress = {
      status: 'in_progress',
      currentStage: BLUEPRINT_STAGES[0].label,
      currentAgent: BLUEPRINT_STAGES[0].agentName,
      stageIndex: 0,
      percent: 0,
      phase: 'blueprint',
      startedAt: new Date(),
    };
    sessions.set(sessionId, session);

    // Persist to Supabase
    if (USE_SUPABASE) {
      await floorPlanSupabase.updateSessionStatus(sessionId, 'generating');
      await floorPlanSupabase.updateProgress(sessionId, {
        phase: 'blueprint',
        current_stage: BLUEPRINT_STAGES[0].label,
        percent: 0,
        stages: BLUEPRINT_STAGES.map(s => ({
          id: s.id,
          label: s.label,
          icon: s.icon,
          status: 'pending' as const,
        })),
      });
    }

    try {
      // Create pipeline
      const pipeline = createPipeline();

      // Map inputs to design context
      const contextInput = this.mapInputsToContext(session);

      // Check if we have a survey image
      const surveyImage = session.inputs.surveyImage as string | undefined;
      const pipelineInput = surveyImage
        ? { imageBase64: surveyImage, mimeType: 'image/png' as const }
        : {};

      // Run full pipeline - we'll pause after showing blueprint for confirmation
      const context = await pipeline.runPipeline(
        pipelineInput,
        contextInput as Partial<DesignContext>,
        session.sessionId
      );

      // Update session - pause for blueprint confirmation before revealing 3D views
      const sess = sessions.get(sessionId);
      if (sess) {
        sess.status = 'awaiting_blueprint_confirmation';
        sess.designContext = context;
        sess.blueprintImage = context.generatedImages?.floorPlan;
        sess.generationProgress = {
          ...sess.generationProgress!,
          status: 'awaiting_confirmation',
          currentStage: 'Blueprint ready - awaiting your confirmation',
          stageIndex: BLUEPRINT_STAGES.length,
          percent: Math.round((BLUEPRINT_STAGES.length / ALL_STAGES.length) * 100),
          phase: 'blueprint',
          result: {
            images: {
              floorPlan: context.generatedImages?.floorPlan,
            },
            designContext: context as unknown as Partial<DesignContext>,
          },
        };
        sessions.set(sessionId, sess);

        // Persist to Supabase
        if (USE_SUPABASE) {
          await floorPlanSupabase.updateSessionStatus(sessionId, 'awaiting_blueprint_confirmation');
          await floorPlanSupabase.updateBlueprintImage(sessionId, context.generatedImages?.floorPlan || null);
          await floorPlanSupabase.updateDesignContext(sessionId, context as unknown as import('./floor-plan-supabase').DbFloorPlanSession['design_context']);
          await floorPlanSupabase.updateProgress(sessionId, {
            phase: 'blueprint',
            current_stage: 'Blueprint ready - awaiting your confirmation',
            percent: Math.round((BLUEPRINT_STAGES.length / ALL_STAGES.length) * 100),
            stages: BLUEPRINT_STAGES.map(s => ({
              id: s.id,
              label: s.label,
              icon: s.icon,
              status: 'completed' as const,
            })),
          });
        }
      }
    } catch (error) {
      const sess = sessions.get(sessionId);
      if (sess) {
        if (error instanceof HaltError) {
          // Pipeline halted for clarification
          sess.status = 'halted';
          sess.designContext = error.context;
          sess.generationProgress = {
            ...sess.generationProgress!,
            status: 'pending',
            currentStage: 'Awaiting clarification',
            phase: 'blueprint',
          };
        } else {
          // Pipeline failed
          sess.status = 'failed';
          sess.error = error instanceof Error ? error.message : 'Generation failed';
          sess.generationProgress = {
            ...sess.generationProgress!,
            status: 'failed',
            error: sess.error,
            phase: 'blueprint',
          };
        }
        sessions.set(sessionId, sess);
      }

      // Re-throw validation errors for special handling
      if (error instanceof DesignValidationError || error instanceof PipelineError) {
        throw error;
      }
    }
  },

  /**
   * Confirm blueprint and reveal the isometric/3D views
   */
  async confirmBlueprint(sessionId: string, confirmed: boolean, feedback?: string): Promise<{
    success: boolean;
    message: string;
    status: PlanningSession['status'];
  }> {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found', status: 'failed' };
    }

    if (session.status !== 'awaiting_blueprint_confirmation') {
      return {
        success: false,
        message: 'Session is not awaiting blueprint confirmation',
        status: session.status
      };
    }

    if (!confirmed) {
      // User rejected the blueprint - store feedback and allow regeneration
      session.inputs.blueprintFeedback = feedback;
      session.status = 'collecting';
      session.generationProgress = undefined;
      session.blueprintImage = undefined;
      sessions.set(sessionId, session);

      // Persist to Supabase
      if (USE_SUPABASE) {
        await floorPlanSupabase.updateSessionStatus(sessionId, 'collecting');
        await floorPlanSupabase.updateBlueprintImage(sessionId, null);
        await floorPlanSupabase.deleteProgress(sessionId);
        if (feedback) {
          await floorPlanSupabase.createModification(sessionId, feedback, session.blueprintImage || undefined);
        }
      }

      return {
        success: true,
        message: 'Blueprint rejected. Please provide modifications or regenerate.',
        status: 'collecting'
      };
    }

    // User confirmed - reveal the already-generated 3D views
    // The isometric/exterior images were already generated by the pipeline
    session.status = 'complete';
    session.generationProgress = {
      ...session.generationProgress!,
      status: 'complete',
      currentStage: 'Complete',
      stageIndex: ALL_STAGES.length,
      percent: 100,
      completedAt: new Date(),
      phase: 'isometric',
      result: {
        images: {
          floorPlan: session.designContext?.generatedImages?.floorPlan,
          courtyard: session.designContext?.generatedImages?.courtyard,
          exterior: session.designContext?.generatedImages?.exterior,
        },
        designContext: session.designContext as unknown as Partial<DesignContext>,
      },
    };
    sessions.set(sessionId, session);

    // Persist to Supabase
    if (USE_SUPABASE) {
      await floorPlanSupabase.updateSessionStatus(sessionId, 'complete');
      await floorPlanSupabase.updateGeneratedImages(sessionId, {
        floorPlan: session.designContext?.generatedImages?.floorPlan?.base64Data,
        courtyard: session.designContext?.generatedImages?.courtyard?.base64Data,
        exterior: session.designContext?.generatedImages?.exterior?.base64Data,
      });
      await floorPlanSupabase.updateProgress(sessionId, {
        phase: 'isometric',
        current_stage: 'Complete',
        percent: 100,
        stages: ALL_STAGES.map(s => ({
          id: s.id,
          label: s.label,
          icon: s.icon,
          status: 'completed' as const,
        })),
      });
    }

    return {
      success: true,
      message: 'Blueprint confirmed! Here are your 3D views.',
      status: 'complete'
    };
  },

  /**
   * Process a survey image upload
   */
  async processSurveyImage(sessionId: string, imageBase64: string): Promise<{
    success: boolean;
    dimensions?: { north: number; south: number; east: number; west: number };
    orientation?: string;
    error?: string;
  }> {
    const session = sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    try {
      // Create diagram interpreter agent
      const agent = createDiagramInterpreterAgent();

      // Execute with image
      const result = await agent.execute(
        { imageBase64, mimeType: 'image/png' },
        { sessionId } as DesignContext
      );

      if (result.success && result.data) {
        const data = result.data as {
          plot?: { width: number; depth: number };
          orientation?: string;
        };

        // Store in session
        session.inputs.surveyImage = imageBase64;
        session.inputs.plotDimensions = {
          north: data.plot?.depth || 60,
          south: data.plot?.depth || 60,
          east: data.plot?.width || 40,
          west: data.plot?.width || 40,
        };
        if (data.orientation) {
          session.inputs.roadSide = data.orientation;
        }
        session.updatedAt = new Date();
        sessions.set(sessionId, session);

        return {
          success: true,
          dimensions: session.inputs.plotDimensions as { north: number; south: number; east: number; west: number },
          orientation: data.orientation,
        };
      }

      return { success: false, error: result.error?.message || 'Failed to process survey' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Processing failed' };
    }
  },

  /**
   * Get current generation progress
   */
  getProgress(sessionId: string): GenerationProgress | null {
    const session = sessions.get(sessionId);
    return session?.generationProgress || null;
  },

  /**
   * Get generation stages for UI display
   */
  getStages(sessionId: string): Array<{
    id: string;
    label: string;
    icon: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_confirmation';
  }> {
    const session = sessions.get(sessionId);
    const progress = session?.generationProgress;

    return ALL_STAGES.map((stage, i) => ({
      id: stage.id,
      label: stage.label,
      icon: stage.icon,
      status:
        !progress ? 'pending' :
        progress.status === 'failed' && progress.currentAgent === stage.agentName ? 'failed' :
        stage.id === 'confirmation' && session?.status === 'awaiting_blueprint_confirmation' ? 'awaiting_confirmation' :
        i < (progress.stageIndex || 0) ? 'completed' :
        i === (progress.stageIndex || 0) ? 'in_progress' :
        'pending',
    }));
  },

  /**
   * Get blueprint image for confirmation
   */
  getBlueprintImage(sessionId: string): { base64Data: string; mimeType: string } | null {
    const session = sessions.get(sessionId);
    return session?.blueprintImage || null;
  },

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = sessions.delete(sessionId);

    // Also delete from Supabase
    if (USE_SUPABASE) {
      await floorPlanSupabase.deleteSession(sessionId);
    }

    return deleted;
  },

  /**
   * Get all sessions for a user (Supabase only)
   */
  async getUserSessions(userId: string, limit = 10): Promise<PlanningSession[]> {
    if (!USE_SUPABASE) {
      // Return in-memory sessions (no user filtering in memory mode)
      return Array.from(sessions.values()).slice(0, limit);
    }

    const result = await floorPlanSupabase.getUserSessions(userId, limit);
    if (result.success && result.data) {
      return result.data.map(dbToSession);
    }
    return [];
  },

  /**
   * Load a full session with all related data (Supabase only)
   */
  async loadFullSession(sessionId: string): Promise<{
    session: PlanningSession;
    messages: import('./floor-plan-supabase').ChatMessage[];
  } | null> {
    if (!USE_SUPABASE) {
      const session = sessions.get(sessionId);
      return session ? { session, messages: [] } : null;
    }

    const result = await floorPlanSupabase.loadFullSession(sessionId);
    if (result.success && result.data) {
      const session = dbToSession(result.data.session);
      if (result.data.progress) {
        session.generationProgress = {
          status: result.data.progress.percent === 100 ? 'complete' : 'in_progress',
          currentStage: result.data.progress.current_stage,
          stageIndex: ALL_STAGES.findIndex(s => s.label === result.data!.progress!.current_stage),
          percent: result.data.progress.percent,
          phase: result.data.progress.phase,
          startedAt: new Date(result.data.progress.created_at),
        };
      }
      // Cache locally
      sessions.set(sessionId, session);
      return { session, messages: result.data.messages };
    }
    return null;
  },

  /**
   * Add a message to a session (Supabase only)
   */
  async addMessage(
    sessionId: string,
    message: Omit<import('./floor-plan-supabase').ChatMessage, 'id' | 'timestamp'>
  ): Promise<void> {
    if (USE_SUPABASE) {
      await floorPlanSupabase.addMessage(sessionId, {
        role: message.role,
        content: message.content,
        type: message.type,
        options: message.options,
        imageUrl: message.imageUrl,
        imageBase64: message.imageBase64,
        progress: message.progress,
        formFields: message.formFields,
      });
    }
  },

  /**
   * Check if Supabase persistence is enabled
   */
  isPersistenceEnabled(): boolean {
    return USE_SUPABASE;
  },
};

export default planningService;
