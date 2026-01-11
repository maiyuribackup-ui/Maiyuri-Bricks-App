import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { planning } from '@maiyuri/api';

const { createFloorPlanImageAgent } = planning;
type DesignContext = planning.DesignContext;

/**
 * Request schema for floor plan image generation
 */
const FloorPlanGenerateRequestSchema = z.object({
  // Option 1: Provide render prompts directly
  renderPrompts: z
    .object({
      floorPlan: z.string().optional(),
      courtyard: z.string().optional(),
      exterior: z.string().optional(),
      interior: z.string().optional(),
    })
    .optional(),

  // Option 2: Provide room layout for automatic prompt generation
  rooms: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        width: z.number(),
        depth: z.number(),
        area_sqft: z.number(),
        zone: z.string(),
        adjacent_to: z.array(z.string()).optional(),
      })
    )
    .optional(),

  // Additional context
  plotDimensions: z
    .object({
      width: z.number(),
      depth: z.number(),
      unit: z.string().default('feet'),
    })
    .optional(),

  orientation: z.enum(['north', 'south', 'east', 'west']).optional(),

  ecoElements: z.array(z.string()).optional(),

  materials: z.array(z.string()).optional(),

  // Control which images to generate
  imagesToGenerate: z
    .array(z.enum(['floorPlan', 'courtyard', 'exterior', 'interior']))
    .default(['floorPlan']),

  // Generate in parallel (faster but may hit rate limits)
  parallel: z.boolean().default(false),

  // Session ID for tracking
  sessionId: z.string().optional(),
});

type FloorPlanGenerateRequest = z.infer<typeof FloorPlanGenerateRequestSchema>;

/**
 * POST /api/floor-plan/generate
 *
 * Generate floor plan images using AI
 *
 * This endpoint supports two modes:
 * 1. Direct prompt mode: Provide render prompts and generate images
 * 2. Layout mode: Provide room layout and let the system generate prompts first
 *
 * @example
 * // Direct prompt mode
 * {
 *   "renderPrompts": {
 *     "floorPlan": "2D floor plan of a traditional Tamil Nadu house..."
 *   }
 * }
 *
 * // Layout mode
 * {
 *   "rooms": [
 *     { "id": "living", "name": "Living Room", "type": "living", "width": 15, "depth": 12, "area_sqft": 180, "zone": "public" }
 *   ],
 *   "plotDimensions": { "width": 40, "depth": 60 },
 *   "orientation": "east"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = FloorPlanGenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const data = parsed.data;

    // Ensure we have at least prompts or rooms
    if (!data.renderPrompts && (!data.rooms || data.rooms.length === 0)) {
      return error(
        'Either renderPrompts or rooms must be provided',
        400
      );
    }

    // If no prompts provided, generate default prompts from rooms
    let renderPrompts = data.renderPrompts;
    if (!renderPrompts && data.rooms) {
      renderPrompts = generateDefaultPrompts(data);
    }

    // Create a minimal design context for the agent
    const context: DesignContext = {
      sessionId: data.sessionId || crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'in_progress',
      currentAgent: 'floor-plan-image',
      openQuestions: [],
      assumptions: [],
      plot: data.plotDimensions
        ? {
            width: data.plotDimensions.width,
            depth: data.plotDimensions.depth,
            area: data.plotDimensions.width * data.plotDimensions.depth,
            unit: data.plotDimensions.unit as 'feet' | 'meters',
          }
        : undefined,
      orientation: data.orientation,
      rooms: data.rooms?.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type as 'bedroom' | 'living' | 'dining' | 'kitchen' | 'bathroom' | 'toilet' | 'pooja' | 'store' | 'courtyard' | 'veranda' | 'staircase' | 'utility' | 'parking' | 'other',
        width: r.width,
        depth: r.depth,
        areaSqft: r.area_sqft,
        zone: r.zone as 'public' | 'semi_private' | 'private' | 'service',
        adjacentTo: r.adjacent_to,
      })),
      ecoMandatory: data.ecoElements,
      materialPreferences: data.materials?.map((m) => ({
        material: m,
        reason: 'User specified',
        carbonImpact: 'low' as const,
      })),
    };

    // Create the floor plan image agent
    const agent = createFloorPlanImageAgent({
      imagesToGenerate: data.imagesToGenerate as (
        | 'floorPlan'
        | 'courtyard'
        | 'exterior'
        | 'interior'
      )[],
      parallel: data.parallel,
    });

    // Execute image generation
    const result = await agent.execute(
      {
        renderPrompts: renderPrompts || {},
        rooms: data.rooms?.map((r) => ({
          ...r,
          adjacent_to: r.adjacent_to || [],
        })),
        plotDimensions: data.plotDimensions,
        orientation: data.orientation,
        ecoElements: data.ecoElements,
        materials: data.materials,
      },
      context
    );

    if (!result.success || !result.data) {
      return error(
        result.error?.message || 'Floor plan image generation failed',
        500
      );
    }

    // Return the generated images
    return success(
      {
        images: {
          floorPlan: result.data.floorPlan
            ? {
                base64Data: result.data.floorPlan.base64Data,
                mimeType: result.data.floorPlan.mimeType,
              }
            : undefined,
          courtyard: result.data.courtyard
            ? {
                base64Data: result.data.courtyard.base64Data,
                mimeType: result.data.courtyard.mimeType,
              }
            : undefined,
          exterior: result.data.exterior
            ? {
                base64Data: result.data.exterior.base64Data,
                mimeType: result.data.exterior.mimeType,
              }
            : undefined,
          interior: result.data.interior
            ? {
                base64Data: result.data.interior.base64Data,
                mimeType: result.data.interior.mimeType,
              }
            : undefined,
        },
        metadata: result.data.metadata,
        sessionId: context.sessionId,
      },
      {
        processingTime: result.executionTimeMs,
        imagesGenerated: result.data.metadata.totalImagesGenerated,
      } as { total?: number; page?: number; limit?: number }
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Floor plan generation error:', err);
    return error('Failed to generate floor plan images', 500);
  }
}

/**
 * Generate default prompts from room data
 *
 * IMPORTANT: Uses "MUST show exactly" wording for dimension accuracy.
 * This ensures AI-generated images display exact measurements.
 */
function generateDefaultPrompts(
  data: FloorPlanGenerateRequest
): NonNullable<FloorPlanGenerateRequest['renderPrompts']> {
  const rooms = data.rooms || [];
  const plotDims = data.plotDimensions;
  const orientation = data.orientation || 'east';

  // Use "MUST show exactly" wording for dimension accuracy
  const roomList = rooms
    .map((r) => `${r.name} (MUST show exactly ${r.width}'×${r.depth}')`)
    .join(', ');

  const plotInfo = plotDims
    ? `MUST show exactly ${plotDims.width}'×${plotDims.depth}' ${plotDims.unit || 'feet'} total plot`
    : 'MUST show exactly 40\'×60\' feet total plot';

  const buildableInfo = plotDims
    ? `Buildable area: MUST show exactly ${plotDims.width - 5}'×${plotDims.depth - 5}' (after setbacks)`
    : '';

  return {
    floorPlan: `Professional architectural 2D floor plan drawing of a traditional Tamil Nadu residential house.

CRITICAL DIMENSION REQUIREMENTS:
- ${plotInfo}
- ${buildableInfo}
- ${orientation.charAt(0).toUpperCase() + orientation.slice(1)}-facing entrance

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
- MANDATORY: Header text displaying exact plot dimensions as specified above
- Black lines on white background
- All dimensions MUST be displayed EXACTLY as specified - NO rounding or approximation`,

    courtyard: `Photorealistic 3D architectural visualization of a traditional Tamil Nadu house courtyard (mutram). Central open-to-sky courtyard with traditional Tulsi plant pedestal in center. Surrounding rooms visible through doorways with terracotta floor tiles. Natural lighting from above creating soft shadows. Traditional pillared corridors around the courtyard. Brick walls with lime wash finish. Potted plants in corners. Peaceful, serene atmosphere. Traditional architecture with modern comfort.`,

    exterior: `Photorealistic 3D exterior view of a traditional Tamil Nadu residential house. ${orientation.charAt(0).toUpperCase() + orientation.slice(1)}-facing entrance with full-length veranda (thinnai) supported by decorative wooden pillars. Sloped roof with clay Mangalore tiles. Brick walls with traditional lime wash finish in warm cream color. Ornate wooden entrance door with brass fittings. Low compound wall with simple gate. Tropical landscaping with coconut palm and flowering plants. Golden hour lighting casting warm shadows.`,

    interior: `Photorealistic 3D interior view of a traditional Tamil Nadu house living room looking towards the central courtyard. Terracotta floor tiles with geometric patterns. Lime-washed white walls with subtle texture. Wooden ceiling with exposed teakwood beams. Large wooden windows with traditional shutters allowing cross-ventilation. Comfortable traditional furniture with modern cushions. Natural daylight streaming in from the courtyard. Slow-turning ceiling fan. Decorative brass lamps and traditional artwork. Warm, inviting atmosphere.`,
  };
}
