/**
 * DesignContext - Central State Object
 *
 * All agents read from and write to this shared object.
 * The orchestrator passes it through the pipeline, accumulating results.
 */

import type { AgentName, OpenQuestion, Assumption } from './agent-result';

/**
 * Pipeline status states
 */
export type PipelineStatus =
  | 'pending'      // Not started
  | 'in_progress'  // Running
  | 'halted'       // Waiting for human input
  | 'completed'    // Successfully finished
  | 'failed';      // Error occurred

/**
 * Measurement units
 */
export type MeasurementUnit = 'feet' | 'meters';

/**
 * Cardinal directions
 */
export type Direction = 'north' | 'south' | 'east' | 'west';

/**
 * Structural strategy options
 */
export type StructuralStrategy = 'load-bearing' | 'rcc' | 'hybrid';

/**
 * Room definition
 */
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  width: number;
  depth: number;
  areaSqft: number;
  zone: ZoneType;
  adjacentTo?: string[];
  features?: string[];
}

export type RoomType =
  | 'bedroom'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'pooja'
  | 'store'
  | 'courtyard'
  | 'veranda'
  | 'staircase'
  | 'utility'
  | 'parking'
  | 'other';

export type ZoneType = 'public' | 'semi_private' | 'private' | 'service';

/**
 * Validation issue
 */
export interface ValidationIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'regulation' | 'vastu' | 'eco' | 'structural' | 'dimensional';
  message: string;
  affectedElement?: string;
  suggestedFix?: string;
}

/**
 * Client question for elicitation
 */
export interface ClientQuestion {
  id: string;
  question: string;
  type: 'mandatory' | 'optional';
  category: 'functional' | 'aesthetic' | 'budget' | 'timeline';
  reason: string;
  defaultValue?: string;
  options?: string[];
}

/**
 * DesignContext - The canonical data contract
 *
 * All agents read and write to this shared object.
 * Each section is owned by a specific agent.
 */
export interface DesignContext {
  // ============================================
  // Session Metadata
  // ============================================
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
  status: PipelineStatus;
  currentAgent: AgentName | null;
  haltReason?: string;
  userId?: string;
  leadId?: string;

  // ============================================
  // Agent 1: Diagram Interpretation
  // ============================================
  plot?: {
    width: number;
    depth: number;
    area: number;
    unit: MeasurementUnit;
    shape?: 'rectangular' | 'irregular';
    irregularPoints?: { x: number; y: number }[];
  };

  setbacks?: {
    front: number;
    rear: number;
    left: number;
    right: number;
    unit: MeasurementUnit;
  };

  road?: {
    side: Direction;
    width: number;
    type?: 'main' | 'access' | 'internal';
  };

  orientation?: Direction;
  annotations?: string[];
  diagramConfidence?: number;

  // ============================================
  // Agent 2: Regulation & Compliance
  // ============================================
  buildableEnvelope?: {
    width: number;
    depth: number;
    area: number;
    maxHeight?: number;
    maxFloors?: number;
    fsi?: number; // Floor Space Index
  };

  regulationConstraints?: string[];
  regulationViolations?: string[];
  cityAuthority?: string;

  // ============================================
  // Agent 3: Client Requirements
  // ============================================
  clientAnswers?: Record<string, string>;
  pendingQuestions?: ClientQuestion[];

  requirements?: {
    bedrooms: number;
    bathrooms: number;
    hasPooja: boolean;
    hasParking: boolean;
    hasStore: boolean;
    hasServantRoom: boolean;
    floors: number;
    specialRequests?: string[];
    budgetRange?: 'economy' | 'standard' | 'premium';
  };

  // ============================================
  // Agent 4: Engineer Clarification
  // ============================================
  structuralStrategy?: StructuralStrategy;
  engineeringRisks?: string[];
  soilType?: 'clay' | 'sandy' | 'rocky' | 'mixed' | 'unknown';
  groundwaterLevel?: 'high' | 'medium' | 'low' | 'unknown';

  engineeringAssumptions?: {
    assumption: string;
    risk: 'low' | 'medium' | 'high';
  }[];

  // ============================================
  // Agent 5: Vastu Compliance
  // ============================================
  vastuZones?: {
    northeast?: string[]; // Ishaanya - Water elements, pooja
    east?: string[];      // Indra - Main entrance preferred
    southeast?: string[]; // Agni - Kitchen
    south?: string[];     // Yama - Master bedroom
    southwest?: string[]; // Nairutya - Heavy storage
    west?: string[];      // Varuna - Dining, children
    northwest?: string[]; // Vayu - Guest room, garage
    north?: string[];     // Kubera - Living room, treasury
    center?: string[];    // Brahmasthana - Open courtyard
  };

  vastuConflicts?: {
    conflict: string;
    severity: 'minor' | 'moderate' | 'major';
    resolution?: string;
  }[];

  vastuDeviations?: {
    deviation: string;
    reason: string;
    acceptable: boolean;
  }[];

  // ============================================
  // Agent 6: Eco-Design (NON-NEGOTIABLE)
  // ============================================
  ecoMandatory?: string[];

  energyStrategy?: {
    passiveCooling: boolean;
    crossVentilation: boolean;
    westWallMinimized: boolean;
    naturalLighting: boolean;
    solarProvision?: boolean;
  };

  waterStrategy?: {
    rainwaterHarvesting: boolean;
    greyWaterRecycling?: boolean;
    borewell?: boolean;
    sumpCapacity?: number;
  };

  materialPreferences?: {
    material: string;
    reason: string;
    carbonImpact: 'low' | 'medium' | 'high';
  }[];

  courtyardSpec?: {
    required: true; // Always true - non-negotiable
    minArea: number;
    position: 'central' | 'offset';
  };

  verandaSpec?: {
    required: true; // Always true - non-negotiable
    width: number;
    sides: Direction[];
  };

  // ============================================
  // Agent 7: Architectural Zoning
  // ============================================
  zones?: {
    public: string[];       // Living, dining, veranda
    semiPrivate: string[];  // Kitchen, family room
    private: string[];      // Bedrooms, bathrooms
    service: string[];      // Utility, parking, store
  };

  adjacencyRules?: {
    room1: string;
    room2: string;
    relationship: 'adjacent' | 'near' | 'separated';
    reason: string;
  }[];

  circulationLogic?: string;
  entrySequence?: string[];

  // ============================================
  // Agent 8: Dimensioning & Space Planning
  // ============================================
  rooms?: Room[];
  courtyardSize?: {
    width: number;
    depth: number;
    areaSqft: number;
  };
  totalBuiltUp?: number;
  carpetArea?: number;
  efficiency?: number; // Built-up vs carpet ratio

  // ============================================
  // Agent 9: Engineering Plan
  // ============================================
  wallSystem?: {
    externalThickness: number;
    internalThickness: number;
    material: string;
    loadBearingWalls?: string[];
  };

  staircase?: {
    type: 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';
    position: string;
    width: number;
    riserHeight: number;
    treadWidth: number;
  };

  plumbingStrategy?: {
    wetAreasGrouped: boolean;
    shaftPositions: string[];
    sewerConnection: Direction;
  };

  ventilationShafts?: {
    position: string;
    servesRooms: string[];
  }[];

  expansionProvision?: {
    direction: Direction;
    type: 'vertical' | 'horizontal';
    notes: string;
  };

  // ============================================
  // Agent 10: Design Validation
  // ============================================
  validationStatus?: 'PASS' | 'FAIL' | 'PASS_WITH_WARNINGS';
  validationIssues?: ValidationIssue[];
  validationSeverity?: 'low' | 'medium' | 'high';
  complianceChecklist?: {
    item: string;
    passed: boolean;
    notes?: string;
  }[];

  // ============================================
  // Agent 11: Narrative
  // ============================================
  designRationale?: string;
  ecoSummary?: string;
  vastuSummary?: string;
  constructionNotes?: string;

  // ============================================
  // Agent 12: Visualization
  // ============================================
  renderPrompts?: {
    courtyard?: string;
    exterior?: string;
    interior?: string;
    floorPlan?: string;
  };

  // ============================================
  // Agent 13: Floor Plan Image Generator
  // ============================================
  generatedImages?: {
    floorPlan?: {
      base64Data: string;
      mimeType: 'image/png' | 'image/jpeg';
      width?: number;
      height?: number;
      generatedAt: Date;
    };
    courtyard?: {
      base64Data: string;
      mimeType: 'image/png' | 'image/jpeg';
      width?: number;
      height?: number;
      generatedAt: Date;
    };
    exterior?: {
      base64Data: string;
      mimeType: 'image/png' | 'image/jpeg';
      width?: number;
      height?: number;
      generatedAt: Date;
    };
    interior?: {
      base64Data: string;
      mimeType: 'image/png' | 'image/jpeg';
      width?: number;
      height?: number;
      generatedAt: Date;
    };
  };

  // ============================================
  // Aggregated Open Questions (Halt Trigger)
  // ============================================
  openQuestions: OpenQuestion[];
  assumptions: Assumption[];

  // ============================================
  // Token Usage Tracking
  // ============================================
  tokenUsage?: {
    total: number;
    byAgent: Record<AgentName, { input: number; output: number }>;
  };
}

/**
 * Create a new empty DesignContext
 */
export function createDesignContext(
  sessionId: string,
  userId?: string,
  leadId?: string
): DesignContext {
  return {
    sessionId,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'pending',
    currentAgent: null,
    userId,
    leadId,
    openQuestions: [],
    assumptions: [],
  };
}

/**
 * Type guard for completed context
 */
export function isContextComplete(context: DesignContext): boolean {
  return (
    context.status === 'completed' &&
    context.validationStatus === 'PASS' &&
    context.rooms !== undefined &&
    context.rooms.length > 0
  );
}
