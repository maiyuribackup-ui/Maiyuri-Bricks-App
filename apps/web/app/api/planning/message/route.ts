import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, handleZodError } from '@/lib/api-utils';
import { ZodError } from 'zod';
import { floorPlanSupabase } from '@/lib/floor-plan-supabase';

/**
 * Request schema for adding a message
 */
const AddMessageRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    type: z.enum(['text', 'image', 'options', 'progress', 'error', 'form']),
    options: z.array(z.object({
      label: z.string(),
      value: z.string(),
      icon: z.string().optional(),
      recommended: z.boolean().optional(),
      description: z.string().optional(),
      disabled: z.boolean().optional(),
    })).optional(),
    imageUrl: z.string().optional(),
    imageBase64: z.string().optional(),
    progress: z.object({
      stage: z.string(),
      percent: z.number(),
      stages: z.array(z.object({
        id: z.string(),
        label: z.string(),
        icon: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'awaiting_confirmation']),
      })),
    }).optional(),
    formFields: z.array(z.object({
      name: z.string(),
      label: z.string(),
      type: z.enum(['text', 'number', 'select']),
      placeholder: z.string().optional(),
      options: z.array(z.string()).optional(),
      required: z.boolean().optional(),
    })).optional(),
  }),
});

/**
 * POST /api/planning/message
 *
 * Add a message to a session (Supabase persistence)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = AddMessageRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    const { sessionId, message } = parsed.data;

    // Add message to Supabase
    const result = await floorPlanSupabase.addMessage(sessionId, message);

    if (!result.success) {
      return error(result.error || 'Failed to add message', 500);
    }

    return success({
      messageId: result.data?.id,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error('Add message error:', err);
    return error('Failed to add message', 500);
  }
}
