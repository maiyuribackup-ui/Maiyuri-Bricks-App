/**
 * Regulation Compliance Agent (Agent 2)
 *
 * Calculates buildable envelope based on plot dimensions, setbacks,
 * and Tamil Nadu building regulations.
 *
 * Responsibilities:
 * - Calculate buildable area after applying setbacks
 * - Determine FSI limits and max floors
 * - Check for regulation violations
 * - Flag when city authority is unknown
 *
 * Guardrails:
 * - NEVER approve designs that violate setbacks
 * - NEVER exceed FSI limits
 * - Always flag unknown regulations as assumptions
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DesignContext } from '../types/design-context';
import type {
  AgentResult,
  OpenQuestion,
  Assumption,
  TokenUsage,
  AgentError,
} from '../types/agent-result';
import type {
  RegulationComplianceInput,
  RegulationComplianceOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES, REGULATION_GUIDELINES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface RegulationComplianceConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: RegulationComplianceConfig = {
  model: 'gemini-3-pro-preview',
  maxTokens: 4096,
  temperature: 0.1, // Very low temperature for precise regulation calculations
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Tamil Nadu Building Regulation Defaults
 * These are used when specific authority rules are not available
 */
const TN_REGULATION_DEFAULTS = {
  // Setback rules by road width (in feet)
  setbacks: {
    roadWidth: {
      under12m: { front: 5, rear: 3, side: 3 },
      '12to18m': { front: 6, rear: 3, side: 3 },
      '18to30m': { front: 9, rear: 3, side: 3 },
      over30m: { front: 12, rear: 3, side: 3 },
    },
  },
  // FSI by zone type
  fsi: {
    residential: {
      plotUnder1500sqft: 1.5,
      plot1500to3000sqft: 1.75,
      plotOver3000sqft: 2.0,
    },
    commercial: 2.5,
    mixed: 2.0,
  },
  // Height restrictions
  height: {
    maxMeters: 15,
    maxFloors: 4,
    floorHeight: 3.0, // meters per floor
  },
  // Coverage
  coverage: {
    plotUnder1500sqft: 0.65, // 65% ground coverage
    plotOver1500sqft: 0.50, // 50% ground coverage
  },
};

/**
 * System prompt for regulation compliance
 */
const REGULATION_COMPLIANCE_PROMPT = `You are a Building Regulation Compliance Agent specializing in Tamil Nadu building codes.

## YOUR ROLE
Calculate the buildable envelope and check regulatory compliance for residential plots.
You analyze plot dimensions and setbacks to determine what can legally be built.

## WHAT TO CALCULATE
1. **Buildable Envelope**: Area remaining after applying setbacks
2. **FSI (Floor Space Index)**: Maximum permissible built-up area ratio
3. **Maximum Height**: Based on zone and road width
4. **Maximum Floors**: Based on height and floor-to-floor height
5. **Ground Coverage**: Maximum building footprint percentage

## TAMIL NADU REGULATIONS REFERENCE

### Setback Requirements (Default for residential)
- Front: 5 feet minimum (increases with road width)
- Rear: 3-5 feet
- Side: 3 feet each side
- Corner plots: Front setback on both road-facing sides

### FSI Limits
- Plots under 1500 sqft: FSI 1.5
- Plots 1500-3000 sqft: FSI 1.75
- Plots over 3000 sqft: FSI 2.0

### Height Limits
- Maximum 15 meters or 4 floors for residential
- Floor-to-floor height: 3.0 meters typical

### Ground Coverage
- Plots under 1500 sqft: Maximum 65% coverage
- Plots over 1500 sqft: Maximum 50% coverage

## CRITICAL RULES
1. **NEVER approve** designs that violate minimum setbacks
2. **NEVER exceed** FSI limits - this is legally binding
3. **CALCULATE precisely** - show your math
4. **FLAG violations** immediately in the violations array
5. **ASSUME TN defaults** when city authority is not specified (flag as assumption)

## OUTPUT FORMAT
Respond with ONLY valid JSON matching this schema:
{
  "buildable_envelope": {
    "width": <plot width minus left and right setbacks>,
    "depth": <plot depth minus front and rear setbacks>,
    "area": <buildable width * buildable depth>,
    "maxHeight": <in meters>,
    "maxFloors": <integer>,
    "fsi": <float, e.g., 1.5>
  },
  "constraints": [
    "List of applicable constraints/rules"
  ],
  "violations": [
    "List of any regulation violations found (empty if compliant)"
  ],
  "assumptions": [
    {
      "assumption": "What was assumed",
      "risk": "low" | "medium" | "high"
    }
  ],
  "open_questions": [
    {
      "id": "unique_id",
      "question": "Clear question for the user",
      "type": "mandatory" | "optional",
      "reason": "Why this is needed"
    }
  ]
}`;

/**
 * Regulation Compliance Agent
 *
 * Calculates buildable envelope and checks regulatory compliance.
 */
export class RegulationComplianceAgent {
  readonly agentName = 'regulation-compliance' as const;
  private genAI: GoogleGenerativeAI;
  private config: RegulationComplianceConfig;

  constructor(config: Partial<RegulationComplianceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute regulation compliance check
   */
  async execute(
    input: RegulationComplianceInput,
    context: DesignContext
  ): Promise<AgentResult<RegulationComplianceOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Pre-calculate buildable envelope (deterministic)
      const preCalculated = this.preCalculateBuildableEnvelope(input);

      // Step 3: Build prompt with input data
      const prompt = this.buildPrompt(input, preCalculated);

      // Step 4: Call Gemini for regulation analysis
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 5: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 6: Merge pre-calculated values (ensure accuracy)
      const mergedOutput = this.mergePreCalculatedValues(rawOutput, preCalculated);

      // Step 7: Validate output
      const validated = validateSchema<RegulationComplianceOutput>(
        this.agentName,
        mergedOutput
      );

      if (!validated.success) {
        throw new Error(
          `Schema validation failed: ${validated.errors?.map(e => e.message).join(', ')}`
        );
      }

      // Step 8: Extract open questions and assumptions
      const openQuestions = this.extractOpenQuestions(validated.data!, input);
      const assumptions = this.extractAssumptions(validated.data!, input);

      // Step 9: Track token usage
      const tokensUsed: TokenUsage = {
        input: this.estimateInputTokens(prompt),
        output: this.estimateOutputTokens(response),
        total: 0,
      };
      tokensUsed.total = tokensUsed.input + tokensUsed.output;
      tokenBudget.track(this.agentName, tokensUsed);

      const executionTimeMs = Date.now() - startTime;
      agentLogger.agentComplete(
        this.agentName,
        context.sessionId,
        executionTimeMs,
        openQuestions.length
      );

      // Log compliance results
      agentLogger.info('Regulation compliance check complete', {
        buildableArea: validated.data?.buildable_envelope.area,
        fsi: validated.data?.buildable_envelope.fsi,
        violationsCount: validated.data?.violations.length,
      });

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
          preCalculated: true,
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
  private validateInput(input: RegulationComplianceInput): void {
    if (!input.plot) {
      throw new Error('Plot dimensions are required');
    }

    if (!input.plot.width || input.plot.width <= 0) {
      throw new Error('Plot width must be a positive number');
    }

    if (!input.plot.depth || input.plot.depth <= 0) {
      throw new Error('Plot depth must be a positive number');
    }

    if (!input.setbacks) {
      throw new Error('Setback information is required');
    }

    // Validate setbacks are not larger than plot
    const totalWidthSetback = (input.setbacks.left || 0) + (input.setbacks.right || 0);
    const totalDepthSetback = (input.setbacks.front || 0) + (input.setbacks.rear || 0);

    if (totalWidthSetback >= input.plot.width) {
      throw new Error('Setbacks exceed plot width - no buildable area');
    }

    if (totalDepthSetback >= input.plot.depth) {
      throw new Error('Setbacks exceed plot depth - no buildable area');
    }
  }

  /**
   * Pre-calculate buildable envelope (deterministic calculation)
   * This ensures accurate math regardless of LLM response
   */
  private preCalculateBuildableEnvelope(input: RegulationComplianceInput): {
    width: number;
    depth: number;
    area: number;
    maxHeight: number;
    maxFloors: number;
    fsi: number;
    coverage: number;
  } {
    // Calculate buildable dimensions
    const buildableWidth = input.plot.width - (input.setbacks.left || 0) - (input.setbacks.right || 0);
    const buildableDepth = input.plot.depth - (input.setbacks.front || 0) - (input.setbacks.rear || 0);
    const buildableArea = buildableWidth * buildableDepth;

    // Determine FSI based on plot size
    const plotArea = input.plot.area || (input.plot.width * input.plot.depth);
    let fsi: number;
    if (plotArea < 1500) {
      fsi = TN_REGULATION_DEFAULTS.fsi.residential.plotUnder1500sqft;
    } else if (plotArea <= 3000) {
      fsi = TN_REGULATION_DEFAULTS.fsi.residential.plot1500to3000sqft;
    } else {
      fsi = TN_REGULATION_DEFAULTS.fsi.residential.plotOver3000sqft;
    }

    // Override FSI for non-residential
    if (input.plotType === 'commercial') {
      fsi = TN_REGULATION_DEFAULTS.fsi.commercial;
    } else if (input.plotType === 'mixed') {
      fsi = TN_REGULATION_DEFAULTS.fsi.mixed;
    }

    // Determine coverage
    const coverage = plotArea < 1500
      ? TN_REGULATION_DEFAULTS.coverage.plotUnder1500sqft
      : TN_REGULATION_DEFAULTS.coverage.plotOver1500sqft;

    return {
      width: Math.round(buildableWidth * 100) / 100,
      depth: Math.round(buildableDepth * 100) / 100,
      area: Math.round(buildableArea * 100) / 100,
      maxHeight: TN_REGULATION_DEFAULTS.height.maxMeters,
      maxFloors: TN_REGULATION_DEFAULTS.height.maxFloors,
      fsi,
      coverage,
    };
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: RegulationComplianceInput,
    preCalculated: ReturnType<typeof this.preCalculateBuildableEnvelope>
  ): string {
    const plotType = input.plotType || 'residential';
    const cityAuthority = input.cityAuthority || 'Unknown (using Tamil Nadu defaults)';

    return `${SYSTEM_RULES}

${REGULATION_GUIDELINES}

${REGULATION_COMPLIANCE_PROMPT}

## INPUT DATA

**Plot Dimensions:**
- Width: ${input.plot.width} feet
- Depth: ${input.plot.depth} feet
- Total Area: ${input.plot.area || input.plot.width * input.plot.depth} sq.ft.

**Setbacks (Applied):**
- Front: ${input.setbacks.front} feet
- Rear: ${input.setbacks.rear} feet
- Left: ${input.setbacks.left} feet
- Right: ${input.setbacks.right} feet

**Plot Type:** ${plotType}
**City/Authority:** ${cityAuthority}

## PRE-CALCULATED VALUES (Use these exact values)

- Buildable Width: ${preCalculated.width} feet
- Buildable Depth: ${preCalculated.depth} feet
- Buildable Area: ${preCalculated.area} sq.ft.
- Maximum FSI: ${preCalculated.fsi}
- Maximum Height: ${preCalculated.maxHeight} meters
- Maximum Floors: ${preCalculated.maxFloors}
- Ground Coverage Limit: ${(preCalculated.coverage * 100).toFixed(0)}%

## TASK

1. Verify the pre-calculated buildable envelope
2. List all applicable constraints based on Tamil Nadu regulations
3. Check for any violations (setback violations, FSI issues, etc.)
4. Document any assumptions made
5. Return the complete JSON response

Respond with ONLY valid JSON.`;
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
    return result.response.text();
  }

  /**
   * Parse Gemini response
   */
  private parseResponse(responseText: string): unknown {
    let content = responseText.trim();

    // Remove markdown code blocks if present
    if (content.startsWith('```json')) {
      content = content.slice(7);
    } else if (content.startsWith('```')) {
      content = content.slice(3);
    }

    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }

    content = content.trim();

    try {
      return JSON.parse(content);
    } catch (parseError) {
      logger.error('Failed to parse regulation compliance response', {
        content: content.slice(0, 500),
      });
      throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}...`);
    }
  }

  /**
   * Merge pre-calculated values to ensure accuracy
   */
  private mergePreCalculatedValues(
    rawOutput: unknown,
    preCalculated: ReturnType<typeof this.preCalculateBuildableEnvelope>
  ): unknown {
    const output = rawOutput as Record<string, unknown>;

    // Ensure buildable_envelope uses our deterministic calculations
    if (output.buildable_envelope) {
      const envelope = output.buildable_envelope as Record<string, unknown>;
      envelope.width = preCalculated.width;
      envelope.depth = preCalculated.depth;
      envelope.area = preCalculated.area;
      envelope.maxHeight = preCalculated.maxHeight;
      envelope.maxFloors = preCalculated.maxFloors;
      envelope.fsi = preCalculated.fsi;
    } else {
      output.buildable_envelope = {
        width: preCalculated.width,
        depth: preCalculated.depth,
        area: preCalculated.area,
        maxHeight: preCalculated.maxHeight,
        maxFloors: preCalculated.maxFloors,
        fsi: preCalculated.fsi,
      };
    }

    // Ensure arrays exist
    if (!output.constraints) output.constraints = [];
    if (!output.violations) output.violations = [];
    if (!output.assumptions) output.assumptions = [];
    if (!output.open_questions) output.open_questions = [];

    return output;
  }

  /**
   * Extract open questions
   */
  private extractOpenQuestions(
    data: RegulationComplianceOutput,
    input: RegulationComplianceInput
  ): OpenQuestion[] {
    const questions: OpenQuestion[] = [];

    // Add questions from response
    if (data.open_questions) {
      for (const q of data.open_questions) {
        questions.push({
          agentSource: this.agentName,
          questionId: q.id || `${this.agentName}-${questions.length + 1}`,
          question: q.question,
          type: q.type || 'optional',
          reason: q.reason || 'Required for accurate compliance check',
        });
      }
    }

    // Auto-generate question if city authority is unknown
    if (!input.cityAuthority) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'city_authority',
        question: 'Which city/panchayat authority does your plot fall under?',
        type: 'optional',
        reason: 'Specific regulations may vary by local authority. Using Tamil Nadu defaults.',
      });
    }

    return questions;
  }

  /**
   * Extract assumptions
   */
  private extractAssumptions(
    data: RegulationComplianceOutput,
    input: RegulationComplianceInput
  ): Assumption[] {
    const assumptions: Assumption[] = [];

    // Add assumptions from response
    if (data.assumptions) {
      for (const a of data.assumptions) {
        assumptions.push({
          agentSource: this.agentName,
          assumptionId: `${this.agentName}-${assumptions.length + 1}`,
          assumption: a.assumption,
          risk: a.risk,
        });
      }
    }

    // Add assumption if using default regulations
    if (!input.cityAuthority) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'tn_defaults',
        assumption: 'Using Tamil Nadu residential building regulation defaults',
        risk: 'medium',
        basis: 'City/panchayat authority not specified',
      });
    }

    // Add assumption for plot type
    if (!input.plotType) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'residential_default',
        assumption: 'Assuming residential plot type',
        risk: 'low',
        basis: 'Plot type not specified',
      });
    }

    return assumptions;
  }

  /**
   * Estimate input tokens
   */
  private estimateInputTokens(prompt: string): number {
    // Rough estimate: ~1 token per 4 characters
    return Math.ceil(prompt.length / 4);
  }

  /**
   * Estimate output tokens
   */
  private estimateOutputTokens(responseText: string): number {
    return Math.ceil(responseText.length / 4);
  }

  /**
   * Get error code from error
   */
  private getErrorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (typeof err.code === 'string') return err.code;
      if (typeof err.type === 'string') return err.type;
      if (typeof err.status === 'number') return `HTTP_${err.status}`;
    }
    return 'REGULATION_COMPLIANCE_ERROR';
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (err.status === 429 || err.status === 529) return true;
      if (typeof err.status === 'number' && err.status >= 500) return true;
    }
    return false;
  }
}

/**
 * Create a new Regulation Compliance Agent instance
 */
export function createRegulationComplianceAgent(
  config?: Partial<RegulationComplianceConfig>
): RegulationComplianceAgent {
  return new RegulationComplianceAgent(config);
}
