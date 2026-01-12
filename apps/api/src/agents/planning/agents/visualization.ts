/**
 * Visualization Agent (Agent 12)
 *
 * Generates detailed render prompts for floor plan visualization.
 * These prompts will be used by the Floor Plan Image Generator agent
 * to create AI-generated images of the floor plan and spaces.
 *
 * Responsibilities:
 * - Create architectural-style floor plan prompts
 * - Generate 3D rendering prompts for key spaces
 * - Include eco-design elements and materials
 * - Incorporate Vastu and Tamil Nadu architectural style
 *
 * Guardrails:
 * - MUST include room dimensions and layout
 * - MUST include eco-design features (courtyard, veranda)
 * - Prompts must be specific enough for AI image generation
 * - Include traditional Tamil Nadu architectural elements
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
  VisualizationInput,
  VisualizationOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { SYSTEM_RULES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface VisualizationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: VisualizationConfig = {
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
  temperature: 0.7, // Higher temperature for creative prompts
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * System prompt for visualization
 */
const SYSTEM_PROMPT = `${SYSTEM_RULES}

You are a VISUALIZATION PROMPT SPECIALIST for Tamil Nadu residential architecture.
Your role is to create detailed, specific prompts for AI image generation.

## CRITICAL: Dimension Accuracy Requirements

**MUST** include exact dimensions with explicit "MUST show exactly" wording:
- Plot dimensions MUST be displayed exactly as provided (e.g., "MUST show exactly 43'-0" × 41'-0" total plot")
- Buildable area MUST match provided values exactly
- Room dimensions MUST be labeled with precise feet/inches values
- NEVER round or approximate dimensions in the generated prompts

## Prompt Guidelines

### Floor Plan Prompts
- Use architectural drawing style
- Include room labels with EXACT dimensions (e.g., "12'-0" × 14'-0"")
- Show walls, doors, windows
- Include courtyard and veranda
- Add compass direction indicator
- Clean, professional 2D floor plan view
- MANDATORY: Display scale ruler for verification (e.g., "Scale: 1/4" = 1'-0"")
- MANDATORY: Show plot boundary dimensions in header text

### 3D Rendering Prompts
- Photorealistic or architectural visualization style
- Tamil Nadu architectural elements (sloped roof, courtyard, veranda)
- Natural lighting showing eco-design features
- Material textures (brick, clay tiles, stone floors)
- Tropical landscaping

### Style Elements
- Traditional Tamil Nadu architecture
- Eco-friendly natural materials
- Courtyard as central feature
- Veranda with columns
- Sloped clay tile roof
- Natural ventilation openings

## Output Format

Return ONLY valid JSON:
{
  "floor_plan_prompt": "Detailed prompt for 2D floor plan with EXACT dimensions...",
  "courtyard_prompt": "Detailed prompt for 3D courtyard rendering...",
  "exterior_prompt": "Detailed prompt for 3D exterior view...",
  "interior_prompt": "Detailed prompt for 3D interior rendering..."
}`;

/**
 * Visualization Agent
 *
 * Generates detailed render prompts for floor plan visualization.
 */
export class VisualizationAgent {
  readonly agentName = 'visualization' as const;
  private genAI: GoogleGenerativeAI;
  private config: VisualizationConfig;

  constructor(config: Partial<VisualizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute visualization prompt generation
   */
  async execute(
    input: VisualizationInput,
    context: DesignContext
  ): Promise<AgentResult<VisualizationOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Build prompt
      const prompt = this.buildPrompt(input, context);

      // Step 3: Call Gemini
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 4: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 5: Validate output
      const validated = validateSchema<VisualizationOutput>(
        this.agentName,
        rawOutput
      );

      if (!validated.success) {
        // Use fallback prompts if validation fails
        const fallbackOutput = this.generateFallbackPrompts(input, context);
        return {
          success: true,
          agentName: this.agentName,
          executionTimeMs: Date.now() - startTime,
          tokensUsed: { input: 0, output: 0, total: 0 },
          data: fallbackOutput,
          openQuestions: [],
          assumptions: [],
          meta: {
            model: 'fallback',
            usedFallback: true,
          },
        };
      }

      // Step 6: Calculate token usage
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
        0
      );

      return {
        success: true,
        agentName: this.agentName,
        executionTimeMs,
        tokensUsed,
        data: validated.data,
        openQuestions: [],
        assumptions: [],
        meta: {
          model: this.config.model,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      agentLogger.agentFailed(this.agentName, context.sessionId, err);

      const agentError: AgentError = {
        code: 'VISUALIZATION_ERROR',
        message: err.message,
        retryable: true,
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
  private validateInput(input: VisualizationInput): void {
    if (!input.rooms || input.rooms.length === 0) {
      throw new Error('Rooms data is required for visualization');
    }
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: VisualizationInput,
    context: DesignContext
  ): string {
    const roomList = input.rooms
      .map(r => `- ${r.name}: ${r.width}x${r.depth} ft (${r.areaSqft} sqft) - ${r.zone} zone`)
      .join('\n');

    const materials = input.materials?.join(', ') || 'brick, clay tiles, stone';
    const ecoElements = input.ecoElements?.join(', ') || 'courtyard, cross-ventilation';

    const plotInfo = context.plot
      ? `Plot: ${context.plot.width}x${context.plot.depth} ${context.plot.unit || 'feet'}`
      : 'Plot: 40x60 feet (standard)';

    return `${SYSTEM_PROMPT}

## Design Context

**Plot Information:**
${plotInfo}
- Orientation: ${input.orientation || 'east'}-facing
- Style: Traditional Tamil Nadu residential with eco-design

**Room Layout:**
${roomList}

**Eco-Design Elements:**
${ecoElements}

**Materials:**
${materials}

**Courtyard Details:**
- Central courtyard for natural ventilation
- ${context.courtyardSize ? `${context.courtyardSize.width}x${context.courtyardSize.depth} feet` : 'Minimum 8% of plot area'}

**Veranda Details:**
- ${context.verandaSpec ? `${context.verandaSpec.width} feet wide on ${context.verandaSpec.sides?.join(', ')} sides` : 'Full-length veranda on entry side'}

## Your Task

Create 4 detailed AI image generation prompts:

1. **Floor Plan Prompt**: 2D architectural floor plan with all rooms labeled, dimensions shown, furniture layout indicators, and compass direction.

2. **Courtyard Prompt**: 3D photorealistic view of the central courtyard showing Tamil Nadu traditional architecture, natural lighting, plants, and surrounding rooms.

3. **Exterior Prompt**: 3D exterior view of the house showing the entrance, veranda, sloped roof with clay tiles, and traditional architectural elements.

4. **Interior Prompt**: 3D interior view of the living room looking towards the courtyard, showing natural ventilation, traditional materials, and comfortable living space.

Return your prompts as valid JSON.`;
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
    const response = result.response;
    return response.text();
  }

  /**
   * Parse Gemini response
   */
  private parseResponse(response: string): VisualizationOutput {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse visualization response: ${(e as Error).message}`);
    }
  }

  /**
   * Generate fallback prompts if LLM fails
   */
  private generateFallbackPrompts(
    input: VisualizationInput,
    context: DesignContext
  ): VisualizationOutput {
    const roomList = input.rooms
      .map(r => `${r.name} (MUST show exactly ${r.width}'×${r.depth}')`)
      .join(', ');

    const plotDims = context.plot
      ? `MUST show exactly ${context.plot.width}'×${context.plot.depth}' total plot`
      : 'MUST show exactly 40\'×60\' total plot';

    const buildableDims = context.plot
      ? `Buildable area: MUST show exactly ${context.plot.width - 5}'×${context.plot.depth - 5}' (after setbacks)`
      : '';

    return {
      floor_plan_prompt: `Professional architectural 2D floor plan drawing of a traditional Tamil Nadu residential house.

CRITICAL DIMENSION REQUIREMENTS:
- ${plotDims}
- ${buildableDims}
- ${input.orientation || 'East'}-facing entrance

ROOM LAYOUT (MUST display exact dimensions):
${roomList}

Central courtyard (mutram) for natural ventilation. Full-length veranda (thinnai) at entrance.

DRAWING REQUIREMENTS:
- Clean professional architectural drawing style
- Room labels with EXACT dimensions in feet-inches format
- Door and window symbols
- Wall thickness shown (9" external, 4.5" internal)
- Compass rose indicating North direction
- MANDATORY: Scale ruler showing 1/4" = 1'-0"
- MANDATORY: Header text displaying exact plot dimensions
- Black lines on white background.`,

      courtyard_prompt: `Photorealistic 3D rendering of a traditional Tamil Nadu house courtyard (mutram). Central open-to-sky courtyard with Tulsi plant in center. Surrounding rooms visible with terracotta floor tiles. Natural lighting from above creating soft shadows. Traditional pillared corridors around courtyard. Brick walls with lime wash. Green plants in corners. Peaceful, serene atmosphere.`,

      exterior_prompt: `Photorealistic 3D exterior view of a traditional Tamil Nadu residential house. ${input.orientation || 'East'}-facing entrance with full-length veranda supported by decorative pillars. Sloped roof with clay tiles (mangalore tiles). Brick walls with traditional finish. Wooden entrance door with brass fittings. Compound wall with simple gate. Tropical landscaping with coconut palm. Golden hour lighting.`,

      interior_prompt: `Photorealistic 3D interior view of traditional Tamil Nadu house living room looking towards central courtyard. Terracotta floor tiles, lime-washed white walls. Wooden ceiling with exposed beams. Large windows with wooden shutters allowing cross-ventilation. Traditional furniture with modern comfort. Natural daylight streaming through courtyard. Ceiling fan. Decorative brass lamps.`,
    };
  }
}

/**
 * Factory function to create VisualizationAgent
 */
export function createVisualizationAgent(
  config?: Partial<VisualizationConfig>
): VisualizationAgent {
  return new VisualizationAgent(config);
}
