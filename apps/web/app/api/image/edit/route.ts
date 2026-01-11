import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

/**
 * POST /api/image/edit
 * Edit an existing image based on a text prompt using Gemini
 *
 * Request body:
 * {
 *   "prompt": "Add a garden in the foreground",
 *   "sourceImage": "base64-encoded-image-data...",
 *   "mimeType": "image/png",  // optional: image/png, image/jpeg, image/webp
 *   "aspectRatio": "16:9",    // optional
 *   "includeTextResponse": false  // optional
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
    const parsed = contracts.ImageEditRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.imageGeneration.edit(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Image editing failed', 500);
    }

    return success(result.data, {
      processingTime: result.meta?.processingTime,
      imageCount: result.meta?.imageCount,
    } as { total?: number; page?: number; limit?: number });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Image edit error:', err);
    return error('Failed to edit image', 500);
  }
}
