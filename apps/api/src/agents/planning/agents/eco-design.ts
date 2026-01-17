/**
 * Eco Design Agent (Agent 6)
 *
 * Enforces non-negotiable eco-friendly design elements for
 * sustainable residential construction in Tamil Nadu.
 *
 * Responsibilities:
 * - Mandate courtyard (Mutram) and veranda
 * - Ensure cross-ventilation and passive cooling
 * - Minimize west wall exposure
 * - Require rainwater harvesting provisions
 * - Recommend sustainable materials
 *
 * Guardrails:
 * - Eco elements are NON-NEGOTIABLE (can adapt but not remove)
 * - ALWAYS document violations if elements cannot be implemented
 * - ALWAYS propose alternatives that maintain eco-principles
 * - Prioritize: Buildability > Regulations > Eco > Vastu
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DesignContext, Direction } from '../types/design-context';
import type {
  AgentResult,
  OpenQuestion,
  Assumption,
  TokenUsage,
  AgentError,
} from '../types/agent-result';
import type {
  EcoDesignInput,
  EcoDesignOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES, ECO_DESIGN_RULES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface EcoDesignConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: EcoDesignConfig = {
  model: 'gemini-3-pro-preview',
  maxTokens: 4096,
  temperature: 0.1, // Very low temperature for consistent eco constraints
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Tamil Nadu climate zone data
 */
const TN_CLIMATE_ZONES: Record<string, {
  rainfall_mm: number;
  temp_max_c: number;
  temp_min_c: number;
  humidity: 'high' | 'moderate' | 'low';
  monsoon_months: string[];
  recommendations: string[];
}> = {
  'chennai-coastal': {
    rainfall_mm: 1400,
    temp_max_c: 42,
    temp_min_c: 19,
    humidity: 'high',
    monsoon_months: ['october', 'november', 'december'],
    recommendations: [
      'High capacity rainwater harvesting for northeast monsoon',
      'Maximize cross-ventilation for humidity control',
      'East-west elongated plan for coastal breeze',
    ],
  },
  'interior-dry': {
    rainfall_mm: 900,
    temp_max_c: 44,
    temp_min_c: 18,
    humidity: 'low',
    monsoon_months: ['october', 'november'],
    recommendations: [
      'Deep courtyard for cooling',
      'Thick walls for thermal mass',
      'Large sump capacity for water storage',
    ],
  },
  'hill-station': {
    rainfall_mm: 1800,
    temp_max_c: 28,
    temp_min_c: 8,
    humidity: 'high',
    monsoon_months: ['june', 'july', 'august', 'september'],
    recommendations: [
      'Sloped roof for heavy rainfall',
      'Reduced ventilation for warmth retention',
      'Maximum rainwater collection potential',
    ],
  },
  'default': {
    rainfall_mm: 1000,
    temp_max_c: 40,
    temp_min_c: 20,
    humidity: 'moderate',
    monsoon_months: ['october', 'november'],
    recommendations: [
      'Standard cross-ventilation design',
      'Central courtyard for stack effect',
      'Rainwater harvesting mandatory',
    ],
  },
};

/**
 * Mandatory eco elements - these cannot be removed
 */
const MANDATORY_ECO_ELEMENTS = [
  'central-courtyard',
  'veranda',
  'cross-ventilation',
  'rainwater-harvesting',
  'natural-lighting',
  'west-wall-buffer',
];

/**
 * Sustainable material recommendations for Tamil Nadu
 */
const SUSTAINABLE_MATERIALS: Array<{
  material: string;
  reason: string;
  carbon_impact: 'low' | 'medium' | 'high';
  best_for: string[];
}> = [
  {
    material: 'Compressed Stabilized Earth Blocks (CSEB)',
    reason: 'Local soil, minimal cement, excellent thermal mass',
    carbon_impact: 'low',
    best_for: ['walls', 'compound-wall'],
  },
  {
    material: 'Rat-trap bond brickwork',
    reason: 'Uses 30% less bricks, creates air cavity for insulation',
    carbon_impact: 'medium',
    best_for: ['walls', 'external-walls'],
  },
  {
    material: 'Filler slab with clay pots',
    reason: 'Reduces cement, provides natural insulation',
    carbon_impact: 'low',
    best_for: ['roof-slab', 'intermediate-floors'],
  },
  {
    material: 'Mangalore tiles on wooden truss',
    reason: 'Traditional, breathable, locally available',
    carbon_impact: 'low',
    best_for: ['pitched-roof', 'veranda-roof'],
  },
  {
    material: 'Kota stone flooring',
    reason: 'Natural stone, cool underfoot, durable',
    carbon_impact: 'medium',
    best_for: ['living-room', 'veranda', 'courtyard'],
  },
  {
    material: 'Oxide flooring',
    reason: 'Low-tech, cool surface, zero VOC',
    carbon_impact: 'low',
    best_for: ['bedrooms', 'living-room'],
  },
  {
    material: 'Lime mortar',
    reason: 'Breathable, allows moisture regulation, traditional',
    carbon_impact: 'low',
    best_for: ['plastering', 'jointing'],
  },
  {
    material: 'Bamboo',
    reason: 'Fast-growing, carbon-negative, local availability',
    carbon_impact: 'low',
    best_for: ['scaffolding', 'pergola', 'fencing'],
  },
];

/**
 * Calculate courtyard requirements based on plot size
 */
function calculateCourtyardRequirements(
  plotWidth: number,
  plotDepth: number
): { minArea: number; position: 'central' | 'offset' } {
  const plotArea = plotWidth * plotDepth;

  // Courtyard should be 8-12% of plot area, min 80 sqft
  const minArea = Math.max(80, Math.round(plotArea * 0.08));

  // For narrow plots, offset courtyard works better
  const aspectRatio = plotWidth / plotDepth;
  const position: 'central' | 'offset' =
    aspectRatio < 0.6 || aspectRatio > 1.5 ? 'offset' : 'central';

  return { minArea, position };
}

/**
 * Calculate veranda requirements based on orientation
 */
function calculateVerandaRequirements(
  orientation: Direction,
  plotWidth: number
): { minWidth: number; sides: Direction[] } {
  // Minimum 4 feet, but 5 feet preferred for larger plots
  const minWidth = plotWidth > 35 ? 5 : 4;

  // Veranda should be on the entrance side and adjacent sides
  const sidesByOrientation: Record<Direction, Direction[]> = {
    east: ['east', 'south'],
    north: ['north', 'east'],
    south: ['south', 'west'],
    west: ['west', 'south'],
  };

  return {
    minWidth,
    sides: sidesByOrientation[orientation] || ['east', 'south'],
  };
}

/**
 * Calculate sump capacity based on rainfall and roof area
 */
function calculateSumpCapacity(
  plotArea: number,
  climateZone: string
): number {
  const climate = TN_CLIMATE_ZONES[climateZone] || TN_CLIMATE_ZONES['default'];

  // Assuming 60% of plot is buildable (roof catchment)
  const roofArea = plotArea * 0.6;

  // Calculate based on first flush + 1 month storage
  // Formula: Roof Area (sqm) × Rainfall (mm) × 0.8 (efficiency) / 12 months
  const roofAreaSqm = roofArea * 0.0929; // sqft to sqm
  const monthlyRainfall = climate.rainfall_mm / 4; // Assume 4-month monsoon
  const sumpLiters = Math.round(roofAreaSqm * monthlyRainfall * 0.8);

  // Minimum 5000 liters, maximum 20000 liters for residential
  return Math.min(20000, Math.max(5000, sumpLiters));
}

/**
 * Build the prompt for Gemini
 */
const SYSTEM_PROMPT = `${SYSTEM_RULES}

${ECO_DESIGN_RULES}

You are an ECO-DESIGN SPECIALIST for Tamil Nadu residential homes.
Your role is to ENFORCE non-negotiable sustainable design elements.

## Your Non-Negotiable Elements

1. **Central Courtyard (Mutram)** - MANDATORY
   - Open-to-sky space for natural light and ventilation
   - Enables stack effect cooling
   - Traditional Tamil element

2. **Veranda** - MANDATORY
   - Transition space between inside and outside
   - Provides shading and thermal buffer
   - Traditional outdoor living space

3. **Cross-Ventilation** - MANDATORY
   - Every habitable room must have airflow path
   - Window-to-window or door-to-window openings
   - Natural cooling without AC dependency

4. **West Wall Minimization** - MANDATORY
   - Reduce west-facing openings
   - Use service rooms as thermal buffer
   - Prevent afternoon heat gain

5. **Rainwater Harvesting** - MANDATORY
   - Roof drainage to sump
   - Adequate storage for monsoon
   - Recharge pit provision

6. **Natural Lighting** - MANDATORY
   - Every room must have natural light
   - Courtyard as primary light source
   - Reduced electricity dependence

## Output Format

Return ONLY valid JSON:
{
  "mandatory_elements": ["central-courtyard", "veranda", "cross-ventilation", ...],
  "energy_strategy": {
    "passive_cooling": true,
    "cross_ventilation": true,
    "west_wall_minimized": true,
    "natural_lighting": true
  },
  "water_strategy": {
    "rainwater_harvesting": true,
    "greywater_recycling": boolean,
    "sump_capacity_liters": number
  },
  "material_preferences": [
    {
      "material": "Material name",
      "reason": "Why this material",
      "carbon_impact": "low" | "medium" | "high"
    }
  ],
  "courtyard": {
    "required": true,
    "min_area_sqft": number,
    "position": "central" | "offset"
  },
  "veranda": {
    "required": true,
    "min_width_feet": number,
    "sides": ["east", "south", ...]
  },
  "violations_if_removed": ["If courtyard is removed: Loss of natural ventilation, increased cooling costs", ...]
}`;

/**
 * Eco Design Agent
 *
 * Enforces non-negotiable eco-friendly design elements.
 */
export class EcoDesignAgent {
  readonly agentName = 'eco-design' as const;
  private genAI: GoogleGenerativeAI;
  private config: EcoDesignConfig;

  constructor(config: Partial<EcoDesignConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute eco-design analysis
   */
  async execute(
    input: EcoDesignInput,
    context: DesignContext
  ): Promise<AgentResult<EcoDesignOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Pre-calculate eco requirements
      const preCalculated = this.preCalculateRequirements(input);

      // Step 3: Build prompt
      const prompt = this.buildPrompt(input, preCalculated);

      // Step 4: Call Gemini for eco analysis
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 5: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 6: Merge with pre-calculated values (enforce non-negotiables)
      const mergedOutput = this.mergePreCalculatedValues(rawOutput, preCalculated);

      // Step 7: Validate output
      const validated = validateSchema<EcoDesignOutput>(
        this.agentName,
        mergedOutput
      );

      if (!validated.success) {
        throw new Error(
          `Schema validation failed: ${validated.errors?.map(e => e.message).join(', ')}`
        );
      }

      // Step 8: Extract questions and assumptions
      const openQuestions = this.extractOpenQuestions(rawOutput, input);
      const assumptions = this.extractAssumptions(input, preCalculated);

      // Calculate token usage
      const tokensUsed: TokenUsage = {
        input: Math.round(prompt.length / 4),
        output: Math.round(response.length / 4),
        total: 0,
      };
      tokensUsed.total = tokensUsed.input + tokensUsed.output;

      const executionTimeMs = Date.now() - startTime;

      agentLogger.agentComplete(
        this.agentName,
        context.sessionId,
        executionTimeMs,
        openQuestions.length
      );

      return {
        success: true,
        agentName: this.agentName,
        executionTimeMs,
        tokensUsed,
        data: validated.data,
        openQuestions,
        assumptions,
        meta: {
          model: this.config.model,
          climateZone: input.climateZone || 'default',
          plotArea: input.plot.width * input.plot.depth,
          orientation: input.orientation,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      agentLogger.agentFailed(this.agentName, context.sessionId, err);

      const agentError: AgentError = {
        code: this.getErrorCode(error),
        message: err.message,
        retryable: this.isRetryable(error),
      };

      return {
        success: false,
        agentName: this.agentName,
        executionTimeMs,
        tokensUsed: { input: 0, output: 0, total: 0 },
        error: agentError,
        openQuestions: [],
        assumptions: [],
      };
    }
  }

  /**
   * Validate input
   */
  private validateInput(input: EcoDesignInput): void {
    if (!input.plot) {
      throw new Error('Plot dimensions are required for eco-design analysis');
    }

    if (!input.plot.width || input.plot.width <= 0) {
      throw new Error('Plot width must be a positive number');
    }

    if (!input.plot.depth || input.plot.depth <= 0) {
      throw new Error('Plot depth must be a positive number');
    }

    if (!input.orientation) {
      throw new Error('Plot orientation is required for eco-design analysis');
    }

    const validOrientations: Direction[] = ['north', 'south', 'east', 'west'];
    if (!validOrientations.includes(input.orientation)) {
      throw new Error(`Invalid orientation: ${input.orientation}. Must be north, south, east, or west`);
    }
  }

  /**
   * Pre-calculate eco requirements based on plot dimensions
   */
  private preCalculateRequirements(input: EcoDesignInput): {
    courtyard: { minArea: number; position: 'central' | 'offset' };
    veranda: { minWidth: number; sides: Direction[] };
    sumpCapacity: number;
    materials: Array<{ material: string; reason: string; carbon_impact: 'low' | 'medium' | 'high' }>;
    climateRecommendations: string[];
  } {
    const plotArea = input.plot.width * input.plot.depth;
    const climateZone = input.climateZone || 'default';
    const climate = TN_CLIMATE_ZONES[climateZone] || TN_CLIMATE_ZONES['default'];

    // Calculate courtyard requirements
    const courtyard = calculateCourtyardRequirements(input.plot.width, input.plot.depth);

    // Calculate veranda requirements
    const veranda = calculateVerandaRequirements(input.orientation, input.plot.width);

    // Calculate sump capacity
    const sumpCapacity = calculateSumpCapacity(plotArea, climateZone);

    // Select materials based on plot size and climate
    const materials = this.selectMaterials(plotArea, climateZone);

    return {
      courtyard,
      veranda,
      sumpCapacity,
      materials,
      climateRecommendations: climate.recommendations,
    };
  }

  /**
   * Select appropriate sustainable materials
   */
  private selectMaterials(
    plotArea: number,
    climateZone: string
  ): Array<{ material: string; reason: string; carbon_impact: 'low' | 'medium' | 'high' }> {
    const selectedMaterials: Array<{ material: string; reason: string; carbon_impact: 'low' | 'medium' | 'high' }> = [];

    // Always recommend CSEB for walls
    const cseb = SUSTAINABLE_MATERIALS.find(m => m.material.includes('CSEB'));
    if (cseb) {
      selectedMaterials.push({
        material: cseb.material,
        reason: cseb.reason,
        carbon_impact: cseb.carbon_impact,
      });
    }

    // Recommend filler slab for medium/large plots
    if (plotArea > 1000) {
      const fillerSlab = SUSTAINABLE_MATERIALS.find(m => m.material.includes('Filler slab'));
      if (fillerSlab) {
        selectedMaterials.push({
          material: fillerSlab.material,
          reason: fillerSlab.reason,
          carbon_impact: fillerSlab.carbon_impact,
        });
      }
    }

    // Mangalore tiles for non-coastal areas
    if (climateZone !== 'chennai-coastal') {
      const tiles = SUSTAINABLE_MATERIALS.find(m => m.material.includes('Mangalore'));
      if (tiles) {
        selectedMaterials.push({
          material: tiles.material,
          reason: tiles.reason,
          carbon_impact: tiles.carbon_impact,
        });
      }
    }

    // Oxide flooring for hot climates
    const climate = TN_CLIMATE_ZONES[climateZone] || TN_CLIMATE_ZONES['default'];
    if (climate.temp_max_c > 38) {
      const oxide = SUSTAINABLE_MATERIALS.find(m => m.material.includes('Oxide'));
      if (oxide) {
        selectedMaterials.push({
          material: oxide.material,
          reason: oxide.reason,
          carbon_impact: oxide.carbon_impact,
        });
      }
    }

    // Lime mortar for breathability
    const lime = SUSTAINABLE_MATERIALS.find(m => m.material.includes('Lime'));
    if (lime) {
      selectedMaterials.push({
        material: lime.material,
        reason: lime.reason,
        carbon_impact: lime.carbon_impact,
      });
    }

    return selectedMaterials;
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: EcoDesignInput,
    preCalculated: ReturnType<typeof this.preCalculateRequirements>
  ): string {
    const plotArea = input.plot.width * input.plot.depth;
    const climateZone = input.climateZone || 'default';
    const climate = TN_CLIMATE_ZONES[climateZone] || TN_CLIMATE_ZONES['default'];

    return `${SYSTEM_PROMPT}

## Plot Details

- Width: ${input.plot.width} feet
- Depth: ${input.plot.depth} feet
- Plot Area: ${plotArea} sq.ft
- Orientation: ${input.orientation}-facing
- Climate Zone: ${climateZone}

## Climate Data

- Annual Rainfall: ${climate.rainfall_mm}mm
- Max Temperature: ${climate.temp_max_c}°C
- Min Temperature: ${climate.temp_min_c}°C
- Humidity Level: ${climate.humidity}
- Monsoon Months: ${climate.monsoon_months.join(', ')}

## Pre-Calculated Requirements (DO NOT CHANGE THESE VALUES)

### Courtyard
- Minimum Area: ${preCalculated.courtyard.minArea} sq.ft
- Position: ${preCalculated.courtyard.position}

### Veranda
- Minimum Width: ${preCalculated.veranda.minWidth} feet
- Sides: ${preCalculated.veranda.sides.join(', ')}

### Water Storage
- Sump Capacity: ${preCalculated.sumpCapacity} liters

### Recommended Materials
${preCalculated.materials.map(m => `- ${m.material}: ${m.reason}`).join('\n')}

## Climate-Specific Recommendations
${preCalculated.climateRecommendations.map(r => `- ${r}`).join('\n')}

## Your Task

1. Confirm all mandatory elements are included
2. Verify energy strategy aligns with orientation
3. Validate water strategy for climate zone
4. List violations that would occur if any element is removed
5. Add any additional eco-recommendations specific to this plot

CRITICAL: The pre-calculated values for courtyard area, veranda width, and sump capacity are based on precise calculations. Use these exact values in your response.

Return your analysis as valid JSON.`;
  }

  /**
   * Call Gemini API
   */
  private async callGemini(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  /**
   * Parse Gemini response
   */
  private parseResponse(response: string): Partial<EcoDesignOutput> {
    // Remove markdown code blocks if present
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // Try to extract JSON from the response
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse eco-design response: ${(e as Error).message}`);
    }
  }

  /**
   * Merge pre-calculated values with LLM output
   * This ensures non-negotiable values are enforced
   */
  private mergePreCalculatedValues(
    output: Partial<EcoDesignOutput>,
    preCalculated: ReturnType<typeof this.preCalculateRequirements>
  ): EcoDesignOutput {
    // Ensure mandatory elements are present
    const mandatoryElements = output.mandatory_elements || [];
    for (const element of MANDATORY_ECO_ELEMENTS) {
      if (!mandatoryElements.includes(element)) {
        mandatoryElements.push(element);
      }
    }

    // Enforce energy strategy (all must be true - non-negotiable)
    const energyStrategy = {
      ...(output.energy_strategy || {}),
      // These are enforced to true regardless of LLM output
      passive_cooling: true,
      cross_ventilation: true,
      west_wall_minimized: true,
      natural_lighting: true,
    };

    // Enforce water strategy with pre-calculated values
    const waterStrategy = {
      rainwater_harvesting: true,
      greywater_recycling: output.water_strategy?.greywater_recycling ?? false,
      sump_capacity_liters: preCalculated.sumpCapacity,
    };

    // Use pre-calculated material preferences if LLM didn't provide enough
    let materialPreferences = output.material_preferences || [];
    if (materialPreferences.length < 3) {
      materialPreferences = preCalculated.materials;
    }

    // Enforce courtyard requirements (ALWAYS required)
    const courtyard = {
      required: true as const,
      min_area_sqft: preCalculated.courtyard.minArea,
      position: preCalculated.courtyard.position,
    };

    // Enforce veranda requirements (ALWAYS required)
    const veranda = {
      required: true as const,
      min_width_feet: preCalculated.veranda.minWidth,
      sides: preCalculated.veranda.sides,
    };

    // Generate violations if not provided
    let violationsIfRemoved = output.violations_if_removed || [];
    if (violationsIfRemoved.length === 0) {
      violationsIfRemoved = this.generateViolations();
    }

    return {
      mandatory_elements: mandatoryElements,
      energy_strategy: energyStrategy,
      water_strategy: waterStrategy,
      material_preferences: materialPreferences,
      courtyard,
      veranda,
      violations_if_removed: violationsIfRemoved,
    };
  }

  /**
   * Generate violations if eco elements are removed
   */
  private generateViolations(): string[] {
    return [
      'If courtyard is removed: Loss of natural ventilation, 30-40% increase in cooling costs, no stack effect cooling',
      'If veranda is removed: Direct sun exposure to walls, loss of transition space, increased indoor temperature',
      'If cross-ventilation is compromised: Dependence on mechanical cooling, poor air quality, increased electricity bills',
      'If west wall buffer is removed: 4-6°C higher indoor temperature in evenings, glare issues, heat retention',
      'If rainwater harvesting is removed: Loss of free water resource, groundwater depletion, dependency on tanker water',
      'If natural lighting is reduced: Increased electricity for lighting, poor circadian health, mold growth risk',
    ];
  }

  /**
   * Extract open questions from output
   */
  private extractOpenQuestions(
    output: Partial<EcoDesignOutput>,
    input: EcoDesignInput
  ): OpenQuestion[] {
    const questions: OpenQuestion[] = [];

    // Ask about greywater recycling preference
    if (!output.water_strategy?.greywater_recycling) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'greywater_recycling',
        question: 'Would you like to include greywater recycling for garden irrigation?',
        type: 'optional',
        reason: 'Greywater recycling can reduce water consumption by 30-40%',
        options: ['Yes, include greywater recycling', 'No, standard drainage only'],
      });
    }

    // Ask about solar panels if not mentioned
    questions.push({
      agentSource: this.agentName,
      questionId: 'solar_provision',
      question: 'Should we include structural provision for future solar panel installation?',
      type: 'optional',
      reason: 'Pre-planning reduces retrofit costs by 60%',
      options: ['Yes, plan for solar', 'No, not needed now'],
    });

    // Ask about climate zone if not specified
    if (!input.climateZone) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'climate_zone',
        question: 'Which climate zone is your plot located in?',
        type: 'optional',
        reason: 'Climate zone affects material selection and water storage capacity',
        options: ['Chennai coastal', 'Interior dry belt', 'Hill station area', 'Other Tamil Nadu'],
        defaultValue: 'Interior dry belt',
      });
    }

    return questions;
  }

  /**
   * Extract assumptions from analysis
   */
  private extractAssumptions(
    input: EcoDesignInput,
    preCalculated: ReturnType<typeof this.preCalculateRequirements>
  ): Assumption[] {
    const assumptions: Assumption[] = [];

    // Climate zone assumption
    if (!input.climateZone) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'climate_zone_default',
        assumption: 'Assuming default Tamil Nadu climate zone (interior)',
        risk: 'medium',
        basis: 'No specific climate zone provided, using moderate values',
      });
    }

    // Roof type assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'roof_catchment',
      assumption: 'Assuming 60% of plot area is buildable for rainwater calculation',
      risk: 'low',
      basis: 'Standard residential construction ratio after setbacks',
    });

    // Material availability assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'material_availability',
      assumption: 'Recommended sustainable materials are locally available',
      risk: 'low',
      basis: 'Materials selected are common in Tamil Nadu construction',
    });

    // Future expansion assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'future_expansion',
      assumption: 'Design should accommodate one additional floor in future',
      risk: 'low',
      basis: 'Standard practice for Tamil Nadu residential construction',
    });

    // Courtyard drainage assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'courtyard_drainage',
      assumption: 'Courtyard will drain to rainwater sump, not sewage',
      risk: 'low',
      basis: 'Best practice for water conservation',
    });

    return assumptions;
  }

  /**
   * Get error code based on error type
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('parse')) {
        return 'ECO_DESIGN_PARSE_ERROR';
      }
      if (error.message.includes('validation')) {
        return 'ECO_DESIGN_VALIDATION_ERROR';
      }
      if (error.message.includes('API')) {
        return 'ECO_DESIGN_API_ERROR';
      }
    }
    return 'ECO_DESIGN_ERROR';
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      // API errors are usually retryable
      if (error.message.includes('API') || error.message.includes('timeout')) {
        return true;
      }
      // Parse errors are not retryable without new data
      if (error.message.includes('parse')) {
        return false;
      }
    }
    return false;
  }
}

/**
 * Factory function to create EcoDesignAgent
 */
export function createEcoDesignAgent(
  config?: Partial<EcoDesignConfig>
): EcoDesignAgent {
  return new EcoDesignAgent(config);
}
