/**
 * Diagram Interpreter Agent (Agent 1)
 *
 * Converts human-drawn site sketches into structured, machine-readable plot data.
 * Uses Gemini Vision API for image analysis.
 *
 * Responsibilities:
 * - Extract plot dimensions from sketch
 * - Identify orientation and road access
 * - Detect setback annotations
 * - Flag unclear or ambiguous data
 *
 * Guardrails:
 * - NEVER guess missing dimensions
 * - NEVER infer room usage
 * - Always flag unclear data in open_questions
 */

import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import type { DesignContext } from '../types/design-context';
import type {
  AgentResult,
  OpenQuestion,
  Assumption,
  TokenUsage,
  AgentError,
} from '../types/agent-result';
import type {
  DiagramInterpreterInput,
  DiagramInterpreterOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface DiagramInterpreterConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: DiagramInterpreterConfig = {
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
  temperature: 0.2, // Low temperature for precise extraction
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * System prompt for diagram interpretation
 */
const DIAGRAM_INTERPRETER_PROMPT = `You are a Diagram Interpretation Agent specializing in architectural site sketches.

## YOUR ROLE
Convert hand-drawn or rough site sketches into structured, machine-readable plot data.
You analyze images to extract site-level information ONLY.

## WHAT TO EXTRACT
1. **Plot Dimensions**: Width and depth of the plot
2. **Orientation**: Which direction the plot faces (based on road/compass)
3. **Road Access**: Which side has road access and road width
4. **Setbacks**: Required setbacks from boundaries (if marked)
5. **Annotations**: Any text notes on the sketch

## CRITICAL RULES
1. **NEVER GUESS** - If a dimension is unclear, put it in open_questions
2. **NEVER INFER** - Don't assume room layouts or internal usage
3. **BE PRECISE** - Extract exactly what you see, nothing more
4. **FLAG UNCERTAINTY** - Use confidence score honestly (0.0-1.0)

## HANDLING UNCLEAR DATA
- If plot width is unclear: Add to open_questions with id "dim_width"
- If plot depth is unclear: Add to open_questions with id "dim_depth"
- If orientation is unclear: Add to open_questions with id "orientation"
- If setbacks are not marked: Make reasonable assumption and note in assumptions

## MEASUREMENT INTERPRETATION
- Look for dimension lines with numbers
- Check for unit labels (feet, meters, ft, m, ')
- Default to FEET if no unit specified (flag as assumption)
- North arrow or road position indicates orientation

## OUTPUT FORMAT
Respond with ONLY valid JSON matching this schema:
{
  "plot": {
    "width": <number or null if unclear>,
    "depth": <number or null if unclear>,
    "area": <calculated or null>,
    "unit": "feet" or "meters"
  },
  "setbacks": {
    "front": <number or null>,
    "rear": <number or null>,
    "left": <number or null>,
    "right": <number or null>
  },
  "road": {
    "side": "north" | "south" | "east" | "west" | null,
    "width": <number or null>
  },
  "orientation": "north" | "south" | "east" | "west" | null,
  "annotations": ["list of text notes found on sketch"],
  "confidence": <0.0 to 1.0>,
  "open_questions": [
    {
      "id": "unique_id",
      "question": "Clear question for the user",
      "type": "mandatory" | "optional",
      "reason": "Why this is needed for design"
    }
  ]
}`;

/**
 * Diagram Interpreter Agent
 *
 * Analyzes site sketches using Gemini Vision API.
 */
export class DiagramInterpreterAgent {
  readonly agentName = 'diagram-interpreter' as const;
  private genAI: GoogleGenerativeAI;
  private config: DiagramInterpreterConfig;

  constructor(config: Partial<DiagramInterpreterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute diagram interpretation
   */
  async execute(
    input: DiagramInterpreterInput,
    context: DesignContext
  ): Promise<AgentResult<DiagramInterpreterOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Build vision parts
      const parts = await this.buildVisionParts(input);

      // Step 3: Call Gemini Vision with retry
      const response = await retryWithBackoff(
        () => this.callGeminiVision(parts),
        this.config.retryConfig
      );

      // Step 4: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 5: Validate output
      const validated = validateSchema<DiagramInterpreterOutput>(
        this.agentName,
        rawOutput
      );

      if (!validated.success) {
        throw new Error(
          `Schema validation failed: ${validated.errors?.map(e => e.message).join(', ')}`
        );
      }

      // Step 6: Extract open questions and assumptions
      const openQuestions = this.extractOpenQuestions(validated.data!);
      const assumptions = this.extractAssumptions(validated.data!);

      // Step 7: Track token usage (Gemini doesn't return exact tokens, estimate)
      const tokensUsed: TokenUsage = {
        input: this.estimateInputTokens(input),
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

      // Log extraction results
      agentLogger.info('Diagram interpretation complete', {
        plotExtracted: !!validated.data?.plot?.width,
        confidence: validated.data?.confidence,
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
          confidence: validated.data?.confidence,
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
  private validateInput(input: DiagramInterpreterInput): void {
    if (!input.imageUrl && !input.imageBase64) {
      throw new Error('Either imageUrl or imageBase64 is required');
    }

    if (input.imageBase64 && !input.mimeType) {
      throw new Error('mimeType is required when using imageBase64');
    }

    // Validate base64 format
    if (input.imageBase64) {
      // Remove data URL prefix if present
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, '');

      // Check if it's valid base64
      try {
        if (typeof atob === 'function') {
          atob(base64Data.slice(0, 100)); // Test first 100 chars
        }
      } catch {
        throw new Error('Invalid base64 image data');
      }
    }
  }

  /**
   * Build vision parts for Gemini
   */
  private async buildVisionParts(
    input: DiagramInterpreterInput
  ): Promise<Part[]> {
    const parts: Part[] = [];

    // Add image part
    if (input.imageBase64) {
      // Clean up base64 string
      let base64Data = input.imageBase64;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }

      parts.push({
        inlineData: {
          mimeType: input.mimeType || 'image/png',
          data: base64Data,
        },
      });
    } else if (input.imageUrl) {
      // Fetch image from URL and convert to base64
      const response = await fetch(input.imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'image/png';

      parts.push({
        inlineData: {
          mimeType: contentType,
          data: base64Data,
        },
      });
    }

    // Add text prompt
    parts.push({
      text: `${SYSTEM_RULES}

${DIAGRAM_INTERPRETER_PROMPT}

Analyze this site sketch and extract plot information.

Instructions:
1. Look for dimension markings (width, depth)
2. Identify road access and orientation
3. Find any setback annotations
4. Note any text labels or annotations
5. If anything is unclear, add it to open_questions

Remember:
- Do NOT guess missing dimensions
- Do NOT infer room layouts
- Flag ALL unclear data
- Calculate area only if both width and depth are clear

Respond with ONLY valid JSON.`,
    });

    return parts;
  }

  /**
   * Call Gemini Vision API
   */
  private async callGeminiVision(parts: Part[]): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
    });

    const result = await model.generateContent(parts);
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
      const parsed = JSON.parse(content);

      // Calculate area if not provided but dimensions are
      if (parsed.plot && parsed.plot.width && parsed.plot.depth && !parsed.plot.area) {
        parsed.plot.area = parsed.plot.width * parsed.plot.depth;
      }

      return parsed;
    } catch (parseError) {
      logger.error('Failed to parse diagram interpretation response', {
        content: content.slice(0, 500),
      });
      throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}...`);
    }
  }

  /**
   * Extract open questions
   */
  private extractOpenQuestions(data: DiagramInterpreterOutput): OpenQuestion[] {
    const questions: OpenQuestion[] = [];

    // Add questions from response
    if (data.open_questions) {
      for (const q of data.open_questions) {
        questions.push({
          agentSource: this.agentName,
          questionId: q.id || `${this.agentName}-${questions.length + 1}`,
          question: q.question,
          type: q.type || 'mandatory',
          reason: q.reason || 'Required for accurate design',
        });
      }
    }

    // Auto-generate questions for missing critical data
    if (!data.plot.width) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'dim_width',
        question: 'What is the width of your plot (in feet)?',
        type: 'mandatory',
        reason: 'Plot width is required to calculate buildable area',
      });
    }

    if (!data.plot.depth) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'dim_depth',
        question: 'What is the depth of your plot (in feet)?',
        type: 'mandatory',
        reason: 'Plot depth is required to calculate buildable area',
      });
    }

    if (!data.orientation && !data.road.side) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'orientation',
        question: 'Which direction does your plot face? (North/South/East/West)',
        type: 'mandatory',
        reason: 'Orientation is essential for Vastu and eco-design planning',
      });
    }

    return questions;
  }

  /**
   * Extract assumptions
   */
  private extractAssumptions(data: DiagramInterpreterOutput): Assumption[] {
    const assumptions: Assumption[] = [];

    // Default unit assumption
    if (data.plot.unit === 'feet') {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'unit_feet',
        assumption: 'Dimensions are in feet (standard for Indian residential plots)',
        risk: 'low',
        basis: 'No unit specified, using regional default',
      });
    }

    // Setback assumption if not all specified
    const setbacks = data.setbacks;
    if (!setbacks.front || !setbacks.rear || !setbacks.left || !setbacks.right) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'setbacks_default',
        assumption: 'Using Tamil Nadu residential setback defaults where not specified',
        risk: 'medium',
        basis: 'Setbacks not visible in sketch',
      });
    }

    // Low confidence warning
    if (data.confidence < 0.7) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'low_confidence',
        assumption: 'Sketch quality may affect extraction accuracy',
        risk: 'high',
        basis: `Confidence score: ${(data.confidence * 100).toFixed(0)}%`,
      });
    }

    return assumptions;
  }

  /**
   * Estimate input tokens (rough approximation for Gemini)
   */
  private estimateInputTokens(input: DiagramInterpreterInput): number {
    // Base tokens for system prompt and instructions
    let tokens = 1500;

    // Add tokens for image (Gemini charges based on image size)
    if (input.imageBase64) {
      // Rough estimate: ~250 tokens per 1KB of base64
      const base64Size = input.imageBase64.length;
      tokens += Math.ceil(base64Size / 4000) * 250;
    }

    return tokens;
  }

  /**
   * Estimate output tokens (rough approximation)
   */
  private estimateOutputTokens(responseText: string): number {
    // Rough estimate: ~1 token per 4 characters
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
    return 'DIAGRAM_INTERPRETATION_ERROR';
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
 * Create a new Diagram Interpreter Agent instance
 */
export function createDiagramInterpreterAgent(
  config?: Partial<DiagramInterpreterConfig>
): DiagramInterpreterAgent {
  return new DiagramInterpreterAgent(config);
}
