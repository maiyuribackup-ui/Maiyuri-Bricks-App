/**
 * Engineering Plan Agent (Agent 9)
 *
 * Generates detailed engineering specifications based on structural strategy,
 * room layout, and Tamil Nadu construction standards.
 *
 * Responsibilities:
 * - Define wall system (thickness, materials, load-bearing walls)
 * - Plan staircase (type, position, dimensions)
 * - Design plumbing strategy (wet area grouping, shaft positions)
 * - Position ventilation shafts
 * - Plan expansion provisions
 *
 * Guardrails:
 * - MUST follow structural strategy (load-bearing/RCC/hybrid)
 * - MUST respect Tamil Nadu NBC standards
 * - NEVER compromise on structural safety
 * - Staircase minimum 3ft width
 * - Wet areas grouped for plumbing efficiency
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DesignContext, Direction, StructuralStrategy } from '../types/design-context';
import type {
  AgentResult,
  OpenQuestion,
  Assumption,
  TokenUsage,
  AgentError,
} from '../types/agent-result';
import type {
  EngineeringPlanInput,
  EngineeringPlanOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import {
  SYSTEM_RULES,
  NBC_REQUIREMENTS,
  STRUCTURAL_RULES,
  ROOM_ADJACENCY_RULES,
  VALIDATION_RULES,
} from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface EngineeringPlanConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: EngineeringPlanConfig = {
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
  temperature: 0.15,
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Wall system standards based on structural strategy
 * Based on Tamil Nadu construction norms and NBC 2016
 */
const WALL_STANDARDS: Record<StructuralStrategy, {
  externalThickness: number;  // inches
  internalThickness: number;  // inches
  material: string;
  description: string;
}> = {
  'load-bearing': {
    externalThickness: 9,
    internalThickness: 4.5,
    material: 'Burnt clay brick masonry with cement mortar 1:6',
    description: 'Traditional load-bearing construction with 9" external walls',
  },
  'rcc': {
    externalThickness: 4.5,
    internalThickness: 4.5,
    material: 'RCC frame with AAC block infill',
    description: 'RCC frame structure with 4.5" partition walls',
  },
  'hybrid': {
    externalThickness: 9,
    internalThickness: 4.5,
    material: 'Brick masonry external, AAC internal with RCC columns at corners',
    description: 'Hybrid with load-bearing external and RCC columns',
  },
};

/**
 * Staircase standards per NBC 2016
 */
const STAIRCASE_STANDARDS = {
  minWidth: 3,         // feet
  maxWidth: 4,         // feet
  minRiser: 6,         // inches (150mm)
  maxRiser: 7.5,       // inches (190mm)
  minTread: 10,        // inches (250mm)
  maxTread: 12,        // inches (300mm)
  headroom: 7.5,       // feet minimum
  landingDepth: 3,     // feet minimum
};

/**
 * Pre-calculate wall system based on structural strategy
 */
function calculateWallSystem(
  strategy: StructuralStrategy,
  rooms: EngineeringPlanInput['rooms'],
  maxFloors: number
): {
  externalThickness: number;
  internalThickness: number;
  material: string;
  loadBearingWalls: string[];
} {
  const standards = WALL_STANDARDS[strategy];

  // Identify load-bearing walls based on strategy
  let loadBearingWalls: string[] = [];

  if (strategy === 'load-bearing') {
    // All external walls are load-bearing
    loadBearingWalls = ['north-external', 'south-external', 'east-external', 'west-external'];

    // Internal walls between major rooms are also load-bearing
    const majorRooms = rooms.filter(r =>
      ['living', 'master-bedroom', 'bedroom', 'dining'].includes(r.type)
    );
    if (majorRooms.length > 1) {
      loadBearingWalls.push('living-bedroom-partition');
    }
    if (maxFloors > 1) {
      loadBearingWalls.push('staircase-wall');
    }
  } else if (strategy === 'rcc') {
    // No load-bearing walls, only RCC columns
    loadBearingWalls = []; // All loads carried by RCC frame
  } else if (strategy === 'hybrid') {
    // External walls are load-bearing, internal are partitions
    loadBearingWalls = ['north-external', 'south-external', 'east-external', 'west-external'];
  }

  return {
    externalThickness: standards.externalThickness,
    internalThickness: standards.internalThickness,
    material: standards.material,
    loadBearingWalls,
  };
}

/**
 * Pre-calculate staircase dimensions
 */
function calculateStaircaseDimensions(
  maxFloors: number,
  floorHeight: number = 10 // feet (3m typical)
): {
  width: number;
  riserHeight: number;
  treadWidth: number;
  numSteps: number;
  landingRequired: boolean;
} {
  if (maxFloors <= 1) {
    // No staircase needed for single floor
    return {
      width: 0,
      riserHeight: 0,
      treadWidth: 0,
      numSteps: 0,
      landingRequired: false,
    };
  }

  // Calculate number of steps
  const riserHeight = 7; // inches (standard)
  const floorHeightInches = floorHeight * 12;
  const numSteps = Math.ceil(floorHeightInches / riserHeight);

  // Landing required if more than 12 steps continuous
  const landingRequired = numSteps > 12;

  return {
    width: 3.5, // feet (standard residential)
    riserHeight,
    treadWidth: 10, // inches (standard)
    numSteps,
    landingRequired,
  };
}

/**
 * Identify wet areas for plumbing grouping
 */
function identifyWetAreas(rooms: EngineeringPlanInput['rooms']): string[] {
  const wetAreaTypes = [
    'attached-bathroom',
    'common-bathroom',
    'kitchen',
    'utility',
    'wash',
  ];

  return rooms
    .filter(r => wetAreaTypes.includes(r.type))
    .map(r => r.id);
}

/**
 * Check if wet areas are grouped
 */
function areWetAreasGrouped(
  rooms: EngineeringPlanInput['rooms'],
  wetAreas: string[]
): boolean {
  if (wetAreas.length <= 1) return true;

  // Check if wet areas share adjacencies
  const wetRooms = rooms.filter(r => wetAreas.includes(r.id));

  // Simple heuristic: if any wet area is adjacent to another, consider grouped
  for (const room of wetRooms) {
    if (room.adjacentTo?.some(adj => wetAreas.includes(adj))) {
      return true;
    }
  }

  return false;
}

/**
 * Identify rooms needing ventilation shafts
 */
function identifyVentilationNeeds(rooms: EngineeringPlanInput['rooms']): string[] {
  // Rooms that require mechanical/shaft ventilation if no external wall
  const needsVentilation = [
    'kitchen',
    'attached-bathroom',
    'common-bathroom',
    'utility',
    'store',
  ];

  return rooms
    .filter(r => needsVentilation.includes(r.type))
    .map(r => r.id);
}

/**
 * Engineering Plan Agent
 *
 * Generates engineering specifications for the floor plan.
 */
export class EngineeringPlanAgent {
  readonly agentName = 'engineering-plan' as const;
  private config: EngineeringPlanConfig;
  private genAI: GoogleGenerativeAI;

  constructor(config: Partial<EngineeringPlanConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      logger.warn('Google AI API key not found');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Execute the engineering plan agent
   */
  async execute(
    input: EngineeringPlanInput,
    context: DesignContext
  ): Promise<AgentResult<EngineeringPlanOutput>> {
    const startTime = Date.now();

    logger.info('Starting agent execution', { agent: this.agentName });

    try {
      // Step 1: Validate input
      const validationError = this.validateInput(input);
      if (validationError) {
        throw new Error(validationError);
      }

      // Step 2: Pre-calculate deterministic values
      const preCalculated = this.preCalculate(input);

      // Step 3: Build prompt with pre-calculated context
      const prompt = this.buildPrompt(input, context, preCalculated);

      // Step 4: Call Gemini with retry
      const response = await this.callGemini(prompt);

      // Step 5: Parse and validate response
      const output = this.parseResponse(response, input, preCalculated);

      // Step 6: Extract assumptions and open questions
      const { assumptions, openQuestions } = this.extractQuestionsAndAssumptions(
        input,
        output,
        preCalculated
      );

      const executionTimeMs = Date.now() - startTime;

      logger.info('Agent execution complete', {
        agent: this.agentName,
        executionTimeMs,
        openQuestionsCount: openQuestions.length,
      });

      return {
        success: true,
        agentName: this.agentName,
        data: output,
        assumptions,
        openQuestions,
        tokensUsed: this.estimateTokens(prompt, response),
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const agentError = this.createError(error);

      logger.error('Agent execution failed', {
        agent: this.agentName,
        errorMessage: agentError.message,
        errorDetails: agentError.details,
      });

      return {
        success: false,
        agentName: this.agentName,
        error: agentError,
        assumptions: [],
        openQuestions: [],
        tokensUsed: { input: 0, output: 0, total: 0 },
        executionTimeMs,
      };
    }
  }

  /**
   * Validate input
   */
  private validateInput(input: EngineeringPlanInput): string | null {
    if (!input.rooms || input.rooms.length === 0) {
      return 'Rooms are required for engineering plan';
    }

    if (!input.structuralStrategy) {
      return 'Structural strategy is required for engineering plan';
    }

    const validStrategies: StructuralStrategy[] = ['load-bearing', 'rcc', 'hybrid'];
    if (!validStrategies.includes(input.structuralStrategy)) {
      return `Invalid structural strategy: ${input.structuralStrategy}. Must be one of: ${validStrategies.join(', ')}`;
    }

    if (!input.buildableEnvelope) {
      return 'Buildable envelope is required for engineering plan';
    }

    if (input.buildableEnvelope.width <= 0) {
      return 'Buildable envelope width must be positive';
    }

    if (input.buildableEnvelope.depth <= 0) {
      return 'Buildable envelope depth must be positive';
    }

    if (input.buildableEnvelope.maxFloors <= 0) {
      return 'Max floors must be positive';
    }

    return null;
  }

  /**
   * Pre-calculate deterministic engineering values
   */
  private preCalculate(input: EngineeringPlanInput): {
    wallSystem: ReturnType<typeof calculateWallSystem>;
    staircase: ReturnType<typeof calculateStaircaseDimensions>;
    wetAreas: string[];
    wetAreasGrouped: boolean;
    ventilationNeeds: string[];
  } {
    const wallSystem = calculateWallSystem(
      input.structuralStrategy,
      input.rooms,
      input.buildableEnvelope.maxFloors
    );

    const staircase = calculateStaircaseDimensions(
      input.buildableEnvelope.maxFloors
    );

    const wetAreas = identifyWetAreas(input.rooms);
    const wetAreasGrouped = areWetAreasGrouped(input.rooms, wetAreas);
    const ventilationNeeds = identifyVentilationNeeds(input.rooms);

    return {
      wallSystem,
      staircase,
      wetAreas,
      wetAreasGrouped,
      ventilationNeeds,
    };
  }

  /**
   * Build the prompt for Gemini
   */
  private buildPrompt(
    input: EngineeringPlanInput,
    context: DesignContext,
    preCalculated: ReturnType<typeof EngineeringPlanAgent.prototype.preCalculate>
  ): string {
    const roomsList = input.rooms
      .map(r => `- ${r.id}: ${r.name} (${r.type}) - ${r.width}x${r.depth}ft, zone: ${r.zone}`)
      .join('\n');

    const wetAreasList = preCalculated.wetAreas.join(', ');
    const ventilationList = preCalculated.ventilationNeeds.join(', ');

    return `${SYSTEM_RULES}

${NBC_REQUIREMENTS}

${STRUCTURAL_RULES}

${ROOM_ADJACENCY_RULES}

## Engineering Plan Agent

You are generating engineering specifications for a ${input.buildableEnvelope.maxFloors}-floor residential building in Tamil Nadu.

### CRITICAL ENGINEERING RULES (from Indian Building Code)

**Staircase Requirements (NBC 2016):**
- Tread depth: MINIMUM 250mm (10 inches)
- Riser height: MAXIMUM 190mm (7.5 inches)
- Width: MINIMUM 900mm (3 feet), 1000mm recommended
- Max risers per flight: 15 steps
- Handrail: 1000-1200mm height, both sides

**Vastu Staircase Rules:**
- MUST turn CLOCKWISE when ascending
- Steps count: ALWAYS ODD number (9, 11, 15, 21)
- Position: South, West, Southwest, Northwest preferred
- AVOID: Northeast, Center (Brahmasthan)

**Load-Bearing Wall Rules:**
- External walls: 9 inches (230mm) typical
- Internal walls: 4.5 inches (115mm) partitions
- NEVER breach load-bearing walls without structural engineer approval
- Plumbing must NOT cut completely through load-bearing walls

### Structural Strategy: ${input.structuralStrategy.toUpperCase()}

**Pre-calculated Wall System:**
- External wall thickness: ${preCalculated.wallSystem.externalThickness} inches
- Internal wall thickness: ${preCalculated.wallSystem.internalThickness} inches
- Material: ${preCalculated.wallSystem.material}
- Load-bearing walls: ${preCalculated.wallSystem.loadBearingWalls.join(', ') || 'None (RCC frame)'}

### Building Envelope
- Width: ${input.buildableEnvelope.width} feet
- Depth: ${input.buildableEnvelope.depth} feet
- Max Floors: ${input.buildableEnvelope.maxFloors}

### Rooms Layout
${roomsList}

### Wet Areas Analysis
- Wet areas: ${wetAreasList || 'None identified'}
- Currently grouped: ${preCalculated.wetAreasGrouped ? 'Yes' : 'No'}

### Ventilation Needs
Rooms requiring ventilation shafts: ${ventilationList || 'None'}

${input.buildableEnvelope.maxFloors > 1 ? `
### Pre-calculated Staircase
- Width: ${preCalculated.staircase.width} feet
- Riser height: ${preCalculated.staircase.riserHeight} inches
- Tread width: ${preCalculated.staircase.treadWidth} inches
- Number of steps: ${preCalculated.staircase.numSteps}
- Landing required: ${preCalculated.staircase.landingRequired ? 'Yes' : 'No'}
` : '### Staircase\nNot required for single-floor building.'}

## Task

Analyze the room layout and provide engineering specifications:

1. **Staircase Position** (if multi-floor):
   - Recommend optimal position based on room layout
   - Choose type: straight, l-shaped, u-shaped, or spiral
   - Consider access from living areas and bedrooms

2. **Plumbing Strategy**:
   - Recommend shaft positions for optimal plumbing routes
   - Suggest sewer connection direction based on typical road positions

3. **Ventilation Shafts**:
   - Position ventilation shafts to serve rooms without external windows
   - Group shafts to minimize structural impact

4. **Expansion Provision**:
   - Recommend direction for future expansion (vertical or horizontal)
   - Consider structural feasibility and plot constraints

## Output Format

Respond with ONLY valid JSON:

{
  "wall_system": {
    "external_thickness_inches": ${preCalculated.wallSystem.externalThickness},
    "internal_thickness_inches": ${preCalculated.wallSystem.internalThickness},
    "material": "${preCalculated.wallSystem.material}",
    "load_bearing_walls": ${JSON.stringify(preCalculated.wallSystem.loadBearingWalls)}
  },
  "staircase": {
    "type": "straight|l-shaped|u-shaped|spiral",
    "position": "description of position relative to rooms",
    "width_feet": ${preCalculated.staircase.width || 3.5},
    "riser_height_inches": ${preCalculated.staircase.riserHeight || 7},
    "tread_width_inches": ${preCalculated.staircase.treadWidth || 10}
  },
  "plumbing_strategy": {
    "wet_areas_grouped": true|false,
    "shaft_positions": ["position1", "position2"],
    "sewer_connection": "north|south|east|west"
  },
  "ventilation_shafts": [
    {
      "position": "description",
      "serves_rooms": ["room_id1", "room_id2"]
    }
  ],
  "expansion_provision": {
    "direction": "north|south|east|west",
    "type": "vertical|horizontal",
    "notes": "explanation"
  }
}

## Rules

1. Wall system is PRE-CALCULATED - use the exact values provided
2. Staircase should be accessible from common areas
3. Wet areas should share a common plumbing shaft when possible
4. Sewer connection typically from south or west (road-facing)
5. Vertical expansion requires RCC or hybrid structure
6. Consider future floor addition for ${input.structuralStrategy} structure`;
  }

  /**
   * Call Gemini API with retry
   */
  private async callGemini(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
    });

    const result = await retryWithBackoff(
      async () => {
        const response = await model.generateContent(prompt);
        const text = response.response.text();
        if (!text) {
          throw new Error('Empty response from Gemini');
        }
        return text;
      },
      this.config.retryConfig
    );

    return result;
  }

  /**
   * Parse and validate the response
   */
  private parseResponse(
    response: string,
    input: EngineeringPlanInput,
    preCalculated: ReturnType<typeof EngineeringPlanAgent.prototype.preCalculate>
  ): EngineeringPlanOutput {
    // Extract JSON from response
    let jsonStr = response;

    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let output: EngineeringPlanOutput;

    try {
      output = JSON.parse(jsonStr);
    } catch (parseError) {
      throw new Error(`Failed to parse engineering plan response: ${(parseError as Error).message}`);
    }

    // Merge with pre-calculated values to ensure correctness
    return this.mergeWithPreCalculated(output, input, preCalculated);
  }

  /**
   * Merge LLM output with pre-calculated values
   */
  private mergeWithPreCalculated(
    output: Partial<EngineeringPlanOutput>,
    input: EngineeringPlanInput,
    preCalculated: ReturnType<typeof EngineeringPlanAgent.prototype.preCalculate>
  ): EngineeringPlanOutput {
    // Wall system is always from pre-calculation
    const wallSystem = {
      external_thickness_inches: preCalculated.wallSystem.externalThickness,
      internal_thickness_inches: preCalculated.wallSystem.internalThickness,
      material: preCalculated.wallSystem.material,
      load_bearing_walls: preCalculated.wallSystem.loadBearingWalls,
    };

    // Staircase - merge LLM recommendations with pre-calculated dimensions
    const staircase = input.buildableEnvelope.maxFloors > 1
      ? {
          type: this.validateStaircaseType(output.staircase?.type) || 'straight',
          position: output.staircase?.position || 'Near living room entrance',
          width_feet: preCalculated.staircase.width,
          riser_height_inches: preCalculated.staircase.riserHeight,
          tread_width_inches: preCalculated.staircase.treadWidth,
        }
      : {
          type: 'straight' as const,
          position: 'Not applicable - single floor',
          width_feet: 0,
          riser_height_inches: 0,
          tread_width_inches: 0,
        };

    // Plumbing strategy
    const plumbingStrategy = {
      wet_areas_grouped: preCalculated.wetAreasGrouped,
      shaft_positions: output.plumbing_strategy?.shaft_positions || this.defaultShaftPositions(input),
      sewer_connection: this.validateDirection(output.plumbing_strategy?.sewer_connection) || 'south',
    };

    // Ventilation shafts
    const ventilationShafts = output.ventilation_shafts?.length
      ? output.ventilation_shafts.map(shaft => ({
          position: shaft.position || 'Central shaft',
          serves_rooms: shaft.serves_rooms || [],
        }))
      : this.defaultVentilationShafts(preCalculated.ventilationNeeds);

    // Expansion provision
    const expansionProvision = {
      direction: this.validateDirection(output.expansion_provision?.direction) || 'south',
      type: this.validateExpansionType(output.expansion_provision?.type, input.structuralStrategy),
      notes: output.expansion_provision?.notes || this.defaultExpansionNotes(input.structuralStrategy),
    };

    return {
      wall_system: wallSystem,
      staircase,
      plumbing_strategy: plumbingStrategy,
      ventilation_shafts: ventilationShafts,
      expansion_provision: expansionProvision,
    };
  }

  /**
   * Validate staircase type
   */
  private validateStaircaseType(
    type: string | undefined
  ): 'straight' | 'l-shaped' | 'u-shaped' | 'spiral' | undefined {
    const validTypes = ['straight', 'l-shaped', 'u-shaped', 'spiral'];
    if (type && validTypes.includes(type)) {
      return type as 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';
    }
    return undefined;
  }

  /**
   * Validate direction
   */
  private validateDirection(dir: string | undefined): Direction | undefined {
    const validDirs: Direction[] = ['north', 'south', 'east', 'west'];
    if (dir && validDirs.includes(dir as Direction)) {
      return dir as Direction;
    }
    return undefined;
  }

  /**
   * Validate expansion type based on structural strategy
   */
  private validateExpansionType(
    type: string | undefined,
    strategy: StructuralStrategy
  ): 'vertical' | 'horizontal' {
    // Load-bearing cannot easily expand vertically
    if (strategy === 'load-bearing') {
      return 'horizontal';
    }

    if (type === 'vertical' || type === 'horizontal') {
      return type;
    }

    // Default to vertical for RCC and hybrid
    return strategy === 'rcc' ? 'vertical' : 'horizontal';
  }

  /**
   * Generate default shaft positions
   */
  private defaultShaftPositions(input: EngineeringPlanInput): string[] {
    const wetAreas = identifyWetAreas(input.rooms);
    if (wetAreas.length === 0) return [];

    // Group by zone
    const kitchenArea = wetAreas.find(id =>
      input.rooms.find(r => r.id === id && r.type === 'kitchen')
    );
    const bathroomAreas = wetAreas.filter(id =>
      input.rooms.find(r => r.id === id && r.type.includes('bathroom'))
    );

    const positions: string[] = [];
    if (kitchenArea) {
      positions.push('Kitchen shaft - adjacent to kitchen');
    }
    if (bathroomAreas.length > 0) {
      positions.push('Bathroom shaft - between bathrooms');
    }

    return positions.length > 0 ? positions : ['Central service shaft'];
  }

  /**
   * Generate default ventilation shafts
   */
  private defaultVentilationShafts(
    ventilationNeeds: string[]
  ): Array<{ position: string; serves_rooms: string[] }> {
    if (ventilationNeeds.length === 0) {
      return [{
        position: 'Not required - all rooms have external ventilation',
        serves_rooms: [],
      }];
    }

    // Group by type
    const kitchenRooms = ventilationNeeds.filter(id => id.includes('kitchen'));
    const bathroomRooms = ventilationNeeds.filter(id => id.includes('bathroom'));
    const otherRooms = ventilationNeeds.filter(id =>
      !id.includes('kitchen') && !id.includes('bathroom')
    );

    const shafts: Array<{ position: string; serves_rooms: string[] }> = [];

    if (kitchenRooms.length > 0) {
      shafts.push({
        position: 'Kitchen exhaust shaft - 300x300mm',
        serves_rooms: kitchenRooms,
      });
    }

    if (bathroomRooms.length > 0) {
      shafts.push({
        position: 'Bathroom ventilation shaft - 200x200mm',
        serves_rooms: bathroomRooms,
      });
    }

    if (otherRooms.length > 0) {
      shafts.push({
        position: 'Utility ventilation shaft - 200x200mm',
        serves_rooms: otherRooms,
      });
    }

    return shafts;
  }

  /**
   * Generate default expansion notes
   */
  private defaultExpansionNotes(strategy: StructuralStrategy): string {
    switch (strategy) {
      case 'load-bearing':
        return 'Horizontal expansion recommended. Vertical expansion would require structural reinforcement of existing walls.';
      case 'rcc':
        return 'Vertical expansion supported. RCC columns designed for additional floors as per structural calculation.';
      case 'hybrid':
        return 'Limited vertical expansion possible. Consult structural engineer before adding floors.';
    }
  }

  /**
   * Extract assumptions and open questions
   */
  private extractQuestionsAndAssumptions(
    input: EngineeringPlanInput,
    output: EngineeringPlanOutput,
    preCalculated: ReturnType<typeof EngineeringPlanAgent.prototype.preCalculate>
  ): { assumptions: Assumption[]; openQuestions: OpenQuestion[] } {
    const assumptions: Assumption[] = [];
    const openQuestions: OpenQuestion[] = [];

    // Assumption: Structural strategy
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'structural_strategy',
      assumption: `Using ${input.structuralStrategy} structural system with ${preCalculated.wallSystem.externalThickness}" external walls`,
      risk: 'low',
      basis: 'Selected structural strategy from engineer clarification agent',
    });

    // Assumption: Soil bearing capacity
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'soil_capacity',
      assumption: 'Soil bearing capacity assumed to be 10 tonnes/sqm (safe bearing capacity for most Tamil Nadu soils)',
      risk: 'medium',
      basis: 'Standard assumption - requires soil test confirmation',
    });

    // Open question if no soil test
    openQuestions.push({
      agentSource: this.agentName,
      questionId: 'soil_test',
      question: 'Has soil testing been conducted at the site?',
      type: 'optional',
      reason: 'Soil test results would confirm foundation design assumptions',
    });

    // Multi-floor specific
    if (input.buildableEnvelope.maxFloors > 1) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'floor_height',
        assumption: 'Floor-to-floor height assumed to be 10 feet (3 meters)',
        risk: 'low',
        basis: 'Standard residential floor height per NBC 2016',
      });

      openQuestions.push({
        agentSource: this.agentName,
        questionId: 'staircase_position',
        question: `Is the proposed staircase position (${output.staircase.position}) acceptable?`,
        type: 'optional',
        reason: 'Staircase position affects circulation and room privacy',
      });
    }

    // Plumbing
    if (!preCalculated.wetAreasGrouped) {
      openQuestions.push({
        agentSource: this.agentName,
        questionId: 'plumbing_cost',
        question: 'Wet areas are not grouped. Accept increased plumbing cost for current layout?',
        type: 'mandatory',
        reason: 'Separated wet areas increase plumbing runs and cost by 20-30%',
      });
    }

    // Expansion
    if (input.structuralStrategy === 'load-bearing' && input.buildableEnvelope.maxFloors === 1) {
      openQuestions.push({
        agentSource: this.agentName,
        questionId: 'future_floors',
        question: 'Are additional floors planned in future? Current load-bearing design limits vertical expansion.',
        type: 'optional',
        reason: 'Changing to RCC frame now would allow easier future vertical expansion',
      });
    }

    return { assumptions, openQuestions };
  }

  /**
   * Estimate token usage
   */
  private estimateTokens(prompt: string, response: string): TokenUsage {
    // Rough estimation: ~4 chars per token
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    };
  }

  /**
   * Create error object
   */
  private createError(error: unknown): AgentError {
    if (error instanceof Error) {
      return {
        code: 'ENGINEERING_PLAN_ERROR',
        message: error.message,
        retryable: true,
        details: { stack: error.stack },
      };
    }

    return {
      code: 'ENGINEERING_PLAN_ERROR',
      message: String(error),
      retryable: true,
    };
  }
}

/**
 * Factory function to create EngineeringPlanAgent
 */
export function createEngineeringPlanAgent(
  config?: Partial<EngineeringPlanConfig>
): EngineeringPlanAgent {
  return new EngineeringPlanAgent(config);
}
