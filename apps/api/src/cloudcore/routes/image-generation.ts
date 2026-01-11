/**
 * Image Generation Route Handlers
 * API endpoints for Gemini-powered image generation
 */

import {
  generateImage,
  editImage,
  generateImageWithReferences,
} from '../services/ai/gemini';
import * as contracts from '../contracts';
import type { CloudCoreResult, ImageGenerationResult } from '../types';

/**
 * Generate an image from a text prompt
 *
 * @example
 * POST /api/image/generate
 * {
 *   "prompt": "A modern brick house with Tamil architecture",
 *   "aspectRatio": "16:9",
 *   "includeTextResponse": false
 * }
 */
export async function generate(
  data: contracts.ImageGenerationRequest
): Promise<CloudCoreResult<ImageGenerationResult>> {
  // Validate request
  const parsed = contracts.ImageGenerationRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  return generateImage(parsed.data.prompt, {
    aspectRatio: parsed.data.aspectRatio,
    imageSize: parsed.data.imageSize,
    includeTextResponse: parsed.data.includeTextResponse,
  });
}

/**
 * Edit an existing image based on a text prompt
 *
 * @example
 * POST /api/image/edit
 * {
 *   "prompt": "Add a garden in the foreground",
 *   "sourceImage": "base64-encoded-image-data...",
 *   "mimeType": "image/png",
 *   "aspectRatio": "16:9"
 * }
 */
export async function edit(
  data: contracts.ImageEditRequest
): Promise<CloudCoreResult<ImageGenerationResult>> {
  // Validate request
  const parsed = contracts.ImageEditRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  return editImage(
    parsed.data.prompt,
    parsed.data.sourceImage,
    parsed.data.mimeType,
    {
      aspectRatio: parsed.data.aspectRatio,
      includeTextResponse: parsed.data.includeTextResponse,
    }
  );
}

/**
 * Generate an image using reference images for style transfer or consistency
 *
 * @example
 * POST /api/image/generate-with-references
 * {
 *   "prompt": "A house in the same architectural style",
 *   "referenceImages": [
 *     { "data": "base64-encoded-image...", "mimeType": "image/png" }
 *   ],
 *   "aspectRatio": "16:9"
 * }
 */
export async function generateWithReferences(
  data: contracts.ImageGenerationWithReferencesRequest
): Promise<CloudCoreResult<ImageGenerationResult>> {
  // Validate request
  const parsed = contracts.ImageGenerationWithReferencesRequestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { errors: parsed.error.errors },
      },
    };
  }

  // Map reference images with explicit types
  const referenceImages = parsed.data.referenceImages.map((ref) => ({
    data: ref.data,
    mimeType: ref.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
  }));

  return generateImageWithReferences(
    parsed.data.prompt,
    referenceImages,
    {
      aspectRatio: parsed.data.aspectRatio,
      includeTextResponse: parsed.data.includeTextResponse,
    }
  );
}

export default {
  generate,
  edit,
  generateWithReferences,
};
