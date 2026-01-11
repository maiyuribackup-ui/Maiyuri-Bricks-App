import { NextRequest } from 'next/server';
import { routes, contracts } from '@maiyuri/api';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';

/**
 * POST /api/image/generate-with-references
 * Generate an image using reference images for style transfer or character consistency
 *
 * Request body:
 * {
 *   "prompt": "A house in the same architectural style",
 *   "referenceImages": [
 *     { "data": "base64-encoded-image...", "mimeType": "image/png" }
 *   ],  // 1-3 reference images
 *   "aspectRatio": "16:9",  // optional
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
    const parsed = contracts.ImageGenerationWithReferencesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const result = await routes.imageGeneration.generateWithReferences(parsed.data);

    if (!result.success || !result.data) {
      return error(result.error?.message || 'Image generation with references failed', 500);
    }

    return success(result.data, {
      processingTime: result.meta?.processingTime,
      imageCount: result.meta?.imageCount,
      referenceCount: result.meta?.referenceCount,
    } as { total?: number; page?: number; limit?: number });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Image generation with references error:', err);
    return error('Failed to generate image with references', 500);
  }
}
