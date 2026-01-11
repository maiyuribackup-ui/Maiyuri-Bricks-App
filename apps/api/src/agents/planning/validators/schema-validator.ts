/**
 * JSON Schema Validator
 *
 * Validates agent outputs against their defined schemas.
 * Uses Zod for runtime type checking.
 */

import { z } from 'zod';
import type { AgentName } from '../types/agent-result';

/**
 * Validation error details
 */
export interface SchemaValidationError {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

/**
 * Validation result
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: SchemaValidationError[];
}

/**
 * Base open question schema (used by most agents)
 */
const openQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  type: z.enum(['mandatory', 'optional']),
  reason: z.string(),
});

/**
 * Base assumption schema
 */
const assumptionSchema = z.object({
  assumption: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
  basis: z.string().optional(),
});

// ============================================
// Agent-Specific Schemas
// ============================================

/**
 * Agent 1: Diagram Interpreter Output Schema
 */
export const diagramInterpreterSchema = z.object({
  plot: z.object({
    width: z.number().nullable(),
    depth: z.number().nullable(),
    area: z.number().nullable(),
    unit: z.enum(['feet', 'meters']),
  }),
  setbacks: z.object({
    front: z.number().nullable(),
    rear: z.number().nullable(),
    left: z.number().nullable(),
    right: z.number().nullable(),
  }),
  road: z.object({
    side: z.enum(['north', 'south', 'east', 'west']).nullable(),
    width: z.number().nullable(),
  }),
  orientation: z.enum(['north', 'south', 'east', 'west']).nullable(),
  annotations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  open_questions: z.array(openQuestionSchema),
});

/**
 * Agent 2: Regulation Compliance Output Schema
 */
export const regulationComplianceSchema = z.object({
  buildable_envelope: z.object({
    width: z.number(),
    depth: z.number(),
    area: z.number(),
    maxHeight: z.number(),
    maxFloors: z.number(),
    fsi: z.number(),
  }),
  constraints: z.array(z.string()),
  violations: z.array(z.string()),
  assumptions: z.array(assumptionSchema),
  open_questions: z.array(openQuestionSchema),
});

/**
 * Agent 3: Client Elicitation Output Schema
 */
export const clientElicitationSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      type: z.enum(['mandatory', 'optional']),
      category: z.enum(['functional', 'aesthetic', 'budget', 'timeline']),
      reason: z.string(),
      defaultValue: z.string().optional(),
      options: z.array(z.string()).optional(),
    })
  ),
});

/**
 * Agent 4: Engineer Clarification Output Schema
 */
export const engineerClarificationSchema = z.object({
  structural_strategy: z.enum(['load-bearing', 'rcc', 'hybrid']),
  engineering_risks: z.array(z.string()),
  assumptions: z.array(assumptionSchema),
  open_questions: z.array(openQuestionSchema),
});

/**
 * Agent 5: Vastu Compliance Output Schema
 */
export const vastuComplianceSchema = z.object({
  recommended_zones: z.object({
    northeast: z.array(z.string()),
    east: z.array(z.string()),
    southeast: z.array(z.string()),
    south: z.array(z.string()),
    southwest: z.array(z.string()),
    west: z.array(z.string()),
    northwest: z.array(z.string()),
    north: z.array(z.string()),
    center: z.array(z.string()),
  }),
  conflicts: z.array(
    z.object({
      conflict: z.string(),
      severity: z.enum(['minor', 'moderate', 'major']),
      resolution: z.string().optional(),
    })
  ),
  acceptable_deviations: z.array(
    z.object({
      deviation: z.string(),
      reason: z.string(),
      acceptable: z.boolean(),
    })
  ),
  open_questions: z.array(openQuestionSchema),
});

/**
 * Agent 6: Eco-Design Output Schema
 */
export const ecoDesignSchema = z.object({
  mandatory_elements: z.array(z.string()),
  energy_strategy: z.object({
    passive_cooling: z.boolean(),
    cross_ventilation: z.boolean(),
    west_wall_minimized: z.boolean(),
    natural_lighting: z.boolean(),
  }),
  water_strategy: z.object({
    rainwater_harvesting: z.boolean(),
    greywater_recycling: z.boolean(),
    sump_capacity_liters: z.number(),
  }),
  material_preferences: z.array(
    z.object({
      material: z.string(),
      reason: z.string(),
      carbon_impact: z.enum(['low', 'medium', 'high']),
    })
  ),
  courtyard: z.object({
    required: z.literal(true),
    min_area_sqft: z.number(),
    position: z.enum(['central', 'offset']),
  }),
  veranda: z.object({
    required: z.literal(true),
    min_width_feet: z.number(),
    sides: z.array(z.enum(['north', 'south', 'east', 'west'])),
  }),
  violations_if_removed: z.array(z.string()),
});

/**
 * Agent 7: Architectural Zoning Output Schema
 */
export const architecturalZoningSchema = z.object({
  zones: z.object({
    public: z.array(z.string()),
    semi_private: z.array(z.string()),
    private: z.array(z.string()),
    service: z.array(z.string()),
  }),
  adjacency_rules: z.array(
    z.object({
      room1: z.string(),
      room2: z.string(),
      relationship: z.enum(['adjacent', 'near', 'separated']),
      reason: z.string(),
    })
  ),
  circulation_logic: z.string(),
  entry_sequence: z.array(z.string()),
});

/**
 * Agent 8: Dimensioning Output Schema
 */
export const dimensioningSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      width: z.number(),
      depth: z.number(),
      area_sqft: z.number(),
      zone: z.string(),
      adjacent_to: z.array(z.string()),
    })
  ),
  courtyard: z.object({
    width: z.number(),
    depth: z.number(),
    area_sqft: z.number(),
  }),
  total_built_up_sqft: z.number(),
  carpet_area_sqft: z.number(),
  efficiency_percent: z.number(),
});

/**
 * Agent 9: Engineering Plan Output Schema
 */
export const engineeringPlanSchema = z.object({
  wall_system: z.object({
    external_thickness_inches: z.number(),
    internal_thickness_inches: z.number(),
    material: z.string(),
    load_bearing_walls: z.array(z.string()),
  }),
  staircase: z.object({
    type: z.enum(['straight', 'l-shaped', 'u-shaped', 'spiral']),
    position: z.string(),
    width_feet: z.number(),
    riser_height_inches: z.number(),
    tread_width_inches: z.number(),
  }),
  plumbing_strategy: z.object({
    wet_areas_grouped: z.boolean(),
    shaft_positions: z.array(z.string()),
    sewer_connection: z.enum(['north', 'south', 'east', 'west']),
  }),
  ventilation_shafts: z.array(
    z.object({
      position: z.string(),
      serves_rooms: z.array(z.string()),
    })
  ),
  expansion_provision: z.object({
    direction: z.enum(['north', 'south', 'east', 'west']),
    type: z.enum(['vertical', 'horizontal']),
    notes: z.string(),
  }),
});

/**
 * Agent 10: Design Validation Output Schema
 */
export const designValidationSchema = z.object({
  status: z.enum(['PASS', 'FAIL', 'PASS_WITH_WARNINGS']),
  issues: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['error', 'warning', 'info']),
      category: z.enum(['regulation', 'vastu', 'eco', 'structural', 'dimensional']),
      message: z.string(),
      affected_element: z.string().optional(),
      suggested_fix: z.string().optional(),
    })
  ),
  severity: z.enum(['low', 'medium', 'high']),
  compliance_checklist: z.array(
    z.object({
      item: z.string(),
      passed: z.boolean(),
      notes: z.string().optional(),
    })
  ),
});

/**
 * Agent 11: Narrative Output Schema
 */
export const narrativeSchema = z.object({
  design_rationale: z.string(),
  eco_summary: z.string(),
  vastu_summary: z.string(),
  construction_notes: z.string(),
});

/**
 * Agent 12: Visualization Output Schema
 */
export const visualizationSchema = z.object({
  courtyard_prompt: z.string(),
  exterior_prompt: z.string(),
  interior_prompt: z.string(),
  floor_plan_prompt: z.string(),
});

/**
 * Generated Image Data Schema
 */
const generatedImageDataSchema = z.object({
  base64Data: z.string(),
  mimeType: z.enum(['image/png', 'image/jpeg']),
  width: z.number().optional(),
  height: z.number().optional(),
  generatedAt: z.date().or(z.string().transform(s => new Date(s))),
});

/**
 * Agent 13: Floor Plan Image Output Schema
 */
export const floorPlanImageSchema = z.object({
  floorPlan: generatedImageDataSchema.optional(),
  courtyard: generatedImageDataSchema.optional(),
  exterior: generatedImageDataSchema.optional(),
  interior: generatedImageDataSchema.optional(),
  metadata: z.object({
    model: z.string(),
    totalImagesGenerated: z.number(),
    generationTime: z.number(),
  }),
});

// ============================================
// Schema Registry
// ============================================

const schemaRegistry: Record<AgentName, z.ZodSchema> = {
  'diagram-interpreter': diagramInterpreterSchema,
  'regulation-compliance': regulationComplianceSchema,
  'client-elicitation': clientElicitationSchema,
  'engineer-clarification': engineerClarificationSchema,
  'vastu-compliance': vastuComplianceSchema,
  'eco-design': ecoDesignSchema,
  'architectural-zoning': architecturalZoningSchema,
  'dimensioning': dimensioningSchema,
  'engineering-plan': engineeringPlanSchema,
  'design-validation': designValidationSchema,
  'narrative': narrativeSchema,
  'visualization': visualizationSchema,
  'floor-plan-image': floorPlanImageSchema,
};

/**
 * Validate data against an agent's schema
 */
export function validateSchema<T>(
  agentName: AgentName,
  data: unknown
): ValidationResult<T> {
  const schema = schemaRegistry[agentName];

  if (!schema) {
    return {
      success: false,
      errors: [{ path: 'schema', message: `No schema found for agent: ${agentName}` }],
    };
  }

  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data as T,
    };
  }

  const errors: SchemaValidationError[] = result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    expected: 'expected' in issue ? String(issue.expected) : undefined,
    received: 'received' in issue ? String(issue.received) : undefined,
  }));

  return {
    success: false,
    errors,
  };
}

/**
 * Get schema for an agent
 */
export function getSchema(agentName: AgentName): z.ZodSchema | undefined {
  return schemaRegistry[agentName];
}
