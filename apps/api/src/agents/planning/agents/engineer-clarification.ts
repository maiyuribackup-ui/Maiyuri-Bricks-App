/**
 * Engineer Clarification Agent (Agent 4)
 *
 * Determines structural strategy and identifies engineering considerations
 * for residential construction in Tamil Nadu.
 *
 * Responsibilities:
 * - Recommend structural system (load-bearing, RCC, hybrid)
 * - Identify engineering risks based on plot and soil
 * - Flag unknown soil/site conditions
 * - Provide construction-ready technical guidance
 *
 * Guardrails:
 * - NEVER recommend unsafe structural systems
 * - ALWAYS flag unknown soil conditions
 * - Use conservative assumptions when uncertain
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DesignContext, StructuralStrategy } from '../types/design-context';
import type {
  AgentResult,
  OpenQuestion,
  Assumption,
  TokenUsage,
  AgentError,
} from '../types/agent-result';
import type {
  EngineerClarificationInput,
  EngineerClarificationOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES, REGULATION_GUIDELINES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface EngineerClarificationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: EngineerClarificationConfig = {
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
  temperature: 0.1, // Very low temperature for technical precision
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Tamil Nadu construction norms and recommendations
 */
const TN_CONSTRUCTION_NORMS = {
  // Structural system recommendations by plot size
  structuralRecommendations: {
    smallPlot: { // Under 1200 sqft
      primary: 'load-bearing' as StructuralStrategy,
      reasoning: 'Cost-effective for small spans, suitable for G+1',
    },
    mediumPlot: { // 1200-2400 sqft
      primary: 'hybrid' as StructuralStrategy,
      reasoning: 'Load-bearing walls with RCC roof slab for flexibility',
    },
    largePlot: { // Over 2400 sqft
      primary: 'rcc' as StructuralStrategy,
      reasoning: 'RCC frame provides large spans and future expansion',
    },
  },

  // Soil type considerations
  soilConsiderations: {
    clay: {
      foundationType: 'Strip footing with PCC bed',
      depth: '4-5 feet',
      risks: ['Soil swelling in monsoon', 'Settlement issues'],
      recommendation: 'Consider pile foundation for G+2',
    },
    sandy: {
      foundationType: 'Isolated footing',
      depth: '3-4 feet',
      risks: ['Erosion potential', 'Water table rise'],
      recommendation: 'Anti-termite treatment essential',
    },
    rocky: {
      foundationType: 'Direct on rock with anchors',
      depth: '2-3 feet',
      risks: ['Excavation cost', 'Blasting may be needed'],
      recommendation: 'Excellent bearing capacity',
    },
    mixed: {
      foundationType: 'Combined footing',
      depth: '4-5 feet',
      risks: ['Differential settlement', 'Variable bearing capacity'],
      recommendation: 'Soil test strongly recommended',
    },
    unknown: {
      foundationType: 'To be determined after soil test',
      depth: 'TBD',
      risks: ['Unknown bearing capacity', 'Unknown water table'],
      recommendation: 'Soil test mandatory before construction',
    },
  },

  // Standard specifications
  standards: {
    wallThickness: {
      external: 9, // inches (230mm brick)
      internal: 4.5, // inches (115mm brick)
    },
    slabThickness: {
      rcc: 5, // inches (125mm)
      filler: 6, // inches (150mm with filler slab)
    },
    beamDepth: {
      standard: 15, // inches
      maxSpan: 12, // feet without intermediate support
    },
    columnSize: {
      minimum: '9x12', // inches
      forG2: '12x12', // inches
    },
  },

  // Common risks in Tamil Nadu
  commonRisks: [
    'Monsoon flooding in low-lying areas',
    'High humidity affecting steel reinforcement',
    'Termite infestation in sandy soil',
    'Cyclone risk in coastal areas',
    'Groundwater table rise during monsoon',
  ],
};

/**
 * System prompt for engineer clarification
 */
const ENGINEER_CLARIFICATION_PROMPT = `You are a Structural Engineering Agent specializing in residential construction in Tamil Nadu.

## YOUR ROLE
Determine the appropriate structural strategy and identify engineering considerations for a residential plot.
Your recommendations must be practical, cost-effective, and suitable for local construction practices.

## STRUCTURAL SYSTEMS

### Load-Bearing Construction
- Suitable for: Small plots (under 1200 sqft), G+1 buildings
- Walls carry roof/floor loads
- More economical for small spans
- Brick/block walls with RCC lintels
- Maximum span: 12 feet without intermediate support

### RCC Frame Construction
- Suitable for: Large plots (over 2400 sqft), G+2 and above
- Columns and beams carry loads
- Walls are non-structural (infill)
- Allows larger spans and open floor plans
- Better for future modifications

### Hybrid Construction
- Suitable for: Medium plots (1200-2400 sqft)
- Load-bearing walls on ground floor
- RCC columns for upper floor support
- Cost-effective compromise
- Common in Tamil Nadu residential construction

## SOIL TYPE CONSIDERATIONS

### Clay Soil
- Requires deeper foundations (4-5 feet)
- Risk of swelling during monsoon
- Settlement monitoring needed
- PCC bed under footing essential

### Sandy Soil
- Shallow foundations possible (3-4 feet)
- Good drainage properties
- Anti-termite treatment mandatory
- Erosion protection at edges

### Rocky Soil
- Excellent bearing capacity
- Shallow foundations sufficient
- May require blasting
- Direct anchor to rock possible

### Unknown Soil
- MUST recommend soil test
- Use conservative assumptions
- Flag as high-risk assumption

## ENGINEERING RISKS TO CHECK

1. **Structural Risks**
   - Span length vs support capacity
   - Foundation adequacy for building height
   - Load transfer path clarity

2. **Site Risks**
   - Flooding potential
   - Slope and drainage
   - Adjacent structures

3. **Material Risks**
   - Steel corrosion in humid climate
   - Brick quality variations
   - Concrete curing in hot weather

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "structural_strategy": "load-bearing" | "rcc" | "hybrid",
  "engineering_risks": ["Risk 1", "Risk 2", ...],
  "assumptions": [
    {
      "assumption": "What was assumed",
      "risk": "low" | "medium" | "high",
      "basis": "Why this assumption was made"
    }
  ],
  "open_questions": [
    {
      "id": "unique_id",
      "question": "Clear question for the engineer/client",
      "type": "mandatory" | "optional",
      "reason": "Why this information is needed"
    }
  ]
}`;

/**
 * Engineer Clarification Agent
 *
 * Determines structural strategy and identifies engineering considerations.
 */
export class EngineerClarificationAgent {
  readonly agentName = 'engineer-clarification' as const;
  private genAI: GoogleGenerativeAI;
  private config: EngineerClarificationConfig;

  constructor(config: Partial<EngineerClarificationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute engineer clarification
   */
  async execute(
    input: EngineerClarificationInput,
    context: DesignContext
  ): Promise<AgentResult<EngineerClarificationOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Pre-determine structural strategy (deterministic)
      const preRecommendation = this.preCalculateStructuralStrategy(input);

      // Step 3: Build prompt
      const prompt = this.buildPrompt(input, preRecommendation);

      // Step 4: Call Gemini for engineering analysis
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 5: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 6: Merge with pre-calculated recommendation
      const mergedOutput = this.mergePreCalculatedValues(rawOutput, preRecommendation);

      // Step 7: Validate output
      const validated = validateSchema<EngineerClarificationOutput>(
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

      // Log engineering results
      agentLogger.info('Engineer clarification complete', {
        structuralStrategy: validated.data?.structural_strategy,
        risksCount: validated.data?.engineering_risks.length,
        openQuestionsCount: openQuestions.length,
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
          plotSizeCategory: preRecommendation.sizeCategory,
          soilType: input.soilType || 'unknown',
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
  private validateInput(input: EngineerClarificationInput): void {
    if (!input.plot) {
      throw new Error('Plot dimensions are required');
    }

    if (!input.plot.width || input.plot.width <= 0) {
      throw new Error('Plot width must be a positive number');
    }

    if (!input.plot.depth || input.plot.depth <= 0) {
      throw new Error('Plot depth must be a positive number');
    }
  }

  /**
   * Pre-calculate structural strategy based on plot size
   */
  private preCalculateStructuralStrategy(input: EngineerClarificationInput): {
    strategy: StructuralStrategy;
    sizeCategory: 'small' | 'medium' | 'large';
    reasoning: string;
    soilInfo: typeof TN_CONSTRUCTION_NORMS.soilConsiderations.unknown;
  } {
    const plotArea = input.plot.area || (input.plot.width * input.plot.depth);

    // Determine size category and structural recommendation
    let sizeCategory: 'small' | 'medium' | 'large';
    let strategy: StructuralStrategy;
    let reasoning: string;

    if (plotArea < 1200) {
      sizeCategory = 'small';
      strategy = TN_CONSTRUCTION_NORMS.structuralRecommendations.smallPlot.primary;
      reasoning = TN_CONSTRUCTION_NORMS.structuralRecommendations.smallPlot.reasoning;
    } else if (plotArea <= 2400) {
      sizeCategory = 'medium';
      strategy = TN_CONSTRUCTION_NORMS.structuralRecommendations.mediumPlot.primary;
      reasoning = TN_CONSTRUCTION_NORMS.structuralRecommendations.mediumPlot.reasoning;
    } else {
      sizeCategory = 'large';
      strategy = TN_CONSTRUCTION_NORMS.structuralRecommendations.largePlot.primary;
      reasoning = TN_CONSTRUCTION_NORMS.structuralRecommendations.largePlot.reasoning;
    }

    // Get soil information
    const soilType = (input.soilType || 'unknown') as keyof typeof TN_CONSTRUCTION_NORMS.soilConsiderations;
    const soilInfo = TN_CONSTRUCTION_NORMS.soilConsiderations[soilType] ||
      TN_CONSTRUCTION_NORMS.soilConsiderations.unknown;

    return {
      strategy,
      sizeCategory,
      reasoning,
      soilInfo,
    };
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: EngineerClarificationInput,
    preRecommendation: ReturnType<typeof this.preCalculateStructuralStrategy>
  ): string {
    const plotArea = input.plot.area || (input.plot.width * input.plot.depth);
    const soilType = input.soilType || 'unknown';
    const localNorms = input.localConstructionNorms || 'Tamil Nadu standard residential construction norms';

    return `${SYSTEM_RULES}

${REGULATION_GUIDELINES}

${ENGINEER_CLARIFICATION_PROMPT}

## CONTEXT

**Plot Dimensions:**
- Width: ${input.plot.width} feet
- Depth: ${input.plot.depth} feet
- Total Area: ${plotArea} sq.ft.
- Size Category: ${preRecommendation.sizeCategory.toUpperCase()}

**Site Conditions:**
- Soil Type: ${soilType}
- Local Construction Norms: ${localNorms}

**Pre-Calculated Recommendation:**
- Structural Strategy: ${preRecommendation.strategy}
- Reasoning: ${preRecommendation.reasoning}

**Soil Considerations:**
- Foundation Type: ${preRecommendation.soilInfo.foundationType}
- Recommended Depth: ${preRecommendation.soilInfo.depth}
- Known Risks: ${preRecommendation.soilInfo.risks.join(', ')}
- Recommendation: ${preRecommendation.soilInfo.recommendation}

## TASK

1. Confirm or adjust the pre-calculated structural strategy
2. Identify ALL engineering risks for this plot
3. Document assumptions with risk levels
4. Generate questions for unknown critical information

**Important:**
- If soil type is unknown, add a MANDATORY question for soil test
- Consider Tamil Nadu monsoon and humidity in your risk assessment
- Flag any concerns about building height vs foundation capacity

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
      logger.error('Failed to parse engineer clarification response', {
        content: content.slice(0, 500),
      });
      throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}...`);
    }
  }

  /**
   * Merge pre-calculated values for accuracy
   */
  private mergePreCalculatedValues(
    rawOutput: unknown,
    preRecommendation: ReturnType<typeof this.preCalculateStructuralStrategy>
  ): unknown {
    const output = rawOutput as Record<string, unknown>;

    // If LLM didn't provide a valid strategy, use pre-calculated
    const validStrategies: StructuralStrategy[] = ['load-bearing', 'rcc', 'hybrid'];
    if (!output.structural_strategy || !validStrategies.includes(output.structural_strategy as StructuralStrategy)) {
      output.structural_strategy = preRecommendation.strategy;
    }

    // Ensure arrays exist
    if (!output.engineering_risks) {
      output.engineering_risks = [];
    }
    if (!output.assumptions) {
      output.assumptions = [];
    }
    if (!output.open_questions) {
      output.open_questions = [];
    }

    // Add soil-specific risks if not already included
    const risks = output.engineering_risks as string[];
    for (const risk of preRecommendation.soilInfo.risks) {
      if (!risks.some(r => r.toLowerCase().includes(risk.toLowerCase().split(' ')[0]))) {
        risks.push(risk);
      }
    }

    return output;
  }

  /**
   * Extract open questions
   */
  private extractOpenQuestions(
    data: EngineerClarificationOutput,
    input: EngineerClarificationInput
  ): OpenQuestion[] {
    const questions: OpenQuestion[] = [];

    // Add questions from LLM response
    if (data.open_questions) {
      for (const q of data.open_questions) {
        questions.push({
          agentSource: this.agentName,
          questionId: q.id || `${this.agentName}-${questions.length + 1}`,
          question: q.question,
          type: q.type || 'optional',
          reason: q.reason || 'Required for structural design',
        });
      }
    }

    // Auto-add soil test question if soil is unknown
    if (!input.soilType || input.soilType === 'unknown') {
      const hasSoilQuestion = questions.some(q =>
        q.questionId === 'soil_test' ||
        q.question.toLowerCase().includes('soil')
      );

      if (!hasSoilQuestion) {
        questions.push({
          agentSource: this.agentName,
          questionId: 'soil_test',
          question: 'Has a soil test been conducted? If yes, what is the soil bearing capacity?',
          type: 'mandatory',
          reason: 'Soil bearing capacity is critical for foundation design',
        });
      }
    }

    // Add question about building height if not clear
    questions.push({
      agentSource: this.agentName,
      questionId: 'building_height',
      question: 'How many floors are you planning? (Ground + Upper floors)',
      type: 'mandatory',
      reason: 'Number of floors affects structural system and foundation design',
    });

    return questions;
  }

  /**
   * Extract assumptions
   */
  private extractAssumptions(
    data: EngineerClarificationOutput,
    input: EngineerClarificationInput
  ): Assumption[] {
    const assumptions: Assumption[] = [];

    // Add assumptions from LLM response
    if (data.assumptions) {
      for (const a of data.assumptions) {
        assumptions.push({
          agentSource: this.agentName,
          assumptionId: `${this.agentName}-${assumptions.length + 1}`,
          assumption: a.assumption,
          risk: a.risk,
          basis: a.basis,
        });
      }
    }

    // Add soil assumption if unknown
    if (!input.soilType || input.soilType === 'unknown') {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'soil_unknown',
        assumption: 'Assuming normal soil conditions suitable for standard foundations',
        risk: 'high',
        basis: 'Soil test not conducted - recommend soil investigation',
      });
    }

    // Add construction norms assumption
    if (!input.localConstructionNorms) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'tn_construction_norms',
        assumption: 'Using Tamil Nadu standard residential construction specifications',
        risk: 'low',
        basis: 'Local construction norms not specified',
      });
    }

    // Add structural strategy reasoning
    const plotArea = input.plot.area || (input.plot.width * input.plot.depth);
    let sizeDesc: string;
    if (plotArea < 1200) {
      sizeDesc = 'small (under 1200 sqft)';
    } else if (plotArea <= 2400) {
      sizeDesc = 'medium (1200-2400 sqft)';
    } else {
      sizeDesc = 'large (over 2400 sqft)';
    }

    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'structural_strategy_basis',
      assumption: `${data.structural_strategy} system recommended based on ${sizeDesc} plot size`,
      risk: 'low',
      basis: 'Standard Tamil Nadu residential construction practice',
    });

    return assumptions;
  }

  /**
   * Estimate input tokens
   */
  private estimateInputTokens(prompt: string): number {
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
    return 'ENGINEER_CLARIFICATION_ERROR';
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
 * Create a new Engineer Clarification Agent instance
 */
export function createEngineerClarificationAgent(
  config?: Partial<EngineerClarificationConfig>
): EngineerClarificationAgent {
  return new EngineerClarificationAgent(config);
}
