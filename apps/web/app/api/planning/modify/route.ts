import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { planningService } from '@/lib/planning-service';

/**
 * Request schema for modifying a design
 */
const ModifyDesignRequestSchema = z.object({
  sessionId: z.string().uuid(),
  modification: z.string().min(3).max(500),
  confirmed: z.boolean().optional(),
});

/**
 * Common modification patterns and how to interpret them
 */
const MODIFICATION_PATTERNS = [
  {
    patterns: ['bigger', 'larger', 'expand', 'increase'],
    type: 'expand',
    requiresRoom: true,
  },
  {
    patterns: ['smaller', 'reduce', 'decrease', 'shrink'],
    type: 'shrink',
    requiresRoom: true,
  },
  {
    patterns: ['move', 'shift', 'relocate'],
    type: 'move',
    requiresRoom: true,
    requiresDirection: true,
  },
  {
    patterns: ['add', 'include', 'create new'],
    type: 'add',
    requiresRoom: true,
  },
  {
    patterns: ['remove', 'delete', 'eliminate'],
    type: 'remove',
    requiresRoom: true,
  },
  {
    patterns: ['swap', 'exchange', 'switch'],
    type: 'swap',
    requiresRooms: true,
  },
];

/**
 * Room types that can be referenced
 */
const ROOM_PATTERNS = [
  'living room',
  'bedroom',
  'kitchen',
  'bathroom',
  'toilet',
  'dining',
  'pooja',
  'store',
  'courtyard',
  'mutram',
  'veranda',
  'thinnai',
  'parking',
  'staircase',
];

/**
 * Parse modification request to understand intent
 */
function parseModification(modification: string): {
  type: string;
  rooms: string[];
  direction?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
} {
  const lowerMod = modification.toLowerCase();

  // Find modification type
  let modType = 'general';
  for (const pattern of MODIFICATION_PATTERNS) {
    if (pattern.patterns.some((p) => lowerMod.includes(p))) {
      modType = pattern.type;
      break;
    }
  }

  // Find mentioned rooms
  const rooms = ROOM_PATTERNS.filter((room) => lowerMod.includes(room));

  // Check if we need clarification
  let needsClarification = false;
  let clarificationQuestion: string | undefined;

  if (modType === 'expand' || modType === 'shrink') {
    if (rooms.length === 0) {
      needsClarification = true;
      clarificationQuestion = 'Which room would you like me to make bigger/smaller?';
    }
  } else if (modType === 'move') {
    if (rooms.length === 0) {
      needsClarification = true;
      clarificationQuestion = 'Which room would you like me to move?';
    } else if (!lowerMod.includes('north') && !lowerMod.includes('south') && !lowerMod.includes('east') && !lowerMod.includes('west')) {
      needsClarification = true;
      clarificationQuestion = `Where would you like me to move the ${rooms[0]}? (e.g., to the south side, near the entrance)`;
    }
  } else if (modType === 'swap' && rooms.length < 2) {
    needsClarification = true;
    clarificationQuestion = 'Which two rooms would you like me to swap?';
  }

  // Extract direction if mentioned
  let direction: string | undefined;
  const directions = ['north', 'south', 'east', 'west', 'front', 'back', 'left', 'right'];
  for (const dir of directions) {
    if (lowerMod.includes(dir)) {
      direction = dir;
      break;
    }
  }

  return {
    type: modType,
    rooms,
    direction,
    needsClarification,
    clarificationQuestion,
  };
}

/**
 * Generate trade-off explanation for modifications
 */
function generateTradeOffExplanation(
  modType: string,
  rooms: string[],
): string | null {
  if (modType === 'expand' && rooms.length > 0) {
    const room = rooms[0];
    return `I can make the ${room} bigger. This will reduce the adjacent room sizes slightly. Would you like me to proceed?`;
  }

  if (modType === 'shrink' && rooms.length > 0) {
    const room = rooms[0];
    return `I'll reduce the ${room} size, which will allow more space for adjacent rooms. Is that okay?`;
  }

  if (modType === 'move' && rooms.length > 0) {
    const room = rooms[0];
    return `Moving the ${room} will require rearranging the surrounding rooms. This might affect the overall flow. Should I proceed?`;
  }

  if (modType === 'add') {
    return `Adding a new room will require reducing other room sizes to fit within your plot. Would you like me to show you the options?`;
  }

  return null;
}

/**
 * POST /api/planning/modify
 *
 * Modify an existing floor plan design based on user feedback
 *
 * @example
 * POST /api/planning/modify
 * {
 *   "sessionId": "uuid",
 *   "modification": "Make the living room bigger"
 * }
 *
 * Response might ask for clarification or confirm trade-offs before applying
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = ModifyDesignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const { sessionId, modification, confirmed } = parsed.data;

    // Get session from planning service
    const session = planningService.getSession(sessionId);
    if (!session) {
      return error('Session not found. Please start a new session.', 404);
    }

    if (session.status !== 'complete') {
      return error('Cannot modify - design not yet complete', 400);
    }

    // Parse the modification request
    const parsedMod = parseModification(modification);

    // If we need clarification, ask for it
    if (parsedMod.needsClarification && !confirmed) {
      return success({
        status: 'needs_clarification',
        clarificationQuestion: parsedMod.clarificationQuestion,
        parsedIntent: {
          type: parsedMod.type,
          rooms: parsedMod.rooms,
        },
      });
    }

    // Generate trade-off explanation if needed and not confirmed
    if (!confirmed) {
      const tradeOff = generateTradeOffExplanation(
        parsedMod.type,
        parsedMod.rooms,
      );

      if (tradeOff) {
        return success({
          status: 'needs_confirmation',
          confirmationMessage: tradeOff,
          parsedIntent: {
            type: parsedMod.type,
            rooms: parsedMod.rooms,
            direction: parsedMod.direction,
          },
          options: [
            { label: 'Yes, proceed', value: 'confirm' },
            { label: 'No, keep original', value: 'cancel' },
          ],
        });
      }
    }

    // Apply modification - update session inputs and regenerate
    const updatedInputs = { ...session.inputs };

    // Apply modification based on type
    if (parsedMod.type === 'expand' && parsedMod.rooms.length > 0) {
      updatedInputs[`${parsedMod.rooms[0]}_size`] = 'larger';
    } else if (parsedMod.type === 'shrink' && parsedMod.rooms.length > 0) {
      updatedInputs[`${parsedMod.rooms[0]}_size`] = 'smaller';
    } else if (parsedMod.type === 'move' && parsedMod.rooms.length > 0) {
      updatedInputs[`${parsedMod.rooms[0]}_position`] = parsedMod.direction || 'default';
    }

    // Store modification request
    updatedInputs.lastModification = modification;
    planningService.updateInputs(sessionId, updatedInputs);

    // Start regeneration
    planningService.startGeneration(sessionId).catch(err => {
      console.error('Regeneration error:', err);
    });

    return success({
      status: 'regenerating',
      message: `Got it! I'm updating the design to ${modification.toLowerCase()}...`,
      changes: [
        `Modifying ${parsedMod.rooms.join(', ')} (${parsedMod.type})`,
        parsedMod.direction ? `Direction: ${parsedMod.direction}` : null,
      ].filter(Boolean),
      progress: {
        stage: 'Applying modifications...',
        percent: 0,
        stages: planningService.getStages(sessionId),
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Modify design error:', err);
    return error('Failed to process modification', 500);
  }
}
