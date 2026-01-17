/**
 * Vastu Compliance Agent (Agent 5)
 *
 * Recommends room placements based on Vastu Shastra principles
 * while respecting buildability and regulatory constraints.
 *
 * Responsibilities:
 * - Recommend optimal room zones based on orientation
 * - Identify conflicts between Vastu and other requirements
 * - Document acceptable deviations with reasoning
 * - Prioritize: Buildability > Regulations > Eco > Vastu
 *
 * Guardrails:
 * - NEVER override setbacks or regulations for Vastu
 * - NEVER compromise eco-design principles
 * - ALWAYS document conflicts and resolutions
 * - Vastu is advisory, not mandatory
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
  VastuComplianceInput,
  VastuComplianceOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES, VASTU_GUIDELINES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface VastuComplianceConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: VastuComplianceConfig = {
  model: 'gemini-3-pro-preview',
  maxTokens: 4096,
  temperature: 0.2, // Low temperature for consistent recommendations
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Vastu zone recommendations by direction
 * Based on traditional Vastu Shastra for Tamil Nadu residential homes
 */
const VASTU_ZONE_DEFAULTS: Record<string, {
  ideal: string[];
  acceptable: string[];
  avoid: string[];
  element: string;
  deity: string;
}> = {
  northeast: {
    ideal: ['pooja', 'water-element', 'meditation'],
    acceptable: ['living', 'study', 'open-space'],
    avoid: ['toilet', 'kitchen', 'bedroom', 'staircase'],
    element: 'Water',
    deity: 'Ishaanya (Lord Shiva)',
  },
  east: {
    ideal: ['main-entrance', 'living', 'study'],
    acceptable: ['dining', 'bathroom', 'veranda'],
    avoid: ['toilet', 'kitchen', 'store'],
    element: 'Air',
    deity: 'Indra',
  },
  southeast: {
    ideal: ['kitchen', 'electrical-room', 'generator'],
    acceptable: ['bathroom', 'utility'],
    avoid: ['bedroom', 'pooja', 'water-storage'],
    element: 'Fire',
    deity: 'Agni',
  },
  south: {
    ideal: ['master-bedroom', 'storage', 'staircase'],
    acceptable: ['dining', 'children-room'],
    avoid: ['main-entrance', 'pooja', 'water-element'],
    element: 'Earth',
    deity: 'Yama',
  },
  southwest: {
    ideal: ['master-bedroom', 'heavy-storage', 'overhead-tank'],
    acceptable: ['study', 'office'],
    avoid: ['toilet', 'kitchen', 'main-entrance', 'children-room'],
    element: 'Earth',
    deity: 'Nairutya',
  },
  west: {
    ideal: ['dining', 'children-room', 'study'],
    acceptable: ['bedroom', 'store', 'staircase'],
    avoid: ['main-entrance', 'kitchen', 'pooja'],
    element: 'Water',
    deity: 'Varuna',
  },
  northwest: {
    ideal: ['guest-room', 'garage', 'utility', 'servant-room'],
    acceptable: ['bathroom', 'store', 'children-room'],
    avoid: ['master-bedroom', 'pooja', 'kitchen'],
    element: 'Air',
    deity: 'Vayu',
  },
  north: {
    ideal: ['living', 'treasury', 'office', 'open-space'],
    acceptable: ['dining', 'children-room', 'veranda'],
    avoid: ['toilet', 'staircase', 'heavy-storage'],
    element: 'Water',
    deity: 'Kubera',
  },
  center: {
    ideal: ['courtyard', 'open-to-sky', 'brahmasthana'],
    acceptable: ['living', 'circulation'],
    avoid: ['toilet', 'kitchen', 'bedroom', 'pillar', 'beam'],
    element: 'Ether/Space',
    deity: 'Brahma',
  },
};

/**
 * Common Vastu conflicts and resolutions
 */
const COMMON_CONFLICTS: Array<{
  scenario: string;
  conflict: string;
  severity: 'minor' | 'moderate' | 'major';
  resolution: string;
}> = [
  {
    scenario: 'kitchen_northeast',
    conflict: 'Kitchen in Northeast violates Vastu (fire in water zone)',
    severity: 'major',
    resolution: 'Relocate kitchen to Southeast or use Southeast corner of available space',
  },
  {
    scenario: 'toilet_northeast',
    conflict: 'Toilet in Northeast is highly inauspicious',
    severity: 'major',
    resolution: 'Move toilet to Northwest or West; use Northeast for pooja/water element',
  },
  {
    scenario: 'bedroom_northeast',
    conflict: 'Bedroom in Northeast not recommended',
    severity: 'moderate',
    resolution: 'Use as study/meditation room instead, or accept deviation for small plots',
  },
  {
    scenario: 'entrance_south',
    conflict: 'South-facing main entrance not ideal in Vastu',
    severity: 'moderate',
    resolution: 'If road is on South, entrance is acceptable; add threshold protection',
  },
  {
    scenario: 'staircase_center',
    conflict: 'Staircase in center (Brahmasthana) not recommended',
    severity: 'moderate',
    resolution: 'Position staircase in South, West, or Southwest corner',
  },
  {
    scenario: 'courtyard_absent',
    conflict: 'Absence of central open space affects energy flow',
    severity: 'minor',
    resolution: 'Eco-design requires courtyard - will satisfy both Vastu and ventilation',
  },
];

/**
 * System prompt for Vastu compliance
 */
const VASTU_COMPLIANCE_PROMPT = `You are a Vastu Shastra Compliance Agent for Tamil Nadu residential homes.

## YOUR ROLE
Recommend room placements based on Vastu principles while respecting practical constraints.
Vastu is ADVISORY - it must NEVER override buildability, regulations, or eco-design.

## PRIORITY ORDER (MUST FOLLOW)
1. **Buildability** - Must be physically constructible
2. **Regulations** - Must comply with setbacks and building codes
3. **Eco-Design** - Must include courtyard, ventilation, rainwater harvesting
4. **Vastu** - Guide room placement within above constraints

## VASTU DIRECTIONS AND RECOMMENDATIONS

### Northeast (Ishaanya) - Water Element
- IDEAL: Pooja room, water storage, meditation space
- AVOID: Toilet, kitchen, bedroom, heavy items

### East (Indra) - Air Element
- IDEAL: Main entrance, living room, study
- AVOID: Toilet, store, kitchen

### Southeast (Agni) - Fire Element
- IDEAL: Kitchen, electrical room
- AVOID: Bedroom, pooja, water storage

### South (Yama) - Earth Element
- IDEAL: Master bedroom, storage, staircase
- AVOID: Main entrance (unless road-facing), water elements

### Southwest (Nairutya) - Earth Element
- IDEAL: Master bedroom, heavy storage, overhead tank
- AVOID: Children's room, main entrance, toilet

### West (Varuna) - Water Element
- IDEAL: Dining, children's room, study
- AVOID: Main entrance, kitchen

### Northwest (Vayu) - Air Element
- IDEAL: Guest room, garage, servant room, utility
- AVOID: Master bedroom, pooja

### North (Kubera) - Water Element
- IDEAL: Living room, treasury/safe, office
- AVOID: Toilet, heavy storage, staircase

### Center (Brahmasthana) - Ether Element
- IDEAL: Open courtyard, light well
- AVOID: Any construction, pillars, toilets

## HANDLING CONFLICTS

When Vastu conflicts with other requirements:
1. Document the conflict clearly
2. Assess severity (minor/moderate/major)
3. Propose a practical resolution
4. Mark deviation as acceptable if necessary for buildability/regulations

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "recommended_zones": {
    "northeast": ["pooja", "water-storage"],
    "east": ["main-entrance", "living"],
    "southeast": ["kitchen"],
    "south": ["master-bedroom"],
    "southwest": ["storage"],
    "west": ["dining", "children-room"],
    "northwest": ["guest-room", "utility"],
    "north": ["office", "treasury"],
    "center": ["courtyard"]
  },
  "conflicts": [
    {
      "conflict": "Description of the conflict",
      "severity": "minor" | "moderate" | "major",
      "resolution": "Proposed resolution"
    }
  ],
  "acceptable_deviations": [
    {
      "deviation": "What Vastu principle is being deviated from",
      "reason": "Why this deviation is necessary/acceptable",
      "acceptable": true | false
    }
  ],
  "open_questions": [
    {
      "id": "unique_id",
      "question": "Question for the client",
      "type": "mandatory" | "optional",
      "reason": "Why this information is needed"
    }
  ]
}`;

/**
 * Vastu Compliance Agent
 *
 * Recommends room placements based on Vastu Shastra principles.
 */
export class VastuComplianceAgent {
  readonly agentName = 'vastu-compliance' as const;
  private genAI: GoogleGenerativeAI;
  private config: VastuComplianceConfig;

  constructor(config: Partial<VastuComplianceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute Vastu compliance check
   */
  async execute(
    input: VastuComplianceInput,
    context: DesignContext
  ): Promise<AgentResult<VastuComplianceOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Pre-calculate zone recommendations
      const preRecommendations = this.preCalculateZones(input);

      // Step 3: Build prompt
      const prompt = this.buildPrompt(input, preRecommendations);

      // Step 4: Call Gemini for Vastu analysis
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 5: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 6: Merge with pre-calculated recommendations
      const mergedOutput = this.mergePreCalculatedValues(rawOutput, preRecommendations);

      // Step 7: Validate output
      const validated = validateSchema<VastuComplianceOutput>(
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

      // Log Vastu analysis results
      agentLogger.info('Vastu compliance analysis complete', {
        orientation: input.orientation,
        conflictsCount: validated.data?.conflicts.length,
        deviationsCount: validated.data?.acceptable_deviations.length,
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
          orientation: input.orientation,
          hasPooja: input.requirements.hasPooja,
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
  private validateInput(input: VastuComplianceInput): void {
    if (!input.orientation) {
      throw new Error('Plot orientation is required for Vastu analysis');
    }

    const validOrientations: Direction[] = ['north', 'south', 'east', 'west'];
    if (!validOrientations.includes(input.orientation)) {
      throw new Error(`Invalid orientation: ${input.orientation}. Must be north, south, east, or west`);
    }

    if (!input.buildableEnvelope) {
      throw new Error('Buildable envelope is required');
    }

    if (!input.requirements) {
      throw new Error('Requirements (bedrooms, hasPooja) are required');
    }
  }

  /**
   * Pre-calculate zone recommendations based on orientation
   */
  private preCalculateZones(input: VastuComplianceInput): {
    zones: VastuComplianceOutput['recommended_zones'];
    potentialConflicts: Array<{ conflict: string; severity: 'minor' | 'moderate' | 'major' }>;
  } {
    const zones: VastuComplianceOutput['recommended_zones'] = {
      northeast: [...VASTU_ZONE_DEFAULTS.northeast.ideal],
      east: [...VASTU_ZONE_DEFAULTS.east.ideal],
      southeast: [...VASTU_ZONE_DEFAULTS.southeast.ideal],
      south: [...VASTU_ZONE_DEFAULTS.south.ideal],
      southwest: [...VASTU_ZONE_DEFAULTS.southwest.ideal],
      west: [...VASTU_ZONE_DEFAULTS.west.ideal],
      northwest: [...VASTU_ZONE_DEFAULTS.northwest.ideal],
      north: [...VASTU_ZONE_DEFAULTS.north.ideal],
      center: [...VASTU_ZONE_DEFAULTS.center.ideal],
    };

    const potentialConflicts: Array<{ conflict: string; severity: 'minor' | 'moderate' | 'major' }> = [];

    // Adjust based on orientation (entrance direction)
    if (input.orientation === 'south') {
      potentialConflicts.push({
        conflict: 'South-facing plot - main entrance in South',
        severity: 'moderate',
      });
      // Move entrance recommendation to South
      zones.south = ['main-entrance', ...zones.south.filter(z => z !== 'main-entrance')];
      zones.east = zones.east.filter(z => z !== 'main-entrance');
    }

    if (input.orientation === 'west') {
      potentialConflicts.push({
        conflict: 'West-facing plot - main entrance in West',
        severity: 'minor',
      });
      zones.west = ['main-entrance', ...zones.west.filter(z => z !== 'main-entrance')];
      zones.east = zones.east.filter(z => z !== 'main-entrance');
    }

    // Add pooja room if required
    if (input.requirements.hasPooja) {
      if (!zones.northeast.includes('pooja')) {
        zones.northeast.unshift('pooja');
      }
    }

    // Adjust bedroom placements based on count
    if (input.requirements.bedrooms >= 2) {
      // Master in Southwest, second in South or West
      if (!zones.southwest.includes('master-bedroom')) {
        zones.southwest.unshift('master-bedroom');
      }
      if (!zones.west.includes('bedroom')) {
        zones.west.push('bedroom');
      }
    }

    if (input.requirements.bedrooms >= 3) {
      // Add third bedroom option
      if (!zones.northwest.includes('bedroom')) {
        zones.northwest.push('bedroom');
      }
    }

    // Small plot conflict - may need compromises
    if (input.buildableEnvelope.area < 800) {
      potentialConflicts.push({
        conflict: 'Small buildable area may require Vastu compromises',
        severity: 'minor',
      });
    }

    return { zones, potentialConflicts };
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: VastuComplianceInput,
    preRecommendations: ReturnType<typeof this.preCalculateZones>
  ): string {
    const bedroomPlural = input.requirements.bedrooms === 1 ? 'bedroom' : 'bedrooms';

    return `${SYSTEM_RULES}

${VASTU_GUIDELINES}

${VASTU_COMPLIANCE_PROMPT}

## CONTEXT

**Plot Orientation:** ${input.orientation.toUpperCase()}-facing
(Main road/entrance is on the ${input.orientation} side)

**Buildable Envelope:**
- Width: ${input.buildableEnvelope.width} feet
- Depth: ${input.buildableEnvelope.depth} feet
- Area: ${input.buildableEnvelope.area} sq.ft.

**Requirements:**
- Bedrooms: ${input.requirements.bedrooms} ${bedroomPlural}
- Pooja Room: ${input.requirements.hasPooja ? 'Yes (REQUIRED)' : 'No'}

**Pre-Calculated Zone Recommendations:**
${Object.entries(preRecommendations.zones)
  .map(([zone, items]) => `- ${zone}: ${items.join(', ')}`)
  .join('\n')}

**Potential Conflicts Identified:**
${preRecommendations.potentialConflicts.length > 0
  ? preRecommendations.potentialConflicts.map(c => `- [${c.severity}] ${c.conflict}`).join('\n')
  : '- None identified'}

## TASK

1. Review and refine the pre-calculated zone recommendations
2. Identify any additional conflicts based on the specific requirements
3. Propose resolutions for all conflicts
4. Document any necessary deviations from ideal Vastu
5. Generate questions if critical Vastu information is missing

**Important Reminders:**
- ${input.orientation.toUpperCase()}-facing means entrance should be on ${input.orientation} side
- Courtyard (Brahmasthana) is MANDATORY for eco-design - integrate with Vastu
${input.requirements.hasPooja ? '- Pooja room is REQUIRED - must be in Northeast ideally' : ''}
- For small plots (<1000 sqft), minor Vastu deviations are acceptable

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
      logger.error('Failed to parse Vastu compliance response', {
        content: content.slice(0, 500),
      });
      throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}...`);
    }
  }

  /**
   * Merge pre-calculated values for completeness
   */
  private mergePreCalculatedValues(
    rawOutput: unknown,
    preRecommendations: ReturnType<typeof this.preCalculateZones>
  ): unknown {
    const output = rawOutput as Record<string, unknown>;

    // Ensure recommended_zones exists and has all directions
    if (!output.recommended_zones) {
      output.recommended_zones = preRecommendations.zones;
    } else {
      const zones = output.recommended_zones as Record<string, string[]>;
      const allDirections = ['northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'center'];

      for (const dir of allDirections) {
        if (!zones[dir] || !Array.isArray(zones[dir])) {
          zones[dir] = preRecommendations.zones[dir as keyof typeof preRecommendations.zones] || [];
        }
      }

      // Enforce pooja in northeast if pre-recommendations include it (hasPooja was true)
      if (preRecommendations.zones.northeast.includes('pooja') && !zones.northeast.includes('pooja')) {
        zones.northeast.unshift('pooja');
      }
    }

    // Ensure arrays exist
    if (!output.conflicts) {
      output.conflicts = [];
    }
    if (!output.acceptable_deviations) {
      output.acceptable_deviations = [];
    }
    if (!output.open_questions) {
      output.open_questions = [];
    }

    // Add pre-calculated conflicts if not already present
    const conflicts = output.conflicts as Array<{ conflict: string; severity: string; resolution?: string }>;
    for (const preConflict of preRecommendations.potentialConflicts) {
      const exists = conflicts.some(c =>
        c.conflict.toLowerCase().includes(preConflict.conflict.toLowerCase().split(' ')[0])
      );
      if (!exists) {
        conflicts.push({
          conflict: preConflict.conflict,
          severity: preConflict.severity,
          resolution: this.getResolutionForConflict(preConflict.conflict),
        });
      }
    }

    return output;
  }

  /**
   * Get resolution for common conflicts
   */
  private getResolutionForConflict(conflict: string): string {
    const lowerConflict = conflict.toLowerCase();

    if (lowerConflict.includes('south-facing') || lowerConflict.includes('south facing')) {
      return 'South entrance is acceptable when road is on South; add threshold/nameplate for protection';
    }
    if (lowerConflict.includes('west-facing') || lowerConflict.includes('west facing')) {
      return 'West entrance acceptable; ensure good ventilation to counter afternoon heat';
    }
    if (lowerConflict.includes('small')) {
      return 'Prioritize essential Vastu (pooja in NE, kitchen in SE) and accept minor deviations';
    }

    return 'Review with Vastu consultant if strict compliance is required';
  }

  /**
   * Extract open questions
   */
  private extractOpenQuestions(
    data: VastuComplianceOutput,
    input: VastuComplianceInput
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
          reason: q.reason || 'Required for Vastu compliance',
        });
      }
    }

    // Ask about Vastu priority if there are major conflicts
    const majorConflicts = data.conflicts.filter(c => c.severity === 'major');
    if (majorConflicts.length > 0) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'vastu_priority',
        question: 'How important is strict Vastu compliance for you? (Essential / Preferred / Flexible)',
        type: 'optional',
        reason: `There are ${majorConflicts.length} major Vastu conflicts that may require compromises`,
      });
    }

    // Ask about specific deity preferences if pooja room required
    if (input.requirements.hasPooja) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'pooja_deity',
        question: 'Which deity/deities will be worshipped in the pooja room?',
        type: 'optional',
        reason: 'Different deities have specific placement preferences within the pooja room',
      });
    }

    return questions;
  }

  /**
   * Extract assumptions
   */
  private extractAssumptions(
    data: VastuComplianceOutput,
    input: VastuComplianceInput
  ): Assumption[] {
    const assumptions: Assumption[] = [];

    // Orientation-based entrance assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'entrance_orientation',
      assumption: `Main entrance will be on ${input.orientation} side (based on plot orientation)`,
      risk: 'low',
      basis: 'Road access determines entrance direction',
    });

    // Vastu flexibility assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'vastu_flexibility',
      assumption: 'Moderate Vastu compliance acceptable - buildability and eco-design take priority',
      risk: 'low',
      basis: 'Standard practice for modern Tamil Nadu residential construction',
    });

    // Small plot assumption
    if (input.buildableEnvelope.area < 1000) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'small_plot_vastu',
        assumption: 'Minor Vastu deviations accepted due to space constraints',
        risk: 'low',
        basis: 'Small plots cannot accommodate all ideal Vastu zones',
      });
    }

    // Courtyard integration
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'courtyard_brahmasthana',
      assumption: 'Central courtyard (eco-design requirement) satisfies Brahmasthana Vastu',
      risk: 'low',
      basis: 'Open center is ideal in both Vastu and eco-design principles',
    });

    // Add assumption for any accepted deviations
    const acceptedDeviations = data.acceptable_deviations.filter(d => d.acceptable);
    if (acceptedDeviations.length > 0) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'accepted_deviations',
        assumption: `${acceptedDeviations.length} Vastu deviation(s) accepted as necessary compromises`,
        risk: 'medium',
        basis: 'Practical constraints require some flexibility',
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
    return 'VASTU_COMPLIANCE_ERROR';
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
 * Create a new Vastu Compliance Agent instance
 */
export function createVastuComplianceAgent(
  config?: Partial<VastuComplianceConfig>
): VastuComplianceAgent {
  return new VastuComplianceAgent(config);
}
