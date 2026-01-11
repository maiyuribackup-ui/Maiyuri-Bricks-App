import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

/**
 * POST /api/image/generate
 * Generate an image from a text prompt using Gemini
 *
 * Request body:
 * {
 *   "prompt": "A modern brick house with Tamil architecture",
 *   "aspectRatio": "16:9",  // optional: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
 *   "imageSize": "1K",      // optional: 1K, 2K, 4K
 *   "includeTextResponse": false  // optional: include model commentary
 * }
 *
 * Response:
 * {
 *   "data": {
 *     "images": [{ "base64Data": "...", "mimeType": "image/png" }],
 *     "text": "optional model commentary",
 *     "model": "gemini-2.0-flash-exp"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.ImageGenerationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.imageGeneration.generate(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Image generation failed', 500);
    }

    return success(result.data, {
      processingTime: result.meta?.processingTime,
      imageCount: result.meta?.imageCount,
    } as { total?: number; page?: number; limit?: number });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Image generation error:', err);
    return error('Failed to generate image', 500);
  }
}
