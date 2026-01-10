import { NextRequest } from 'next/server';
import { success, error, notFound, parseBody } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { type DiscountSuggestion } from '@maiyuri/shared';
import { kernels } from '@maiyuri/api/cloudcore';
import { z } from 'zod';

// Schema for quick discount suggestion request
const quickSuggestSchema = z.object({
  subtotal: z.number().min(0),
  items_count: z.number().min(1),
  distance_km: z.number().optional(),
});

// POST /api/leads/[id]/suggest-discount - Get AI discount suggestion without saving estimate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;

    // Verify lead exists
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return notFound('Lead not found');
    }

    const parsed = await parseBody(request, quickSuggestSchema);
    if (parsed.error) return parsed.error;

    const { subtotal, items_count, distance_km } = parsed.data;

    // Get discount suggestion from AI kernel
    const result = await kernels.discountAdvisor.suggestDiscount({
      leadId,
      subtotal,
      itemsCount: items_count,
      distanceKm: distance_km,
    });

    if (!result.success || !result.data) {
      console.error('Discount advisor error:', result.error);
      return error(result.error?.message || 'Failed to generate discount suggestion', 500);
    }

    return success<DiscountSuggestion>(result.data);
  } catch (err) {
    console.error('Error getting discount suggestion:', err);
    return error('Internal server error', 500);
  }
}
