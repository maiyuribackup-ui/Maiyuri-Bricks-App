/**
 * Architectural Zoning Agent (Agent 7)
 *
 * Organizes rooms into functional zones based on privacy levels
 * and establishes adjacency relationships for optimal flow.
 *
 * Responsibilities:
 * - Classify rooms into public/semi-private/private/service zones
 * - Define adjacency rules for room relationships
 * - Establish circulation logic (how people move through the house)
 * - Define entry sequence (from outside to inside)
 *
 * Guardrails:
 * - MUST respect Vastu zone recommendations when provided
 * - MUST incorporate eco-constraints (courtyard, ventilation paths)
 * - NEVER place private rooms at entry sequence start
 * - Kitchen-dining and bedroom-bathroom adjacencies are mandatory
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
  ArchitecturalZoningInput,
  ArchitecturalZoningOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import { tokenBudget } from '../utils/token-budget';
import { SYSTEM_RULES } from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface ArchitecturalZoningConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: ArchitecturalZoningConfig = {
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
  temperature: 0.2,
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Room classification by zone type
 */
const ROOM_ZONE_CLASSIFICATION: Record<string, 'public' | 'semi_private' | 'private' | 'service'> = {
  // Public zones - accessible to visitors
  'living': 'public',
  'living-room': 'public',
  'main-entrance': 'public',
  'foyer': 'public',
  'veranda': 'public',
  'sit-out': 'public',
  'drawing-room': 'public',
  'guest-room': 'public',

  // Semi-private zones - family use, occasional visitors
  'dining': 'semi_private',
  'dining-room': 'semi_private',
  'family-room': 'semi_private',
  'pooja': 'semi_private',
  'pooja-room': 'semi_private',
  'study': 'semi_private',
  'home-office': 'semi_private',
  'courtyard': 'semi_private',
  'mutram': 'semi_private',

  // Private zones - family only
  'master-bedroom': 'private',
  'bedroom': 'private',
  'children-room': 'private',
  'attached-bathroom': 'private',
  'dressing': 'private',
  'walk-in-closet': 'private',

  // Service zones - utility areas
  'kitchen': 'service',
  'utility': 'service',
  'store': 'service',
  'store-room': 'service',
  'parking': 'service',
  'garage': 'service',
  'bathroom': 'service',
  'toilet': 'service',
  'common-bathroom': 'service',
  'wash-area': 'service',
  'laundry': 'service',
  'electrical-room': 'service',
  'pump-room': 'service',
  'staircase': 'service',
};

/**
 * Mandatory adjacency rules for Tamil Nadu homes
 */
const MANDATORY_ADJACENCIES: Array<{
  room1: string;
  room2: string;
  relationship: 'adjacent' | 'near' | 'separated';
  reason: string;
}> = [
  {
    room1: 'kitchen',
    room2: 'dining',
    relationship: 'adjacent',
    reason: 'Efficient food serving without long distances',
  },
  {
    room1: 'master-bedroom',
    room2: 'attached-bathroom',
    relationship: 'adjacent',
    reason: 'Privacy and convenience for primary occupants',
  },
  {
    room1: 'living',
    room2: 'dining',
    relationship: 'near',
    reason: 'Social flow between entertainment spaces',
  },
  {
    room1: 'kitchen',
    room2: 'store',
    relationship: 'adjacent',
    reason: 'Easy access to provisions while cooking',
  },
  {
    room1: 'living',
    room2: 'veranda',
    relationship: 'adjacent',
    reason: 'Indoor-outdoor connection for ventilation',
  },
  {
    room1: 'living',
    room2: 'courtyard',
    relationship: 'near',
    reason: 'Natural light and ventilation from central open space',
  },
  {
    room1: 'toilet',
    room2: 'kitchen',
    relationship: 'separated',
    reason: 'Hygiene - no direct connection between food prep and sanitation',
  },
  {
    room1: 'toilet',
    room2: 'pooja',
    relationship: 'separated',
    reason: 'Vastu - keep sacred space away from impure areas',
  },
  {
    room1: 'bedroom',
    room2: 'kitchen',
    relationship: 'separated',
    reason: 'Prevent cooking odors from entering sleeping areas',
  },
];

/**
 * Standard entry sequence for Tamil Nadu residential homes
 */
const STANDARD_ENTRY_SEQUENCES: Record<string, string[]> = {
  'with-veranda': ['gate', 'garden', 'veranda', 'living', 'courtyard', 'dining', 'bedrooms'],
  'direct-entry': ['gate', 'foyer', 'living', 'courtyard', 'dining', 'bedrooms'],
  'with-sit-out': ['gate', 'garden', 'sit-out', 'living', 'courtyard', 'private-zones'],
  'compact': ['gate', 'living', 'dining', 'bedrooms'],
};

/**
 * Build room list from requirements
 */
function buildRoomList(requirements: ArchitecturalZoningInput['requirements']): string[] {
  const rooms: string[] = [];

  // Core rooms (always present)
  rooms.push('living', 'dining', 'kitchen', 'veranda');

  // Bedrooms based on count
  if (requirements.bedrooms >= 1) {
    rooms.push('master-bedroom');
  }
  for (let i = 2; i <= requirements.bedrooms; i++) {
    rooms.push(`bedroom-${i}`);
  }

  // Bathrooms based on count
  rooms.push('attached-bathroom'); // Master bedroom always has attached
  for (let i = 2; i <= requirements.bathrooms; i++) {
    if (i === 2) {
      rooms.push('common-bathroom');
    } else {
      rooms.push(`bathroom-${i}`);
    }
  }

  // Optional rooms
  if (requirements.hasPooja) {
    rooms.push('pooja');
  }
  if (requirements.hasParking) {
    rooms.push('parking');
  }
  if (requirements.hasStore) {
    rooms.push('store');
  }

  // Always include courtyard (eco requirement)
  rooms.push('courtyard');

  return rooms;
}

/**
 * Classify rooms into zones
 */
function classifyRoomsIntoZones(
  rooms: string[],
  vastuZones: Record<string, string[]>
): ArchitecturalZoningOutput['zones'] {
  const zones: ArchitecturalZoningOutput['zones'] = {
    public: [],
    semi_private: [],
    private: [],
    service: [],
  };

  for (const room of rooms) {
    // Normalize room name for lookup
    const normalizedRoom = room.toLowerCase().replace(/[-_]\d+$/, '');
    const classification = ROOM_ZONE_CLASSIFICATION[normalizedRoom];

    if (classification) {
      zones[classification].push(room);
    } else {
      // Default to semi_private for unknown rooms
      zones.semi_private.push(room);
    }
  }

  return zones;
}

/**
 * Generate adjacency rules for the room list
 */
function generateAdjacencyRules(
  rooms: string[],
  vastuZones: Record<string, string[]>
): ArchitecturalZoningOutput['adjacency_rules'] {
  const rules: ArchitecturalZoningOutput['adjacency_rules'] = [];

  // Add mandatory adjacencies that apply to this room list
  for (const mandatory of MANDATORY_ADJACENCIES) {
    const hasRoom1 = rooms.some(r => r.includes(mandatory.room1));
    const hasRoom2 = rooms.some(r => r.includes(mandatory.room2));

    if (hasRoom1 && hasRoom2) {
      const room1Match = rooms.find(r => r.includes(mandatory.room1)) || mandatory.room1;
      const room2Match = rooms.find(r => r.includes(mandatory.room2)) || mandatory.room2;

      rules.push({
        room1: room1Match,
        room2: room2Match,
        relationship: mandatory.relationship,
        reason: mandatory.reason,
      });
    }
  }

  // Add bedroom-bathroom adjacencies for all bedrooms
  const bedrooms = rooms.filter(r => r.includes('bedroom'));
  const bathrooms = rooms.filter(r => r.includes('bathroom'));

  if (bedrooms.length > 0 && bathrooms.length > 0) {
    // Master bedroom always gets attached bathroom
    if (!rules.some(r => r.room1 === 'master-bedroom' && r.room2 === 'attached-bathroom')) {
      if (rooms.includes('master-bedroom') && rooms.includes('attached-bathroom')) {
        rules.push({
          room1: 'master-bedroom',
          room2: 'attached-bathroom',
          relationship: 'adjacent',
          reason: 'Privacy and convenience for primary occupants',
        });
      }
    }

    // Common bathroom should be near other bedrooms
    if (rooms.includes('common-bathroom')) {
      const otherBedrooms = bedrooms.filter(b => b !== 'master-bedroom');
      for (const bedroom of otherBedrooms) {
        rules.push({
          room1: bedroom,
          room2: 'common-bathroom',
          relationship: 'near',
          reason: 'Convenient bathroom access for secondary bedrooms',
        });
      }
    }
  }

  return rules;
}

/**
 * Determine circulation logic based on layout
 */
function determineCirculationLogic(
  zones: ArchitecturalZoningOutput['zones'],
  hasCourtyard: boolean
): string {
  if (hasCourtyard) {
    return 'Courtyard-centric circulation: All major rooms open to central courtyard for natural ventilation and light. Public zone at front, private zone at rear, service zone to sides. Movement flows around the courtyard connecting all spaces.';
  }

  return 'Linear circulation: Entry leads to living, which connects to dining. Private bedrooms are accessed through a corridor from the living-dining area. Service areas (kitchen, utility) are grouped together with separate access.';
}

/**
 * Build the prompt for Gemini
 */
const SYSTEM_PROMPT = `${SYSTEM_RULES}

You are an ARCHITECTURAL ZONING SPECIALIST for Tamil Nadu residential homes.
Your role is to organize rooms into functional zones and define optimal spatial relationships.

## Zone Classification

**Public Zone** - First point of contact for visitors
- Living room, veranda, sit-out, drawing room
- Should be near entrance
- Natural extension of outdoor spaces

**Semi-Private Zone** - Family areas, selective visitor access
- Dining, pooja, study, courtyard
- Buffer between public and private
- Shared family activities

**Private Zone** - Family only, no visitor access
- Bedrooms, attached bathrooms, dressing
- Maximum privacy from public areas
- Quiet, away from activity zones

**Service Zone** - Utility and support areas
- Kitchen, store, utility, parking, common bathrooms
- Efficient access for daily activities
- Can be exposed for ventilation

## Adjacency Principles

1. **Adjacent** (sharing a wall): Kitchen-dining, bedroom-attached bathroom
2. **Near** (in proximity): Living-dining, courtyard-living
3. **Separated** (physical distance): Toilet-kitchen, toilet-pooja

## Tamil Nadu Specific Rules

- Courtyard (Mutram) is the heart - most rooms should face it
- Veranda is transition from outside to inside
- Kitchen is the activity hub - needs good access
- Pooja room needs quiet, clean surroundings
- Service areas buffer west wall from living spaces

## Output Format

Return ONLY valid JSON:
{
  "zones": {
    "public": ["living", "veranda", ...],
    "semi_private": ["dining", "pooja", "courtyard", ...],
    "private": ["master-bedroom", "bedroom-2", ...],
    "service": ["kitchen", "store", "utility", ...]
  },
  "adjacency_rules": [
    {
      "room1": "kitchen",
      "room2": "dining",
      "relationship": "adjacent",
      "reason": "Efficient food serving"
    }
  ],
  "circulation_logic": "Description of how movement flows through the house",
  "entry_sequence": ["gate", "veranda", "living", "courtyard", ...]
}`;

/**
 * Architectural Zoning Agent
 *
 * Organizes rooms into functional zones and defines spatial relationships.
 */
export class ArchitecturalZoningAgent {
  readonly agentName = 'architectural-zoning' as const;
  private genAI: GoogleGenerativeAI;
  private config: ArchitecturalZoningConfig;

  constructor(config: Partial<ArchitecturalZoningConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute architectural zoning analysis
   */
  async execute(
    input: ArchitecturalZoningInput,
    context: DesignContext
  ): Promise<AgentResult<ArchitecturalZoningOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Pre-calculate zoning
      const preCalculated = this.preCalculateZoning(input);

      // Step 3: Build prompt
      const prompt = this.buildPrompt(input, preCalculated);

      // Step 4: Call Gemini for zoning analysis
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 5: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 6: Merge with pre-calculated values
      const mergedOutput = this.mergePreCalculatedValues(rawOutput, preCalculated, input);

      // Step 7: Validate output
      const validated = validateSchema<ArchitecturalZoningOutput>(
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
          totalRooms: preCalculated.rooms.length,
          hasCourtyard: preCalculated.rooms.includes('courtyard'),
          requirements: input.requirements,
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
  private validateInput(input: ArchitecturalZoningInput): void {
    if (!input.requirements) {
      throw new Error('Room requirements are required for architectural zoning');
    }

    if (typeof input.requirements.bedrooms !== 'number' || input.requirements.bedrooms < 1) {
      throw new Error('At least 1 bedroom is required');
    }

    if (input.requirements.bedrooms > 6) {
      throw new Error('Maximum 6 bedrooms supported for residential zoning');
    }

    if (typeof input.requirements.bathrooms !== 'number' || input.requirements.bathrooms < 1) {
      throw new Error('At least 1 bathroom is required');
    }

    if (input.requirements.bathrooms > input.requirements.bedrooms + 1) {
      throw new Error('Bathroom count should not exceed bedrooms + 1');
    }
  }

  /**
   * Pre-calculate zoning based on requirements
   */
  private preCalculateZoning(input: ArchitecturalZoningInput): {
    rooms: string[];
    zones: ArchitecturalZoningOutput['zones'];
    adjacencyRules: ArchitecturalZoningOutput['adjacency_rules'];
    circulationLogic: string;
    entrySequence: string[];
  } {
    // Build room list from requirements
    const rooms = buildRoomList(input.requirements);

    // Classify rooms into zones
    const zones = classifyRoomsIntoZones(rooms, input.vastuZones || {});

    // Generate adjacency rules
    const adjacencyRules = generateAdjacencyRules(rooms, input.vastuZones || {});

    // Determine circulation logic
    const hasCourtyard = rooms.includes('courtyard');
    const circulationLogic = determineCirculationLogic(zones, hasCourtyard);

    // Determine entry sequence
    const hasVeranda = rooms.includes('veranda');
    const entrySequenceType = hasVeranda ? 'with-veranda' : 'direct-entry';
    const entrySequence = STANDARD_ENTRY_SEQUENCES[entrySequenceType];

    return {
      rooms,
      zones,
      adjacencyRules,
      circulationLogic,
      entrySequence,
    };
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: ArchitecturalZoningInput,
    preCalculated: ReturnType<typeof this.preCalculateZoning>
  ): string {
    const vastuInfo = input.vastuZones
      ? `\n## Vastu Zone Recommendations\n${Object.entries(input.vastuZones).map(([zone, rooms]) => `- ${zone}: ${rooms.join(', ')}`).join('\n')}`
      : '';

    const ecoInfo = input.ecoConstraints?.length
      ? `\n## Eco-Design Constraints\n${input.ecoConstraints.map(c => `- ${c}`).join('\n')}`
      : '';

    return `${SYSTEM_PROMPT}

## Room Requirements

- Bedrooms: ${input.requirements.bedrooms}
- Bathrooms: ${input.requirements.bathrooms}
- Pooja Room: ${input.requirements.hasPooja ? 'Yes' : 'No'}
- Parking: ${input.requirements.hasParking ? 'Yes' : 'No'}
- Store Room: ${input.requirements.hasStore ? 'Yes' : 'No'}

## Rooms to Zone

${preCalculated.rooms.map(r => `- ${r}`).join('\n')}
${vastuInfo}
${ecoInfo}

## Pre-Calculated Zones (verify and enhance)

Public: ${preCalculated.zones.public.join(', ') || 'none'}
Semi-Private: ${preCalculated.zones.semi_private.join(', ') || 'none'}
Private: ${preCalculated.zones.private.join(', ') || 'none'}
Service: ${preCalculated.zones.service.join(', ') || 'none'}

## Pre-Calculated Adjacencies (verify and add more if needed)

${preCalculated.adjacencyRules.map(r => `- ${r.room1} <-> ${r.room2}: ${r.relationship} (${r.reason})`).join('\n')}

## Your Task

1. Verify the zone classifications are correct
2. Add any missing adjacency rules (especially Vastu-based)
3. Refine circulation logic for this specific layout
4. Confirm or adjust the entry sequence

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
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  /**
   * Parse Gemini response
   */
  private parseResponse(response: string): Partial<ArchitecturalZoningOutput> {
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
      throw new Error(`Failed to parse architectural zoning response: ${(e as Error).message}`);
    }
  }

  /**
   * Merge pre-calculated values with LLM output
   */
  private mergePreCalculatedValues(
    output: Partial<ArchitecturalZoningOutput>,
    preCalculated: ReturnType<typeof this.preCalculateZoning>,
    input: ArchitecturalZoningInput
  ): ArchitecturalZoningOutput {
    // Merge zones - ensure all rooms are classified
    const zones: ArchitecturalZoningOutput['zones'] = {
      public: output.zones?.public || preCalculated.zones.public,
      semi_private: output.zones?.semi_private || preCalculated.zones.semi_private,
      private: output.zones?.private || preCalculated.zones.private,
      service: output.zones?.service || preCalculated.zones.service,
    };

    // Ensure all rooms are in exactly one zone
    const allZonedRooms = [
      ...zones.public,
      ...zones.semi_private,
      ...zones.private,
      ...zones.service,
    ];

    for (const room of preCalculated.rooms) {
      if (!allZonedRooms.includes(room)) {
        // Add unclassified rooms to semi_private as default
        zones.semi_private.push(room);
      }
    }

    // Merge adjacency rules - ensure mandatory ones are present
    const adjacencyRules: ArchitecturalZoningOutput['adjacency_rules'] = [];
    const outputRules = output.adjacency_rules || [];

    // Add all pre-calculated rules
    for (const rule of preCalculated.adjacencyRules) {
      adjacencyRules.push(rule);
    }

    // Add output rules that don't duplicate pre-calculated ones
    for (const rule of outputRules) {
      const isDuplicate = adjacencyRules.some(
        r => (r.room1 === rule.room1 && r.room2 === rule.room2) ||
             (r.room1 === rule.room2 && r.room2 === rule.room1)
      );
      if (!isDuplicate) {
        adjacencyRules.push(rule);
      }
    }

    // Use LLM circulation logic if provided, otherwise use pre-calculated
    const circulationLogic = output.circulation_logic || preCalculated.circulationLogic;

    // Use LLM entry sequence if provided, otherwise use pre-calculated
    const entrySequence = output.entry_sequence?.length
      ? output.entry_sequence
      : preCalculated.entrySequence;

    return {
      zones,
      adjacency_rules: adjacencyRules,
      circulation_logic: circulationLogic,
      entry_sequence: entrySequence,
    };
  }

  /**
   * Extract open questions from output
   */
  private extractOpenQuestions(
    output: Partial<ArchitecturalZoningOutput>,
    input: ArchitecturalZoningInput
  ): OpenQuestion[] {
    const questions: OpenQuestion[] = [];

    // Ask about guest room if bedrooms >= 3
    if (input.requirements.bedrooms >= 3) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'guest_room',
        question: 'Would you like to designate one bedroom as a dedicated guest room?',
        type: 'optional',
        reason: 'Guest room affects zoning - it can be in semi-private instead of private zone',
        options: ['Yes, dedicate one room for guests', 'No, all bedrooms for family'],
      });
    }

    // Ask about home office if not mentioned
    if (input.requirements.bedrooms >= 2) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'home_office',
        question: 'Do you need a dedicated home office or study space?',
        type: 'optional',
        reason: 'Home office requires semi-private zoning with good natural light',
        options: ['Yes, need separate study/office', 'No, will use bedroom', 'Combined with living area'],
      });
    }

    // Ask about formal dining vs open dining
    questions.push({
      agentSource: this.agentName,
      questionId: 'dining_style',
      question: 'What style of dining area do you prefer?',
      type: 'optional',
      reason: 'Affects adjacency with living room and kitchen',
      options: ['Open dining connected to living', 'Separate formal dining room', 'Kitchen dining (combined)'],
    });

    return questions;
  }

  /**
   * Extract assumptions from analysis
   */
  private extractAssumptions(
    input: ArchitecturalZoningInput,
    preCalculated: ReturnType<typeof this.preCalculateZoning>
  ): Assumption[] {
    const assumptions: Assumption[] = [];

    // Courtyard assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'courtyard_central',
      assumption: 'Central courtyard will be the focal point of circulation',
      risk: 'low',
      basis: 'Tamil Nadu traditional architecture and eco-design requirements',
    });

    // Master bedroom assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'master_bedroom_attached',
      assumption: 'Master bedroom will have an attached bathroom',
      risk: 'low',
      basis: 'Standard residential requirement for primary bedroom',
    });

    // Entry sequence assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'entry_sequence',
      assumption: 'Entry sequence follows traditional Tamil Nadu progression: outside → veranda → living → courtyard',
      risk: 'low',
      basis: 'Cultural and climatic considerations',
    });

    // Kitchen-dining assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'kitchen_dining_adjacent',
      assumption: 'Kitchen and dining will be adjacent for efficient serving',
      risk: 'low',
      basis: 'Functional requirement for residential layouts',
    });

    // Vastu assumption if no vastu zones provided
    if (!input.vastuZones || Object.keys(input.vastuZones).length === 0) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'vastu_not_provided',
        assumption: 'No specific Vastu requirements provided; using general best practices',
        risk: 'medium',
        basis: 'Vastu zones not specified in input',
      });
    }

    // Parking assumption
    if (input.requirements.hasParking) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'parking_location',
        assumption: 'Parking will be in service zone, preferably near entrance',
        risk: 'low',
        basis: 'Standard residential practice for vehicle access',
      });
    }

    return assumptions;
  }

  /**
   * Get error code based on error type
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('parse')) {
        return 'ARCHITECTURAL_ZONING_PARSE_ERROR';
      }
      if (error.message.includes('validation')) {
        return 'ARCHITECTURAL_ZONING_VALIDATION_ERROR';
      }
      if (error.message.includes('API')) {
        return 'ARCHITECTURAL_ZONING_API_ERROR';
      }
    }
    return 'ARCHITECTURAL_ZONING_ERROR';
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      if (error.message.includes('API') || error.message.includes('timeout')) {
        return true;
      }
      if (error.message.includes('parse')) {
        return false;
      }
    }
    return false;
  }
}

/**
 * Factory function to create ArchitecturalZoningAgent
 */
export function createArchitecturalZoningAgent(
  config?: Partial<ArchitecturalZoningConfig>
): ArchitecturalZoningAgent {
  return new ArchitecturalZoningAgent(config);
}
