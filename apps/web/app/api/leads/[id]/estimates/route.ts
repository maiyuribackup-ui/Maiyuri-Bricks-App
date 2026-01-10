import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, created, error, notFound, parseBody } from '@/lib/api-utils';
import { createEstimateSchema, type Estimate } from '@maiyuri/shared';

// GET /api/leads/[id]/estimates - List all estimates for a lead
export async function GET(
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

    // Fetch estimates with items
    const { data, error: dbError } = await supabaseAdmin
      .from('estimates')
      .select(`
        *,
        items:estimate_items(
          *,
          product:products(*)
        )
      `)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to fetch estimates', 500);
    }

    return success<Estimate[]>(data || []);
  } catch (err) {
    console.error('Error fetching estimates:', err);
    return error('Internal server error', 500);
  }
}

// POST /api/leads/[id]/estimates - Create a new estimate for a lead
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

    const parsed = await parseBody(request, createEstimateSchema);
    if (parsed.error) return parsed.error;

    const { items, ...estimateData } = parsed.data;

    // Calculate subtotal from items
    let subtotal = 0;
    const itemsToInsert = await Promise.all(
      items.map(async (item, index) => {
        // Get product price if unit_price not specified
        let unitPrice = item.unit_price;
        if (!unitPrice) {
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('base_price')
            .eq('id', item.product_id)
            .single();
          unitPrice = product?.base_price || 0;
        }

        const safeUnitPrice = unitPrice ?? 0;
        const totalPrice = safeUnitPrice * item.quantity;
        subtotal += totalPrice;

        return {
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: safeUnitPrice,
          total_price: totalPrice,
          notes: item.notes || null,
          sort_order: index,
        };
      })
    );

    // Calculate transport cost
    const { data: factorySettings } = await supabaseAdmin
      .from('factory_settings')
      .select('transport_rate_per_km, min_transport_charge')
      .limit(1)
      .single();

    let transportCost = 0;
    if (estimateData.distance_km && factorySettings) {
      transportCost = Math.max(
        estimateData.distance_km * (factorySettings.transport_rate_per_km || 15),
        factorySettings.min_transport_charge || 500
      );
    }

    // Calculate discount
    const discountPercentage = estimateData.discount_percentage || 0;
    const discountAmount = (subtotal * discountPercentage) / 100;
    const totalAmount = subtotal + transportCost - discountAmount;

    // Create estimate
    const { data: estimate, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .insert({
        lead_id: leadId,
        delivery_address: estimateData.delivery_address,
        delivery_latitude: estimateData.delivery_latitude,
        delivery_longitude: estimateData.delivery_longitude,
        distance_km: estimateData.distance_km,
        subtotal,
        transport_cost: transportCost,
        discount_percentage: discountPercentage,
        discount_amount: discountAmount,
        discount_reason: estimateData.discount_reason,
        total_amount: totalAmount,
        valid_until: estimateData.valid_until,
        notes: estimateData.notes,
        // AI suggestion data
        ai_suggested_discount: estimateData.ai_suggested_discount,
        ai_discount_reasoning: estimateData.ai_discount_reasoning,
        ai_confidence: estimateData.ai_confidence,
      })
      .select()
      .single();

    if (estimateError) {
      console.error('Database error:', estimateError);
      return error('Failed to create estimate', 500);
    }

    // Insert estimate items
    const itemsWithEstimateId = itemsToInsert.map((item) => ({
      ...item,
      estimate_id: estimate.id,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('estimate_items')
      .insert(itemsWithEstimateId);

    if (itemsError) {
      console.error('Database error inserting items:', itemsError);
      // Rollback estimate
      await supabaseAdmin.from('estimates').delete().eq('id', estimate.id);
      return error('Failed to create estimate items', 500);
    }

    // Fetch complete estimate with items
    const { data: completeEstimate } = await supabaseAdmin
      .from('estimates')
      .select(`
        *,
        items:estimate_items(
          *,
          product:products(*)
        )
      `)
      .eq('id', estimate.id)
      .single();

    return created<Estimate>(completeEstimate);
  } catch (err) {
    console.error('Error creating estimate:', err);
    return error('Internal server error', 500);
  }
}
