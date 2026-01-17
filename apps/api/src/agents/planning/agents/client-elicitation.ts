/**
 * Client Elicitation Agent (Agent 3)
 *
 * Generates intelligent questions to gather client requirements for home design.
 * Uses plot context to ask relevant, size-appropriate questions.
 *
 * Responsibilities:
 * - Generate functional requirement questions (rooms, spaces)
 * - Ask about aesthetic preferences
 * - Gather budget context
 * - Understand timeline requirements
 * - Avoid duplicate questions if existingAnswers provided
 *
 * Guardrails:
 * - NEVER assume family size or usage
 * - NEVER skip mandatory questions
 * - Always provide sensible defaults where appropriate
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
  ClientElicitationInput,
  ClientElicitationOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface ClientElicitationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: ClientElicitationConfig = {
  model: 'gemini-3-pro-preview',
  maxTokens: 4096,
  temperature: 0.3, // Slightly higher for creative question generation
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Default questions by category - used to ensure completeness
 */
const MANDATORY_QUESTIONS = {
  functional: [
    {
      id: 'num_bedrooms',
      question: 'How many bedrooms do you need?',
      defaultValue: '2',
      options: ['1', '2', '3', '4', '5+'],
    },
    {
      id: 'num_bathrooms',
      question: 'How many bathrooms do you need?',
      defaultValue: '2',
      options: ['1', '2', '3', '4+'],
    },
    {
      id: 'has_pooja',
      question: 'Do you need a dedicated pooja room?',
      defaultValue: 'Yes',
      options: ['Yes', 'No', 'Pooja corner in living room'],
    },
    {
      id: 'has_parking',
      question: 'Do you need covered car parking?',
      defaultValue: 'Yes',
      options: ['Yes, 1 car', 'Yes, 2 cars', 'No, bike parking only', 'No parking needed'],
    },
  ],
  aesthetic: [
    {
      id: 'design_style',
      question: 'What design style do you prefer?',
      defaultValue: 'Modern Tamil',
      options: ['Traditional Tamil', 'Modern Tamil', 'Contemporary', 'Minimalist'],
    },
  ],
  budget: [
    {
      id: 'budget_range',
      question: 'What is your approximate construction budget?',
      defaultValue: '30-50 lakhs',
      options: ['Under 20 lakhs', '20-30 lakhs', '30-50 lakhs', '50-80 lakhs', 'Above 80 lakhs'],
    },
  ],
};

/**
 * Size-based question recommendations
 */
const SIZE_BASED_RECOMMENDATIONS = {
  small: { // Under 1000 sqft buildable
    maxBedrooms: 2,
    maxBathrooms: 2,
    skipQuestions: ['home_office', 'guest_suite', 'home_theater'],
    suggestions: ['Consider open floor plan', 'Multi-purpose rooms recommended'],
  },
  medium: { // 1000-1500 sqft buildable
    maxBedrooms: 3,
    maxBathrooms: 3,
    skipQuestions: ['home_theater'],
    suggestions: ['Space for home office possible', 'Consider attached bathroom for master'],
  },
  large: { // Over 1500 sqft buildable
    maxBedrooms: 5,
    maxBathrooms: 4,
    skipQuestions: [],
    suggestions: ['Space for all amenities', 'Consider guest suite'],
  },
};

/**
 * System prompt for client elicitation
 */
const CLIENT_ELICITATION_PROMPT = `You are a Client Requirements Elicitation Agent for residential home design in Tamil Nadu.

## YOUR ROLE
Generate intelligent, context-aware questions to understand the client's home requirements.
Your questions will be used to gather information before designing their floor plan.

## QUESTION CATEGORIES

1. **Functional** (MANDATORY)
   - Number of bedrooms, bathrooms
   - Special rooms: pooja, study, store
   - Parking requirements
   - Kitchen preferences (separate/open)

2. **Aesthetic** (IMPORTANT)
   - Design style preference
   - Material preferences
   - Color scheme
   - Traditional vs modern elements

3. **Budget** (IMPORTANT)
   - Construction budget range
   - Material quality expectations
   - Future expansion plans

4. **Timeline** (OPTIONAL)
   - Construction start date
   - Completion deadline
   - Phased construction interest

## GUIDELINES

1. **Be Context-Aware**
   - Consider plot size when suggesting options
   - Don't ask about 4 bedrooms if plot can only fit 2
   - Adjust questions based on buildable area

2. **Use Smart Defaults**
   - Provide sensible default values based on Tamil Nadu norms
   - Most families need pooja room - default to yes
   - Consider local climate for ventilation questions

3. **Avoid Duplicates**
   - Check existingAnswers before including a question
   - Don't re-ask questions already answered

4. **Prioritize Questions**
   - Mandatory questions must always be included (unless answered)
   - Optional questions should add value, not overwhelm

## PLOT SIZE AWARENESS

- Under 1000 sqft buildable: Focus on essentials, multi-purpose spaces
- 1000-1500 sqft buildable: Standard 2-3 BHK questions
- Over 1500 sqft buildable: Can include luxury questions

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "questions": [
    {
      "id": "unique_snake_case_id",
      "question": "Clear, conversational question text",
      "type": "mandatory" | "optional",
      "category": "functional" | "aesthetic" | "budget" | "timeline",
      "reason": "Why this question matters for design",
      "defaultValue": "Sensible default for Tamil Nadu",
      "options": ["Option 1", "Option 2", "Option 3"]
    }
  ]
}`;

/**
 * Client Elicitation Agent
 *
 * Generates context-aware questions for gathering client requirements.
 */
export class ClientElicitationAgent {
  readonly agentName = 'client-elicitation' as const;
  private genAI: GoogleGenerativeAI;
  private config: ClientElicitationConfig;

  constructor(config: Partial<ClientElicitationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute client elicitation
   */
  async execute(
    input: ClientElicitationInput,
    context: DesignContext
  ): Promise<AgentResult<ClientElicitationOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Determine plot size category
      const sizeCategory = this.determineSizeCategory(input.buildableEnvelope.area);

      // Step 3: Get mandatory questions not yet answered
      const unansweredMandatory = this.getUnansweredMandatoryQuestions(
        input.existingAnswers || {}
      );

      // Step 4: Build prompt
      const prompt = this.buildPrompt(input, sizeCategory, unansweredMandatory);

      // Step 5: Call Gemini for question generation
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 6: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 7: Merge with mandatory questions
      const mergedOutput = this.mergeMandatoryQuestions(
        rawOutput,
        unansweredMandatory,
        sizeCategory
      );

      // Step 8: Validate output
      const validated = validateSchema<ClientElicitationOutput>(
        this.agentName,
        mergedOutput
      );

      if (!validated.success) {
        throw new Error(
          `Schema validation failed: ${validated.errors?.map(e => e.message).join(', ')}`
        );
      }

      // Step 9: Extract assumptions
      const assumptions = this.extractAssumptions(input, sizeCategory);

      // Step 10: Track token usage
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
        0 // This agent generates questions, doesn't have open questions
      );

      // Log question generation results
      agentLogger.info('Client elicitation complete', {
        totalQuestions: validated.data?.questions.length,
        mandatoryQuestions: validated.data?.questions.filter(q => q.type === 'mandatory').length,
        sizeCategory,
      });

      return {
        success: true,
        agentName: this.agentName,
        executionTimeMs,
        tokensUsed,
        data: validated.data,
        openQuestions: [], // This agent generates questions, doesn't have open questions
        assumptions,
        meta: {
          model: this.config.model,
          sizeCategory,
          existingAnswersCount: Object.keys(input.existingAnswers || {}).length,
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
  private validateInput(input: ClientElicitationInput): void {
    if (!input.plot) {
      throw new Error('Plot dimensions are required');
    }

    if (!input.buildableEnvelope) {
      throw new Error('Buildable envelope is required');
    }

    if (!input.buildableEnvelope.area || input.buildableEnvelope.area <= 0) {
      throw new Error('Buildable area must be a positive number');
    }
  }

  /**
   * Determine plot size category
   */
  private determineSizeCategory(buildableArea: number): 'small' | 'medium' | 'large' {
    if (buildableArea < 1000) {
      return 'small';
    } else if (buildableArea <= 1500) {
      return 'medium';
    } else {
      return 'large';
    }
  }

  /**
   * Get mandatory questions that haven't been answered
   */
  private getUnansweredMandatoryQuestions(
    existingAnswers: Record<string, string>
  ): Array<{
    id: string;
    question: string;
    category: string;
    defaultValue?: string;
    options?: string[];
  }> {
    const unanswered: Array<{
      id: string;
      question: string;
      category: string;
      defaultValue?: string;
      options?: string[];
    }> = [];

    // Check functional questions
    for (const q of MANDATORY_QUESTIONS.functional) {
      if (!existingAnswers[q.id]) {
        unanswered.push({ ...q, category: 'functional' });
      }
    }

    // Check aesthetic questions
    for (const q of MANDATORY_QUESTIONS.aesthetic) {
      if (!existingAnswers[q.id]) {
        unanswered.push({ ...q, category: 'aesthetic' });
      }
    }

    // Check budget questions
    for (const q of MANDATORY_QUESTIONS.budget) {
      if (!existingAnswers[q.id]) {
        unanswered.push({ ...q, category: 'budget' });
      }
    }

    return unanswered;
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: ClientElicitationInput,
    sizeCategory: 'small' | 'medium' | 'large',
    unansweredMandatory: Array<{ id: string; question: string; category: string }>
  ): string {
    const recommendations = SIZE_BASED_RECOMMENDATIONS[sizeCategory];
    const existingAnswersList = Object.entries(input.existingAnswers || {})
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    return `${SYSTEM_RULES}

${CLIENT_ELICITATION_PROMPT}

## CONTEXT

**Plot Dimensions:**
- Width: ${input.plot.width} feet
- Depth: ${input.plot.depth} feet
- Total Plot Area: ${input.plot.area} sq.ft.

**Buildable Envelope:**
- Width: ${input.buildableEnvelope.width} feet
- Depth: ${input.buildableEnvelope.depth} feet
- Buildable Area: ${input.buildableEnvelope.area} sq.ft.

**Size Category:** ${sizeCategory.toUpperCase()}
- Maximum recommended bedrooms: ${recommendations.maxBedrooms}
- Maximum recommended bathrooms: ${recommendations.maxBathrooms}
- Design suggestions: ${recommendations.suggestions.join(', ')}

**Already Answered Questions:**
${existingAnswersList || 'None'}

**Mandatory Questions Still Needed:**
${unansweredMandatory.map(q => `- [${q.category}] ${q.id}: ${q.question}`).join('\n') || 'All mandatory questions answered'}

## TASK

Generate a comprehensive list of questions to gather client requirements.
1. Include all mandatory questions that haven't been answered
2. Add relevant optional questions based on plot size
3. Provide sensible defaults for Tamil Nadu context
4. Skip questions that don't make sense for the plot size

Remember:
- For ${sizeCategory} plots, skip questions about: ${recommendations.skipQuestions.join(', ') || 'none'}
- Adjust bedroom/bathroom options based on max recommendations
- All questions must have clear options when applicable

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
      logger.error('Failed to parse client elicitation response', {
        content: content.slice(0, 500),
      });
      throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}...`);
    }
  }

  /**
   * Merge mandatory questions to ensure completeness
   */
  private mergeMandatoryQuestions(
    rawOutput: unknown,
    unansweredMandatory: Array<{
      id: string;
      question: string;
      category: string;
      defaultValue?: string;
      options?: string[];
    }>,
    sizeCategory: 'small' | 'medium' | 'large'
  ): unknown {
    const output = rawOutput as { questions?: unknown[] };
    const recommendations = SIZE_BASED_RECOMMENDATIONS[sizeCategory];

    // Ensure questions array exists
    if (!output.questions) {
      output.questions = [];
    }

    const existingIds = new Set(
      (output.questions as Array<{ id: string }>).map(q => q.id)
    );

    // Add any missing mandatory questions
    for (const mandatory of unansweredMandatory) {
      if (!existingIds.has(mandatory.id)) {
        // Adjust options based on size category
        let adjustedOptions = mandatory.options;

        if (mandatory.id === 'num_bedrooms' && mandatory.options) {
          adjustedOptions = mandatory.options.filter(opt => {
            const num = parseInt(opt);
            return isNaN(num) || num <= recommendations.maxBedrooms;
          });
        }

        if (mandatory.id === 'num_bathrooms' && mandatory.options) {
          adjustedOptions = mandatory.options.filter(opt => {
            const num = parseInt(opt);
            return isNaN(num) || num <= recommendations.maxBathrooms;
          });
        }

        (output.questions as unknown[]).push({
          id: mandatory.id,
          question: mandatory.question,
          type: 'mandatory',
          category: mandatory.category,
          reason: 'Required for floor plan design',
          defaultValue: mandatory.defaultValue,
          options: adjustedOptions,
        });
      }
    }

    return output;
  }

  /**
   * Extract assumptions
   */
  private extractAssumptions(
    input: ClientElicitationInput,
    sizeCategory: 'small' | 'medium' | 'large'
  ): Assumption[] {
    const assumptions: Assumption[] = [];

    // Size category assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'size_category',
      assumption: `Plot classified as "${sizeCategory}" based on ${input.buildableEnvelope.area} sq.ft. buildable area`,
      risk: 'low',
      basis: 'Standard size classification for Tamil Nadu residential plots',
    });

    // Default preferences assumption
    if (!input.existingAnswers || Object.keys(input.existingAnswers).length === 0) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'tamil_defaults',
        assumption: 'Using Tamil Nadu residential preferences as defaults (pooja room, covered parking)',
        risk: 'low',
        basis: 'Regional design norms',
      });
    }

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
    return 'CLIENT_ELICITATION_ERROR';
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
 * Create a new Client Elicitation Agent instance
 */
export function createClientElicitationAgent(
  config?: Partial<ClientElicitationConfig>
): ClientElicitationAgent {
  return new ClientElicitationAgent(config);
}
