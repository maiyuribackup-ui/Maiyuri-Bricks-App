import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, notFound } from '@/lib/api-utils';
import { type DiscountSuggestion } from '@maiyuri/shared';
import { kernels } from '@maiyuri/api/cloudcore';

// POST /api/estimates/[id]/suggest-discount - Get AI discount suggestion
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: estimateId } = await params;

    // Get estimate to get lead_id and details
    const { data: estimate, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .select(`
        *,
        items:estimate_items(count)
      `)
      .eq('id', estimateId)
      .single();

    if (estimateError || !estimate) {
      return notFound('Estimate not found');
    }

    // Get discount suggestion from AI kernel
    const result = await kernels.discountAdvisor.suggestDiscount({
      leadId: estimate.lead_id,
      subtotal: estimate.subtotal,
      itemsCount: estimate.items?.[0]?.count || 1,
      distanceKm: estimate.distance_km,
    });

    if (!result.success || !result.data) {
      console.error('Discount advisor error:', result.error);
      return error(result.error?.message || 'Failed to generate discount suggestion', 500);
    }

    // Optionally save the AI suggestion to the estimate
    await supabaseAdmin
      .from('estimates')
      .update({
        ai_suggested_discount: result.data.suggestedPercentage,
        ai_discount_reasoning: result.data.reasoning,
        ai_confidence: result.data.confidence,
      })
      .eq('id', estimateId);

    return success<DiscountSuggestion>(result.data);
  } catch (err) {
    console.error('Error getting discount suggestion:', err);
    return error('Internal server error', 500);
  }
}
