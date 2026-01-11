/**
 * Dimensioning Agent (Agent 8)
 *
 * Calculates optimal room dimensions based on zoning, buildable envelope,
 * and Tamil Nadu residential standards.
 *
 * Responsibilities:
 * - Calculate room dimensions based on type and zone
 * - Ensure rooms fit within buildable envelope
 * - Maintain minimum and maximum size standards
 * - Track adjacencies from zoning agent
 * - Calculate courtyard dimensions (eco requirement)
 * - Compute total built-up, carpet area, and efficiency
 *
 * Guardrails:
 * - MUST respect buildable envelope constraints
 * - MUST maintain minimum room sizes per Tamil Nadu standards
 * - NEVER exceed maximum room sizes (budget efficiency)
 * - Courtyard minimum 8% of plot area
 * - Master bedroom always largest bedroom
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
  DimensioningInput,
  DimensioningOutput,
} from '../types/contracts';
import { validateSchema } from '../validators/schema-validator';
import { retryWithBackoff, type RetryConfig } from '../utils/retry';
import { logger } from '../utils/logger';
import {
  SYSTEM_RULES,
  NBC_REQUIREMENTS,
  VALIDATION_RULES,
} from '../prompts/system-rules';

/**
 * Agent configuration
 */
interface DimensioningConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  retryConfig: Partial<RetryConfig>;
}

const DEFAULT_CONFIG: DimensioningConfig = {
  model: 'gemini-2.5-flash',
  maxTokens: 4096,
  temperature: 0.15,
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
};

/**
 * Standard room dimensions for Tamil Nadu residential (in feet)
 * Based on typical construction practices and CMDA guidelines
 */
const ROOM_STANDARDS: Record<string, {
  minWidth: number;
  minDepth: number;
  maxWidth: number;
  maxDepth: number;
  idealRatio: number;  // width:depth ratio
  priority: number;    // 1=highest priority for space allocation
}> = {
  // Primary rooms
  'master-bedroom': {
    minWidth: 12,
    minDepth: 12,
    maxWidth: 16,
    maxDepth: 14,
    idealRatio: 1.15,
    priority: 1,
  },
  'bedroom': {
    minWidth: 10,
    minDepth: 10,
    maxWidth: 14,
    maxDepth: 12,
    idealRatio: 1.1,
    priority: 2,
  },
  'living': {
    minWidth: 12,
    minDepth: 12,
    maxWidth: 18,
    maxDepth: 16,
    idealRatio: 1.2,
    priority: 1,
  },
  'dining': {
    minWidth: 10,
    minDepth: 10,
    maxWidth: 14,
    maxDepth: 12,
    idealRatio: 1.1,
    priority: 3,
  },
  'kitchen': {
    minWidth: 8,
    minDepth: 8,
    maxWidth: 12,
    maxDepth: 10,
    idealRatio: 1.0,
    priority: 2,
  },

  // Secondary rooms
  'pooja': {
    minWidth: 5,
    minDepth: 5,
    maxWidth: 8,
    maxDepth: 8,
    idealRatio: 1.0,
    priority: 4,
  },
  'study': {
    minWidth: 8,
    minDepth: 8,
    maxWidth: 10,
    maxDepth: 10,
    idealRatio: 1.0,
    priority: 4,
  },
  'store': {
    minWidth: 5,
    minDepth: 6,
    maxWidth: 8,
    maxDepth: 8,
    idealRatio: 0.9,
    priority: 5,
  },

  // Bathrooms
  'attached-bathroom': {
    minWidth: 5,
    minDepth: 7,
    maxWidth: 7,
    maxDepth: 9,
    idealRatio: 0.75,
    priority: 3,
  },
  'common-bathroom': {
    minWidth: 5,
    minDepth: 6,
    maxWidth: 7,
    maxDepth: 8,
    idealRatio: 0.8,
    priority: 4,
  },
  'toilet': {
    minWidth: 4,
    minDepth: 4,
    maxWidth: 5,
    maxDepth: 5,
    idealRatio: 1.0,
    priority: 5,
  },

  // Outdoor/Semi-outdoor
  'veranda': {
    minWidth: 4,
    minDepth: 8,
    maxWidth: 6,
    maxDepth: 20,
    idealRatio: 0.3,  // Long and narrow
    priority: 2,
  },
  'courtyard': {
    minWidth: 8,
    minDepth: 8,
    maxWidth: 14,
    maxDepth: 14,
    idealRatio: 1.0,
    priority: 1,
  },

  // Service areas
  'parking': {
    minWidth: 10,
    minDepth: 18,
    maxWidth: 12,
    maxDepth: 20,
    idealRatio: 0.55,
    priority: 3,
  },
  'utility': {
    minWidth: 5,
    minDepth: 6,
    maxWidth: 8,
    maxDepth: 8,
    idealRatio: 0.85,
    priority: 5,
  },
  'staircase': {
    minWidth: 3.5,
    minDepth: 8,
    maxWidth: 4.5,
    maxDepth: 12,
    idealRatio: 0.4,
    priority: 3,
  },
};

/**
 * Wall thickness constants (in feet)
 */
const WALL_THICKNESS = {
  external: 0.75,  // 9 inches
  internal: 0.375, // 4.5 inches
};

/**
 * Calculate room list from zoning
 */
function buildRoomList(zoning: DimensioningInput['zoning']): string[] {
  return [
    ...zoning.public,
    ...zoning.semiPrivate,
    ...zoning.private,
    ...zoning.service,
  ];
}

/**
 * Get zone for a room
 */
function getRoomZone(room: string, zoning: DimensioningInput['zoning']): string {
  if (zoning.public.includes(room)) return 'public';
  if (zoning.semiPrivate.includes(room)) return 'semi_private';
  if (zoning.private.includes(room)) return 'private';
  if (zoning.service.includes(room)) return 'service';
  return 'service'; // Default
}

/**
 * Get room type from room name
 */
function getRoomType(roomName: string): string {
  // Normalize room name
  const normalized = roomName.toLowerCase().replace(/[-_]\d+$/, '');

  // Direct matches
  if (ROOM_STANDARDS[normalized]) {
    return normalized;
  }

  // Pattern matches
  if (normalized.includes('bedroom') || normalized.includes('bed-')) {
    return normalized.includes('master') ? 'master-bedroom' : 'bedroom';
  }
  if (normalized.includes('bathroom') || normalized.includes('bath')) {
    return normalized.includes('attached') ? 'attached-bathroom' : 'common-bathroom';
  }
  if (normalized.includes('living')) return 'living';
  if (normalized.includes('dining')) return 'dining';
  if (normalized.includes('kitchen')) return 'kitchen';
  if (normalized.includes('pooja')) return 'pooja';
  if (normalized.includes('store')) return 'store';
  if (normalized.includes('parking') || normalized.includes('garage')) return 'parking';
  if (normalized.includes('veranda') || normalized.includes('sit-out')) return 'veranda';
  if (normalized.includes('courtyard') || normalized.includes('mutram')) return 'courtyard';
  if (normalized.includes('utility') || normalized.includes('wash')) return 'utility';
  if (normalized.includes('stair')) return 'staircase';
  if (normalized.includes('study') || normalized.includes('office')) return 'study';
  if (normalized.includes('toilet') || normalized.includes('wc')) return 'toilet';

  // Default to bedroom for unknown rooms
  return 'bedroom';
}

/**
 * Calculate ideal dimensions for a room based on available space
 */
function calculateRoomDimensions(
  roomType: string,
  availableArea: number,
  scaleFactor: number
): { width: number; depth: number; area: number } {
  const standards = ROOM_STANDARDS[roomType] || ROOM_STANDARDS['bedroom'];

  // Calculate base dimensions
  let width = standards.minWidth + (standards.maxWidth - standards.minWidth) * scaleFactor;
  let depth = standards.minDepth + (standards.maxDepth - standards.minDepth) * scaleFactor;

  // Apply ideal ratio
  const currentRatio = width / depth;
  if (Math.abs(currentRatio - standards.idealRatio) > 0.1) {
    if (standards.idealRatio < 1) {
      // Room should be deeper than wide
      depth = width / standards.idealRatio;
    } else {
      // Room should be wider than deep
      width = depth * standards.idealRatio;
    }
  }

  // Clamp to standards
  width = Math.max(standards.minWidth, Math.min(standards.maxWidth, width));
  depth = Math.max(standards.minDepth, Math.min(standards.maxDepth, depth));

  // Round to nearest 0.5 feet for practical construction
  width = Math.round(width * 2) / 2;
  depth = Math.round(depth * 2) / 2;

  return {
    width,
    depth,
    area: width * depth,
  };
}

/**
 * Calculate courtyard dimensions (minimum 8% of plot area)
 */
function calculateCourtyardDimensions(
  plotArea: number,
  availableWidth: number,
  availableDepth: number
): { width: number; depth: number; area_sqft: number } {
  // Minimum 8% of plot area
  const minArea = plotArea * 0.08;
  const targetArea = Math.max(minArea, 64); // At least 64 sqft (8x8)

  // Calculate dimensions maintaining square-ish shape
  const sideLength = Math.sqrt(targetArea);
  let width = Math.min(sideLength, availableWidth * 0.3);
  let depth = Math.min(sideLength, availableDepth * 0.3);

  // Ensure minimum dimensions
  width = Math.max(8, width);
  depth = Math.max(8, depth);

  // Round to nearest 0.5 feet
  width = Math.round(width * 2) / 2;
  depth = Math.round(depth * 2) / 2;

  return {
    width,
    depth,
    area_sqft: width * depth,
  };
}

/**
 * Pre-calculate all room dimensions
 */
function preCalculateRoomDimensions(
  input: DimensioningInput
): DimensioningOutput['rooms'] {
  const rooms = buildRoomList(input.zoning);
  const envelope = input.buildableEnvelope;
  const plotArea = envelope.width * envelope.depth;

  // Calculate available area after accounting for walls and circulation
  const wallArea = (envelope.width * 2 + envelope.depth * 2) * WALL_THICKNESS.external * 2;
  const circulationArea = plotArea * 0.15; // 15% for corridors
  const usableArea = plotArea - wallArea - circulationArea;

  // Calculate total minimum area needed
  let totalMinArea = 0;
  const roomAreas: Map<string, number> = new Map();

  for (const room of rooms) {
    const roomType = getRoomType(room);
    const standards = ROOM_STANDARDS[roomType] || ROOM_STANDARDS['bedroom'];
    const minArea = standards.minWidth * standards.minDepth;
    roomAreas.set(room, minArea);
    totalMinArea += minArea;
  }

  // Calculate scale factor based on available vs needed space
  const scaleFactor = Math.min(1, Math.max(0, (usableArea - totalMinArea) / totalMinArea));

  // Calculate dimensions for each room
  const dimensionedRooms: DimensioningOutput['rooms'] = [];

  for (const room of rooms) {
    const roomType = getRoomType(room);
    const zone = getRoomZone(room, input.zoning);
    const dimensions = calculateRoomDimensions(roomType, usableArea / rooms.length, scaleFactor);

    // Create human-readable name
    const name = room
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    dimensionedRooms.push({
      id: room,
      name,
      type: roomType,
      width: dimensions.width,
      depth: dimensions.depth,
      area_sqft: dimensions.area,
      zone,
      adjacent_to: [], // Will be filled by LLM or adjacency rules
    });
  }

  return dimensionedRooms;
}

/**
 * Calculate totals from room list
 */
function calculateTotals(
  rooms: DimensioningOutput['rooms'],
  courtyard: DimensioningOutput['courtyard']
): {
  totalBuiltUp: number;
  carpetArea: number;
  efficiency: number;
} {
  // Total built-up includes all rooms except courtyard
  const roomArea = rooms
    .filter(r => r.type !== 'courtyard')
    .reduce((sum, r) => sum + r.area_sqft, 0);

  // Add wall area (approximately 10% of room area)
  const wallArea = roomArea * 0.1;

  const totalBuiltUp = roomArea + wallArea;

  // Carpet area is room area minus walls
  const carpetArea = roomArea;

  // Efficiency percentage
  const efficiency = (carpetArea / totalBuiltUp) * 100;

  return {
    totalBuiltUp: Math.round(totalBuiltUp),
    carpetArea: Math.round(carpetArea),
    efficiency: Math.round(efficiency * 10) / 10,
  };
}

/**
 * System prompt for dimensioning
 */
const SYSTEM_PROMPT = `${SYSTEM_RULES}

You are a DIMENSIONING SPECIALIST for Tamil Nadu residential floor plans.
Your role is to optimize room dimensions based on zoning and envelope constraints.

## Tamil Nadu Room Standards

### Primary Rooms (sqft)
- Master Bedroom: 144-224 sqft (12x12 to 16x14)
- Bedroom: 100-168 sqft (10x10 to 14x12)
- Living Room: 144-288 sqft (12x12 to 18x16)
- Dining Room: 100-168 sqft (10x10 to 14x12)
- Kitchen: 64-120 sqft (8x8 to 12x10)

### Secondary Rooms
- Pooja: 25-64 sqft (5x5 to 8x8)
- Store: 30-64 sqft (5x6 to 8x8)
- Study: 64-100 sqft (8x8 to 10x10)

### Bathrooms
- Attached Bathroom: 35-63 sqft (5x7 to 7x9)
- Common Bathroom: 30-56 sqft (5x6 to 7x8)
- Toilet: 16-25 sqft (4x4 to 5x5)

### Outdoor/Service
- Veranda: minimum 4 ft wide, full facade length
- Courtyard: minimum 8% of plot area
- Parking: 180-240 sqft (10x18 to 12x20)

## Dimensioning Rules

1. Master bedroom is ALWAYS the largest bedroom
2. Living room is typically the largest public room
3. Kitchen-dining should flow together
4. Bathrooms should be practical, not oversized
5. Courtyard should allow cross-ventilation
6. Veranda width depends on sun exposure

## Output Format

Return ONLY valid JSON:
{
  "rooms": [
    {
      "id": "living",
      "name": "Living Room",
      "type": "living",
      "width": 15,
      "depth": 12,
      "area_sqft": 180,
      "zone": "public",
      "adjacent_to": ["veranda", "dining", "courtyard"]
    }
  ],
  "courtyard": {
    "width": 10,
    "depth": 10,
    "area_sqft": 100
  },
  "total_built_up_sqft": 1200,
  "carpet_area_sqft": 1080,
  "efficiency_percent": 90
}`;

/**
 * Dimensioning Agent
 *
 * Calculates optimal room dimensions for the floor plan.
 */
export class DimensioningAgent {
  readonly agentName = 'dimensioning' as const;
  private genAI: GoogleGenerativeAI;
  private config: DimensioningConfig;

  constructor(config: Partial<DimensioningConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  /**
   * Execute dimensioning analysis
   */
  async execute(
    input: DimensioningInput,
    context: DesignContext
  ): Promise<AgentResult<DimensioningOutput>> {
    const startTime = Date.now();
    const agentLogger = logger.child({
      agentName: this.agentName,
      sessionId: context.sessionId,
    });

    try {
      agentLogger.agentStart(this.agentName, context.sessionId);

      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Pre-calculate dimensions
      const preCalculated = this.preCalculateDimensions(input);

      // Step 3: Build prompt
      const prompt = this.buildPrompt(input, preCalculated);

      // Step 4: Call Gemini for optimization
      const response = await retryWithBackoff(
        () => this.callGemini(prompt),
        this.config.retryConfig
      );

      // Step 5: Parse response
      const rawOutput = this.parseResponse(response);

      // Step 6: Merge with pre-calculated values
      const mergedOutput = this.mergePreCalculatedValues(rawOutput, preCalculated, input);

      // Step 7: Validate output
      const validated = validateSchema<DimensioningOutput>(
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
          totalRooms: validated.data?.rooms.length || 0,
          envelopeUtilization: this.calculateEnvelopeUtilization(validated.data, input),
          scaleFactor: preCalculated.scaleFactor,
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
  private validateInput(input: DimensioningInput): void {
    if (!input.zoning) {
      throw new Error('Zoning data is required for dimensioning');
    }

    const allRooms = [
      ...(input.zoning.public || []),
      ...(input.zoning.semiPrivate || []),
      ...(input.zoning.private || []),
      ...(input.zoning.service || []),
    ];

    if (allRooms.length === 0) {
      throw new Error('At least one room must be provided in zoning');
    }

    if (!input.buildableEnvelope) {
      throw new Error('Buildable envelope is required for dimensioning');
    }

    if (input.buildableEnvelope.width <= 0) {
      throw new Error('Buildable envelope width must be positive');
    }

    if (input.buildableEnvelope.depth <= 0) {
      throw new Error('Buildable envelope depth must be positive');
    }

    if (input.buildableEnvelope.area <= 0) {
      throw new Error('Buildable envelope area must be positive');
    }

    // Check if envelope area is sufficient for rooms
    const minRequiredArea = allRooms.length * 50; // Minimum 50 sqft per room
    if (input.buildableEnvelope.area < minRequiredArea) {
      throw new Error(
        `Buildable envelope area (${input.buildableEnvelope.area} sqft) is insufficient for ${allRooms.length} rooms`
      );
    }
  }

  /**
   * Pre-calculate dimensions
   */
  private preCalculateDimensions(input: DimensioningInput): {
    rooms: DimensioningOutput['rooms'];
    courtyard: DimensioningOutput['courtyard'];
    totals: { totalBuiltUp: number; carpetArea: number; efficiency: number };
    scaleFactor: number;
  } {
    const envelope = input.buildableEnvelope;
    const plotArea = envelope.width * envelope.depth;

    // Pre-calculate room dimensions
    const rooms = preCalculateRoomDimensions(input);

    // Calculate courtyard dimensions
    const courtyard = calculateCourtyardDimensions(
      plotArea,
      envelope.width,
      envelope.depth
    );

    // Update courtyard in rooms list if present
    const courtyardRoom = rooms.find(r => r.type === 'courtyard');
    if (courtyardRoom) {
      courtyardRoom.width = courtyard.width;
      courtyardRoom.depth = courtyard.depth;
      courtyardRoom.area_sqft = courtyard.area_sqft;
    }

    // Calculate totals
    const totals = calculateTotals(rooms, courtyard);

    // Calculate scale factor
    const totalMinArea = rooms.reduce((sum, r) => {
      const standards = ROOM_STANDARDS[r.type] || ROOM_STANDARDS['bedroom'];
      return sum + standards.minWidth * standards.minDepth;
    }, 0);
    const usableArea = plotArea * 0.85; // 85% usable after walls/circulation
    const scaleFactor = Math.min(1, Math.max(0, (usableArea - totalMinArea) / totalMinArea));

    return {
      rooms,
      courtyard,
      totals,
      scaleFactor,
    };
  }

  /**
   * Build prompt for Gemini
   */
  private buildPrompt(
    input: DimensioningInput,
    preCalculated: ReturnType<typeof this.preCalculateDimensions>
  ): string {
    const envelope = input.buildableEnvelope;

    return `${SYSTEM_PROMPT}

## Buildable Envelope

- Width: ${envelope.width} feet
- Depth: ${envelope.depth} feet
- Area: ${envelope.area} sqft

## Requirements

- Bedrooms: ${input.requirements.bedrooms}
- Bathrooms: ${input.requirements.bathrooms}

## Zoning Input

**Public Zone:** ${input.zoning.public.join(', ') || 'none'}
**Semi-Private Zone:** ${input.zoning.semiPrivate.join(', ') || 'none'}
**Private Zone:** ${input.zoning.private.join(', ') || 'none'}
**Service Zone:** ${input.zoning.service.join(', ') || 'none'}

## Pre-Calculated Room Dimensions (verify and optimize)

${preCalculated.rooms.map(r =>
  `- ${r.name} (${r.type}): ${r.width}x${r.depth} = ${r.area_sqft} sqft [${r.zone}]`
).join('\n')}

## Pre-Calculated Courtyard

- Width: ${preCalculated.courtyard.width} feet
- Depth: ${preCalculated.courtyard.depth} feet
- Area: ${preCalculated.courtyard.area_sqft} sqft

## Pre-Calculated Totals

- Total Built-up: ${preCalculated.totals.totalBuiltUp} sqft
- Carpet Area: ${preCalculated.totals.carpetArea} sqft
- Efficiency: ${preCalculated.totals.efficiency}%

## Your Task

1. Verify dimensions fit within buildable envelope
2. Optimize dimensions for Tamil Nadu climate (cross-ventilation)
3. Ensure master bedroom is largest bedroom
4. Add adjacency relationships (adjacent_to array)
5. Adjust courtyard if needed for ventilation
6. Recalculate totals if dimensions changed

Return your optimized dimensioning as valid JSON.`;
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
  private parseResponse(response: string): Partial<DimensioningOutput> {
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
      throw new Error(`Failed to parse dimensioning response: ${(e as Error).message}`);
    }
  }

  /**
   * Merge pre-calculated values with LLM output
   */
  private mergePreCalculatedValues(
    output: Partial<DimensioningOutput>,
    preCalculated: ReturnType<typeof this.preCalculateDimensions>,
    input: DimensioningInput
  ): DimensioningOutput {
    // Use LLM rooms if provided, otherwise use pre-calculated
    let rooms = output.rooms?.length
      ? output.rooms
      : preCalculated.rooms;

    // Ensure all rooms have required fields
    rooms = rooms.map(room => ({
      id: room.id || room.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      name: room.name || room.id || 'Unknown Room',
      type: room.type || getRoomType(room.id || room.name || ''),
      width: room.width || 10,
      depth: room.depth || 10,
      area_sqft: room.area_sqft || (room.width || 10) * (room.depth || 10),
      zone: room.zone || 'service',
      adjacent_to: room.adjacent_to || [],
    }));

    // Ensure master bedroom is largest bedroom
    const bedrooms = rooms.filter(r => r.type === 'bedroom' || r.type === 'master-bedroom');
    if (bedrooms.length > 1) {
      const masterBedroom = rooms.find(r => r.type === 'master-bedroom');
      const otherBedrooms = bedrooms.filter(r => r.type !== 'master-bedroom');

      if (masterBedroom) {
        const maxOtherArea = Math.max(...otherBedrooms.map(r => r.area_sqft));
        if (masterBedroom.area_sqft <= maxOtherArea) {
          // Find the largest other bedroom and swap dimensions if needed
          const largestOther = otherBedrooms.find(r => r.area_sqft === maxOtherArea);
          if (largestOther) {
            // Swap: give master the larger bedroom's dimensions + 1
            const newWidth = Math.min(16, Math.max(masterBedroom.width, largestOther.width) + 1);
            const newDepth = Math.min(14, Math.max(masterBedroom.depth, largestOther.depth) + 1);
            masterBedroom.width = newWidth;
            masterBedroom.depth = newDepth;
            masterBedroom.area_sqft = masterBedroom.width * masterBedroom.depth;
          }
        }
      }
    }

    // Use LLM courtyard if provided, otherwise use pre-calculated
    const courtyard = output.courtyard?.width
      ? output.courtyard
      : preCalculated.courtyard;

    // Ensure courtyard meets minimum requirement (8% of envelope)
    const minCourtyardArea = input.buildableEnvelope.area * 0.08;
    if (courtyard.area_sqft < minCourtyardArea) {
      const side = Math.sqrt(minCourtyardArea);
      courtyard.width = Math.round(side * 2) / 2;
      courtyard.depth = Math.round(side * 2) / 2;
      courtyard.area_sqft = courtyard.width * courtyard.depth;
    }

    // Recalculate totals
    const totals = calculateTotals(rooms, courtyard);

    return {
      rooms,
      courtyard,
      total_built_up_sqft: output.total_built_up_sqft || totals.totalBuiltUp,
      carpet_area_sqft: output.carpet_area_sqft || totals.carpetArea,
      efficiency_percent: output.efficiency_percent || totals.efficiency,
    };
  }

  /**
   * Calculate envelope utilization percentage
   */
  private calculateEnvelopeUtilization(
    output: DimensioningOutput | undefined,
    input: DimensioningInput
  ): number {
    if (!output) return 0;
    return Math.round((output.total_built_up_sqft / input.buildableEnvelope.area) * 100);
  }

  /**
   * Extract open questions from output
   */
  private extractOpenQuestions(
    output: Partial<DimensioningOutput>,
    input: DimensioningInput
  ): OpenQuestion[] {
    const questions: OpenQuestion[] = [];

    // Ask about room size preference if budget allows flexibility
    questions.push({
      agentSource: this.agentName,
      questionId: 'room_size_preference',
      question: 'What is your preference for room sizes?',
      type: 'optional',
      reason: 'Room sizes can be adjusted based on lifestyle needs',
      options: [
        'Standard sizes (cost-effective)',
        'Spacious rooms (larger living areas)',
        'Compact (maximize number of rooms)',
      ],
    });

    // Ask about master bedroom ensuite
    if (input.requirements.bathrooms >= 2) {
      questions.push({
        agentSource: this.agentName,
        questionId: 'master_ensuite',
        question: 'Do you want a walk-in closet with the master bedroom ensuite?',
        type: 'optional',
        reason: 'Affects master bedroom zone dimensions',
        options: ['Yes, include walk-in closet', 'No, standard attached bathroom'],
      });
    }

    // Ask about kitchen style
    questions.push({
      agentSource: this.agentName,
      questionId: 'kitchen_style',
      question: 'What kitchen layout do you prefer?',
      type: 'optional',
      reason: 'Kitchen dimensions depend on layout style',
      options: ['L-shaped kitchen', 'U-shaped kitchen', 'Parallel kitchen', 'Island kitchen (larger)'],
    });

    return questions;
  }

  /**
   * Extract assumptions from analysis
   */
  private extractAssumptions(
    input: DimensioningInput,
    preCalculated: ReturnType<typeof this.preCalculateDimensions>
  ): Assumption[] {
    const assumptions: Assumption[] = [];

    // Wall thickness assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'wall_thickness',
      assumption: 'External walls are 9 inches (brick), internal walls are 4.5 inches',
      risk: 'low',
      basis: 'Standard Tamil Nadu residential construction',
    });

    // Ceiling height assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'ceiling_height',
      assumption: 'Ceiling height is 10 feet (standard residential)',
      risk: 'low',
      basis: 'Tamil Nadu residential building code default',
    });

    // Circulation assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'circulation_area',
      assumption: 'Approximately 15% of floor area allocated for circulation (corridors, passages)',
      risk: 'low',
      basis: 'Standard residential planning practice',
    });

    // Master bedroom assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'master_largest',
      assumption: 'Master bedroom is the largest bedroom with attached bathroom',
      risk: 'low',
      basis: 'Standard residential requirement',
    });

    // Courtyard assumption
    assumptions.push({
      agentSource: this.agentName,
      assumptionId: 'courtyard_minimum',
      assumption: `Courtyard is minimum ${Math.round(input.buildableEnvelope.area * 0.08)} sqft (8% of envelope)`,
      risk: 'low',
      basis: 'Eco-design requirement for natural ventilation',
    });

    // Scale factor assumption
    if (preCalculated.scaleFactor < 0.5) {
      assumptions.push({
        agentSource: this.agentName,
        assumptionId: 'compact_layout',
        assumption: 'Layout uses compact dimensions due to envelope constraints',
        risk: 'medium',
        basis: `Scale factor is ${Math.round(preCalculated.scaleFactor * 100)}%`,
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
        return 'DIMENSIONING_PARSE_ERROR';
      }
      if (error.message.includes('validation')) {
        return 'DIMENSIONING_VALIDATION_ERROR';
      }
      if (error.message.includes('API')) {
        return 'DIMENSIONING_API_ERROR';
      }
      if (error.message.includes('insufficient')) {
        return 'DIMENSIONING_SPACE_ERROR';
      }
    }
    return 'DIMENSIONING_ERROR';
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
      if (error.message.includes('insufficient')) {
        return false;
      }
    }
    return false;
  }
}

/**
 * Factory function to create DimensioningAgent
 */
export function createDimensioningAgent(
  config?: Partial<DimensioningConfig>
): DimensioningAgent {
  return new DimensioningAgent(config);
}
