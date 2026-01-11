/**
 * Test Fixture: Survey No. 63 Plot Data
 *
 * Based on handwritten plot survey with the following specifications:
 * - Plot is irregular (trapezoidal)
 * - East side: 41'-0" (circled - likely front facing/road access point)
 * - West side: 43'-0"
 * - North side: 29'-0"
 * - South side: 27'-6"
 *
 * Setbacks:
 * - North: 2'-0"
 * - West: 2'-0"
 * - South: 3'-0"
 * - East: 3'-6"
 *
 * Road Access: West side (20'-0" road width)
 *
 * Required Rooms:
 * 1. Living Room
 * 2. Dining
 * 3. Kitchen
 * 4. Double Bedroom
 * 5. Dress Room
 * 6. Common Toilet
 * 7. Staircase
 * 8. Verandah
 */

import type { Direction } from '../../types/design-context';
import type {
  DiagramInterpreterInput,
  DiagramInterpreterOutput,
  VastuComplianceInput,
  VastuComplianceOutput,
  RegulationComplianceInput,
  RegulationComplianceOutput,
  EcoDesignInput,
  EcoDesignOutput,
  DimensioningInput,
  DimensioningOutput,
} from '../../types/contracts';

// ==================================================
// RAW PLOT DATA FROM SURVEY IMAGE
// ==================================================

export const SURVEY_NO_63_RAW = {
  surveyNumber: 63,
  location: 'Tamil Nadu', // Inferred from Vastu context

  // Plot dimensions (irregular/trapezoidal)
  dimensions: {
    north: { feet: 29, inches: 0, totalFeet: 29 },
    south: { feet: 27, inches: 6, totalFeet: 27.5 },
    east: { feet: 41, inches: 0, totalFeet: 41 },
    west: { feet: 43, inches: 0, totalFeet: 43 },
  },

  // For calculation purposes, use average dimensions
  averageWidth: (29 + 27.5) / 2, // ~28.25 feet (N-S average)
  averageDepth: (41 + 43) / 2, // ~42 feet (E-W average)

  // Setbacks
  setbacks: {
    north: { feet: 2, inches: 0, totalFeet: 2 },
    south: { feet: 3, inches: 0, totalFeet: 3 },
    east: { feet: 3, inches: 6, totalFeet: 3.5 },
    west: { feet: 2, inches: 0, totalFeet: 2 },
  },

  // Road access
  road: {
    side: 'west' as Direction,
    width: { feet: 20, inches: 0, totalFeet: 20 },
  },

  // Key plan dimensions
  keyPlan: {
    plotWidth: { feet: 24, inches: 0, totalFeet: 24 },
    plotDepth: { feet: 27, inches: 6, totalFeet: 27.5 },
    adjacentRoad: { feet: 27, inches: 6, totalFeet: 27.5 },
    adjacentPlotEast: { feet: 41, inches: 0, totalFeet: 41 },
    roadWidth: { feet: 20, inches: 0, totalFeet: 20 },
  },
};

// ==================================================
// REQUIRED ROOMS FROM SURVEY
// ==================================================

export const REQUIRED_ROOMS = [
  { name: 'Living Room', type: 'living', required: true },
  { name: 'Dining', type: 'dining', required: true },
  { name: 'Kitchen', type: 'kitchen', required: true },
  { name: 'Double Bedroom', type: 'bedroom', required: true, count: 1 },
  { name: 'Dress Room', type: 'dressing', required: true },
  { name: 'Common Toilet', type: 'toilet', required: true },
  { name: 'Staircase', type: 'staircase', required: true },
  { name: 'Verandah', type: 'veranda', required: true },
];

// ==================================================
// DIAGRAM INTERPRETER INPUT
// ==================================================

export const DIAGRAM_INPUT: DiagramInterpreterInput = {
  // In real usage, this would be base64 encoded image
  imageBase64: undefined,
  imageUrl: undefined,
  mimeType: 'image/jpeg',
};

// Expected output from diagram interpreter
export const EXPECTED_DIAGRAM_OUTPUT: DiagramInterpreterOutput = {
  plot: {
    width: 28.25, // Average of North (29) and South (27.5)
    depth: 42, // Average of East (41) and West (43)
    area: 1186.5, // 28.25 * 42
    unit: 'feet',
  },
  setbacks: {
    front: 2, // West (road side)
    rear: 3.5, // East (opposite road)
    left: 3, // South
    right: 2, // North
  },
  road: {
    side: 'west',
    width: 20,
  },
  orientation: 'west', // Based on road access
  annotations: [
    'Survey No. 63',
    'Irregular plot (trapezoidal)',
    'West-facing with 20ft road',
    'Required: Living, Dining, Kitchen, Bedroom, Dress, Toilet, Staircase, Verandah',
  ],
  confidence: 0.85,
  open_questions: [
    {
      id: 'plot_shape_confirm',
      question: 'Is the plot shape confirmed as trapezoidal (north side wider than south)?',
      type: 'optional',
      reason: 'Irregular plots may require adjusted calculations',
    },
  ],
};

// ==================================================
// REGULATION COMPLIANCE INPUT
// ==================================================

export const REGULATION_INPUT: RegulationComplianceInput = {
  plot: {
    width: 28.25,
    depth: 42,
    area: 1186.5,
  },
  setbacks: {
    front: 2, // West
    rear: 3.5, // East
    left: 3, // South
    right: 2, // North
  },
  cityAuthority: 'DTCP Tamil Nadu',
  plotType: 'residential',
};

// Expected output from regulation compliance
export const EXPECTED_REGULATION_OUTPUT: RegulationComplianceOutput = {
  buildable_envelope: {
    width: 23.25, // 28.25 - 2 (west) - 3 (south avg)
    depth: 36.5, // 42 - 2 (north) - 3.5 (east)
    area: 848.6, // 23.25 * 36.5
    maxHeight: 10, // Ground + First floor typical
    maxFloors: 2,
    fsi: 1.5, // Tamil Nadu residential FSI
  },
  constraints: [
    'Front setback (West): 2 feet minimum',
    'Rear setback (East): 3.5 feet minimum',
    'Side setbacks: 2-3 feet minimum',
    'Maximum height: 10 meters (G+1)',
    'FSI: 1.5 for residential plots under 1500 sqft',
  ],
  violations: [],
  assumptions: [
    {
      assumption: 'Plot is zoned for residential construction',
      risk: 'low',
    },
    {
      assumption: 'No heritage or conservation restrictions apply',
      risk: 'low',
    },
  ],
  open_questions: [],
};

// ==================================================
// VASTU COMPLIANCE INPUT
// ==================================================

export const VASTU_INPUT: VastuComplianceInput = {
  orientation: 'west', // West-facing plot (road on west)
  buildableEnvelope: {
    width: 23.25,
    depth: 36.5,
    area: 848.6,
  },
  requirements: {
    bedrooms: 1, // Double bedroom
    hasPooja: false, // Not mentioned in requirements
  },
};

// Expected output from Vastu compliance for west-facing plot
export const EXPECTED_VASTU_OUTPUT: VastuComplianceOutput = {
  recommended_zones: {
    northeast: ['water-element', 'meditation', 'open-space'],
    east: ['living', 'study'],
    southeast: ['kitchen'],
    south: ['staircase', 'storage'],
    southwest: ['master-bedroom', 'dressing'],
    west: ['main-entrance', 'veranda', 'dining'],
    northwest: ['toilet', 'utility'],
    north: ['living', 'treasury'],
    center: ['courtyard', 'open-space'],
  },
  conflicts: [
    {
      conflict: 'West-facing plot - main entrance in West',
      severity: 'minor',
      resolution: 'West entrance acceptable; ensure good ventilation to counter afternoon heat',
    },
  ],
  acceptable_deviations: [
    {
      deviation: 'Main entrance on West instead of East/North',
      reason: 'Road access is on West side - practical necessity',
      acceptable: true,
    },
  ],
  open_questions: [],
};

// ==================================================
// ECO-DESIGN INPUT
// ==================================================

export const ECO_INPUT: EcoDesignInput = {
  plot: {
    width: 23.25,
    depth: 36.5,
  },
  orientation: 'west',
  climateZone: 'hot-humid', // Tamil Nadu coastal/plains
};

// Expected eco-design output
export const EXPECTED_ECO_OUTPUT: EcoDesignOutput = {
  mandatory_elements: [
    'courtyard',
    'cross_ventilation',
    'veranda',
    'rainwater_harvesting',
    'west_wall_protection',
  ],
  energy_strategy: {
    passive_cooling: true,
    cross_ventilation: true,
    west_wall_minimized: true, // Critical for west-facing plot
    natural_lighting: true,
  },
  water_strategy: {
    rainwater_harvesting: true,
    greywater_recycling: false,
    sump_capacity_liters: 5000,
  },
  material_preferences: [
    {
      material: 'Red clay bricks',
      reason: 'Local availability, thermal mass, eco-friendly',
      carbon_impact: 'low',
    },
    {
      material: 'Mangalore tiles',
      reason: 'Traditional roofing, good insulation',
      carbon_impact: 'low',
    },
    {
      material: 'Lime mortar',
      reason: 'Breathable walls, lower carbon than cement',
      carbon_impact: 'low',
    },
  ],
  courtyard: {
    required: true,
    min_area_sqft: 80, // ~10% of buildable area
    position: 'central',
  },
  veranda: {
    required: true,
    min_width_feet: 4,
    sides: ['west', 'south'], // Protect from afternoon sun
  },
  violations_if_removed: [
    'Removing courtyard violates eco-design principles - natural ventilation compromised',
    'West veranda mandatory for west-facing plot - heat protection required',
  ],
};

// ==================================================
// DIMENSIONING INPUT
// ==================================================

export const DIMENSIONING_INPUT: DimensioningInput = {
  zoning: {
    public: ['living', 'dining', 'veranda'],
    semiPrivate: ['kitchen', 'dressing'],
    private: ['bedroom'],
    service: ['toilet', 'staircase'],
  },
  buildableEnvelope: {
    width: 23.25,
    depth: 36.5,
    area: 848.6,
  },
  requirements: {
    bedrooms: 1,
    bathrooms: 1,
  },
};

// Expected dimensioning output based on requirements
export const EXPECTED_DIMENSIONING_OUTPUT: DimensioningOutput = {
  rooms: [
    {
      id: 'living',
      name: 'Living Room',
      type: 'living',
      width: 12,
      depth: 14,
      area_sqft: 168,
      zone: 'public',
      adjacent_to: ['dining', 'veranda', 'courtyard'],
    },
    {
      id: 'dining',
      name: 'Dining',
      type: 'dining',
      width: 10,
      depth: 10,
      area_sqft: 100,
      zone: 'public',
      adjacent_to: ['living', 'kitchen'],
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      type: 'kitchen',
      width: 10,
      depth: 9,
      area_sqft: 90,
      zone: 'semi_private',
      adjacent_to: ['dining'],
    },
    {
      id: 'bedroom',
      name: 'Double Bedroom',
      type: 'bedroom',
      width: 12,
      depth: 14,
      area_sqft: 168,
      zone: 'private',
      adjacent_to: ['dressing', 'courtyard'],
    },
    {
      id: 'dressing',
      name: 'Dress Room',
      type: 'dressing',
      width: 6,
      depth: 8,
      area_sqft: 48,
      zone: 'semi_private',
      adjacent_to: ['bedroom'],
    },
    {
      id: 'toilet',
      name: 'Common Toilet',
      type: 'toilet',
      width: 5,
      depth: 7,
      area_sqft: 35,
      zone: 'service',
      adjacent_to: ['bedroom', 'living'],
    },
    {
      id: 'staircase',
      name: 'Staircase',
      type: 'staircase',
      width: 4,
      depth: 10,
      area_sqft: 40,
      zone: 'service',
      adjacent_to: [],
    },
    {
      id: 'veranda',
      name: 'Verandah',
      type: 'veranda',
      width: 4,
      depth: 20,
      area_sqft: 80,
      zone: 'public',
      adjacent_to: ['living', 'entrance'],
    },
    {
      id: 'courtyard',
      name: 'Courtyard',
      type: 'courtyard',
      width: 8,
      depth: 10,
      area_sqft: 80,
      zone: 'public',
      adjacent_to: ['living', 'bedroom'],
    },
  ],
  courtyard: {
    width: 8,
    depth: 10,
    area_sqft: 80,
  },
  total_built_up_sqft: 809,
  carpet_area_sqft: 729,
  efficiency_percent: 90.1,
};

// ==================================================
// VASTU ZONE MAPPING FOR SURVEY 63
// ==================================================

/**
 * Maps rooms to ideal Vastu zones for west-facing plot
 */
export const VASTU_ROOM_PLACEMENT = {
  // West-facing specific placements
  'main-entrance': 'west',
  veranda: 'west',
  living: ['north', 'east'],
  dining: ['west', 'northwest'],
  kitchen: 'southeast',
  bedroom: 'southwest',
  dressing: 'southwest',
  toilet: 'northwest',
  staircase: ['south', 'southwest'],
  courtyard: 'center',
};

// ==================================================
// TEST SCENARIOS
// ==================================================

export const TEST_SCENARIOS = {
  /**
   * Happy path - all requirements met
   */
  happyPath: {
    input: VASTU_INPUT,
    expected: EXPECTED_VASTU_OUTPUT,
    description: 'Standard west-facing plot with basic requirements',
  },

  /**
   * With Pooja room requirement
   */
  withPooja: {
    input: {
      ...VASTU_INPUT,
      requirements: {
        bedrooms: 1,
        hasPooja: true,
      },
    },
    expectedZones: {
      northeast: ['pooja', 'water-element'],
    },
    description: 'West-facing plot with pooja room requirement',
  },

  /**
   * Multiple bedrooms
   */
  multipleBedrooms: {
    input: {
      ...VASTU_INPUT,
      requirements: {
        bedrooms: 2,
        hasPooja: false,
      },
    },
    expectedZones: {
      southwest: ['master-bedroom'],
      south: ['bedroom'],
    },
    description: 'West-facing plot with 2 bedrooms',
  },

  /**
   * Small plot constraint
   */
  smallPlot: {
    input: {
      ...VASTU_INPUT,
      buildableEnvelope: {
        width: 18,
        depth: 30,
        area: 540, // Under 600 sqft
      },
    },
    expectedConflicts: [
      {
        severity: 'minor',
        pattern: /small|constraint|compromise/i,
      },
    ],
    description: 'Small west-facing plot requiring compromises',
  },

  /**
   * Irregular plot handling
   */
  irregularPlot: {
    plotDimensions: SURVEY_NO_63_RAW.dimensions,
    expectedAnnotations: ['Irregular plot', 'trapezoidal'],
    description: 'Trapezoidal plot from Survey 63',
  },
};

// ==================================================
// VALIDATION HELPERS
// ==================================================

/**
 * Validates that room placements follow Vastu for west-facing plot
 */
export function validateWestFacingVastu(
  zones: VastuComplianceOutput['recommended_zones']
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Kitchen must be in Southeast (Agni)
  if (!zones.southeast.includes('kitchen')) {
    violations.push('Kitchen should be in Southeast for fire element');
  }

  // Toilet should NOT be in Northeast
  if (zones.northeast.some(z => z.includes('toilet'))) {
    violations.push('Toilet in Northeast violates Vastu');
  }

  // Master bedroom ideally in Southwest
  const hasMasterInSW = zones.southwest.some(z =>
    z.includes('bedroom') || z.includes('master')
  );
  if (!hasMasterInSW) {
    violations.push('Master bedroom recommended in Southwest');
  }

  // West entrance is acceptable for west-facing
  if (!zones.west.includes('main-entrance') && !zones.west.includes('entrance')) {
    violations.push('West-facing plot should have entrance on West');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Calculates buildable area after setbacks
 */
export function calculateBuildableArea(
  plot: { width: number; depth: number },
  setbacks: { front: number; rear: number; left: number; right: number }
): { width: number; depth: number; area: number } {
  const width = plot.width - setbacks.left - setbacks.right;
  const depth = plot.depth - setbacks.front - setbacks.rear;
  return {
    width,
    depth,
    area: width * depth,
  };
}

/**
 * Validates that eco-design requirements are met
 */
export function validateEcoRequirements(
  rooms: DimensioningOutput['rooms'],
  courtyard: DimensioningOutput['courtyard']
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  // Courtyard is mandatory
  if (!courtyard || courtyard.area_sqft < 60) {
    missing.push('Courtyard (minimum 60 sqft)');
  }

  // Veranda is mandatory
  const hasVeranda = rooms.some(r => r.type === 'veranda');
  if (!hasVeranda) {
    missing.push('Veranda for passive cooling');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
