/**
 * Agent Input/Output Contracts
 *
 * Defines the specific input and output shapes for each agent.
 * These contracts ensure type safety across the pipeline.
 */

import type { Direction, MeasurementUnit, StructuralStrategy, Room } from './design-context';

// ============================================
// Agent 1: Diagram Interpreter
// ============================================

export interface DiagramInterpreterInput {
  imageUrl?: string;
  imageBase64?: string;
  /** Supported image MIME types for Claude Vision API */
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

export interface DiagramInterpreterOutput {
  plot: {
    width: number | null;
    depth: number | null;
    area: number | null;
    unit: MeasurementUnit;
  };
  setbacks: {
    front: number | null;
    rear: number | null;
    left: number | null;
    right: number | null;
  };
  road: {
    side: Direction | null;
    width: number | null;
  };
  orientation: Direction | null;
  annotations: string[];
  confidence: number;
  open_questions: Array<{
    id: string;
    question: string;
    type: 'mandatory' | 'optional';
    reason: string;
  }>;
}

// ============================================
// Agent 2: Regulation & Compliance
// ============================================

export interface RegulationComplianceInput {
  plot: {
    width: number;
    depth: number;
    area: number;
  };
  setbacks: {
    front: number;
    rear: number;
    left: number;
    right: number;
  };
  cityAuthority?: string;
  plotType?: 'residential' | 'commercial' | 'mixed';
}

export interface RegulationComplianceOutput {
  buildable_envelope: {
    width: number;
    depth: number;
    area: number;
    maxHeight: number;
    maxFloors: number;
    fsi: number;
  };
  constraints: string[];
  violations: string[];
  assumptions: Array<{
    assumption: string;
    risk: 'low' | 'medium' | 'high';
  }>;
  open_questions: Array<{
    id: string;
    question: string;
    type: 'mandatory' | 'optional';
    reason: string;
  }>;
}

// ============================================
// Agent 3: Client Elicitation
// ============================================

export interface ClientElicitationInput {
  plot: {
    width: number;
    depth: number;
    area: number;
  };
  buildableEnvelope: {
    width: number;
    depth: number;
    area: number;
  };
  existingAnswers?: Record<string, string>;
}

export interface ClientElicitationOutput {
  questions: Array<{
    id: string;
    question: string;
    type: 'mandatory' | 'optional';
    category: 'functional' | 'aesthetic' | 'budget' | 'timeline';
    reason: string;
    defaultValue?: string;
    options?: string[];
  }>;
}

// ============================================
// Agent 4: Engineer Clarification
// ============================================

export interface EngineerClarificationInput {
  plot: {
    width: number;
    depth: number;
    area: number;
  };
  localConstructionNorms?: string;
  soilType?: string;
}

export interface EngineerClarificationOutput {
  structural_strategy: StructuralStrategy;
  engineering_risks: string[];
  assumptions: Array<{
    assumption: string;
    risk: 'low' | 'medium' | 'high';
    basis: string;
  }>;
  open_questions: Array<{
    id: string;
    question: string;
    type: 'mandatory' | 'optional';
    reason: string;
  }>;
}

// ============================================
// Agent 5: Vastu Compliance
// ============================================

export interface VastuComplianceInput {
  orientation: Direction;
  buildableEnvelope: {
    width: number;
    depth: number;
    area: number;
  };
  requirements: {
    bedrooms: number;
    hasPooja: boolean;
  };
}

export interface VastuComplianceOutput {
  recommended_zones: {
    northeast: string[];
    east: string[];
    southeast: string[];
    south: string[];
    southwest: string[];
    west: string[];
    northwest: string[];
    north: string[];
    center: string[];
  };
  conflicts: Array<{
    conflict: string;
    severity: 'minor' | 'moderate' | 'major';
    resolution?: string;
  }>;
  acceptable_deviations: Array<{
    deviation: string;
    reason: string;
    acceptable: boolean;
  }>;
  open_questions: Array<{
    id: string;
    question: string;
    type: 'mandatory' | 'optional';
    reason: string;
  }>;
}

// ============================================
// Agent 6: Eco-Design (NON-NEGOTIABLE)
// ============================================

export interface EcoDesignInput {
  plot: {
    width: number;
    depth: number;
  };
  orientation: Direction;
  climateZone?: string;
}

export interface EcoDesignOutput {
  mandatory_elements: string[];
  energy_strategy: {
    passive_cooling: boolean;
    cross_ventilation: boolean;
    west_wall_minimized: boolean;
    natural_lighting: boolean;
  };
  water_strategy: {
    rainwater_harvesting: boolean;
    greywater_recycling: boolean;
    sump_capacity_liters: number;
  };
  material_preferences: Array<{
    material: string;
    reason: string;
    carbon_impact: 'low' | 'medium' | 'high';
  }>;
  courtyard: {
    required: true;
    min_area_sqft: number;
    position: 'central' | 'offset';
  };
  veranda: {
    required: true;
    min_width_feet: number;
    sides: Direction[];
  };
  violations_if_removed: string[];
}

// ============================================
// Agent 7: Architectural Zoning
// ============================================

export interface ArchitecturalZoningInput {
  requirements: {
    bedrooms: number;
    bathrooms: number;
    hasPooja: boolean;
    hasParking: boolean;
    hasStore: boolean;
  };
  vastuZones: Record<string, string[]>;
  ecoConstraints: string[];
}

export interface ArchitecturalZoningOutput {
  zones: {
    public: string[];
    semi_private: string[];
    private: string[];
    service: string[];
  };
  adjacency_rules: Array<{
    room1: string;
    room2: string;
    relationship: 'adjacent' | 'near' | 'separated';
    reason: string;
  }>;
  circulation_logic: string;
  entry_sequence: string[];
}

// ============================================
// Agent 8: Dimensioning & Space Planning
// ============================================

export interface DimensioningInput {
  zoning: {
    public: string[];
    semiPrivate: string[];
    private: string[];
    service: string[];
  };
  buildableEnvelope: {
    width: number;
    depth: number;
    area: number;
  };
  requirements: {
    bedrooms: number;
    bathrooms: number;
  };
}

export interface DimensioningOutput {
  rooms: Array<{
    id: string;
    name: string;
    type: string;
    width: number;
    depth: number;
    area_sqft: number;
    zone: string;
    adjacent_to: string[];
  }>;
  courtyard: {
    width: number;
    depth: number;
    area_sqft: number;
  };
  total_built_up_sqft: number;
  carpet_area_sqft: number;
  efficiency_percent: number;
}

// ============================================
// Agent 9: Engineering Plan
// ============================================

export interface EngineeringPlanInput {
  rooms: Room[];
  structuralStrategy: StructuralStrategy;
  buildableEnvelope: {
    width: number;
    depth: number;
    maxFloors: number;
  };
}

export interface EngineeringPlanOutput {
  wall_system: {
    external_thickness_inches: number;
    internal_thickness_inches: number;
    material: string;
    load_bearing_walls: string[];
  };
  staircase: {
    type: 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';
    position: string;
    width_feet: number;
    riser_height_inches: number;
    tread_width_inches: number;
  };
  plumbing_strategy: {
    wet_areas_grouped: boolean;
    shaft_positions: string[];
    sewer_connection: Direction;
  };
  ventilation_shafts: Array<{
    position: string;
    serves_rooms: string[];
  }>;
  expansion_provision: {
    direction: Direction;
    type: 'vertical' | 'horizontal';
    notes: string;
  };
}

// ============================================
// Agent 10: Design Validation
// ============================================

export interface DesignValidationInput {
  fullContext: Record<string, unknown>;
}

export interface DesignValidationOutput {
  status: 'PASS' | 'FAIL' | 'PASS_WITH_WARNINGS';
  issues: Array<{
    id: string;
    type: 'error' | 'warning' | 'info';
    category: 'regulation' | 'vastu' | 'eco' | 'structural' | 'dimensional';
    message: string;
    affected_element?: string;
    suggested_fix?: string;
  }>;
  severity: 'low' | 'medium' | 'high';
  compliance_checklist: Array<{
    item: string;
    passed: boolean;
    notes?: string;
  }>;
}

// ============================================
// Agent 11: Narrative
// ============================================

export interface NarrativeInput {
  fullContext: Record<string, unknown>;
  language?: 'en' | 'ta';
}

export interface NarrativeOutput {
  design_rationale: string;
  eco_summary: string;
  vastu_summary: string;
  construction_notes: string;
}

// ============================================
// Agent 12: Visualization
// ============================================

export interface VisualizationInput {
  rooms: Room[];
  ecoElements: string[];
  materials: string[];
  orientation: Direction;
}

export interface VisualizationOutput {
  courtyard_prompt: string;
  exterior_prompt: string;
  interior_prompt: string;
  floor_plan_prompt: string;
}
