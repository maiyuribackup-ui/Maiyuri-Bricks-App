import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { updateEstimateSchema, type Estimate } from "@maiyuri/shared";

// GET /api/estimates/[id] - Get a single estimate
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { data, error: dbError } = await supabaseAdmin
      .from("estimates")
      .select(
        `
        *,
        items:estimate_items(
          *,
          product:products(*)
        ),
        lead:leads(*)
      `,
      )
      .eq("id", id)
      .single();

    if (dbError || !data) {
      if (dbError?.code === "PGRST116") {
        return notFound("Estimate not found");
      }
      console.error("Database error:", dbError);
      return error("Failed to fetch estimate", 500);
    }

    return success<Estimate>(data);
  } catch (err) {
    console.error("Error fetching estimate:", err);
    return error("Internal server error", 500);
  }
}

// PUT /api/estimates/[id] - Update an estimate
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Verify estimate exists
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("estimates")
      .select("id, lead_id")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return notFound("Estimate not found");
    }

    const parsed = await parseBody(request, updateEstimateSchema);
    if (parsed.error) return parsed.error;

    const { items, ...updateData } = parsed.data;

    // If items are provided, recalculate subtotal
    if (items && items.length > 0) {
      // Delete existing items
      await supabaseAdmin.from("estimate_items").delete().eq("estimate_id", id);

      // Calculate new subtotal
      let subtotal = 0;
      const itemsToInsert = await Promise.all(
        items.map(async (item, index) => {
          let unitPrice = item.unit_price;
          if (!unitPrice) {
            const { data: product } = await supabaseAdmin
              .from("products")
              .select("base_price")
              .eq("id", item.product_id)
              .single();
            unitPrice = product?.base_price || 0;
          }

          const safeUnitPrice = unitPrice ?? 0;
          const totalPrice = safeUnitPrice * item.quantity;
          subtotal += totalPrice;

          return {
            estimate_id: id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: unitPrice,
            total_price: totalPrice,
            notes: item.notes || null,
            sort_order: index,
          };
        }),
      );

      // Insert new items
      await supabaseAdmin.from("estimate_items").insert(itemsToInsert);

      // Get existing transport cost from DB
      const { data: existingEstimate } = await supabaseAdmin
        .from("estimates")
        .select("transport_cost")
        .eq("id", id)
        .single();

      // Calculate with new subtotal
      const transportCost = existingEstimate?.transport_cost ?? 0;
      const discountPercentage = updateData.discount_percentage ?? 0;
      const discountAmount = (subtotal * discountPercentage) / 100;
      const totalAmount = subtotal + transportCost - discountAmount;

      const { data, error: dbError } = await supabaseAdmin
        .from("estimates")
        .update({
          ...updateData,
          subtotal,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(
          `
          *,
          items:estimate_items(
            *,
            product:products(*)
          )
        `,
        )
        .single();

      if (dbError) {
        console.error("Database error:", dbError);
        return error("Failed to update estimate", 500);
      }

      return success<Estimate>(data);
    }

    // Recalculate totals if discount changed
    let finalUpdateData: Record<string, unknown> = { ...updateData };
    if (updateData.discount_percentage !== undefined) {
      const { data: currentEstimate } = await supabaseAdmin
        .from("estimates")
        .select("subtotal, transport_cost")
        .eq("id", id)
        .single();

      const subtotal = currentEstimate?.subtotal ?? 0;
      const transportCost = currentEstimate?.transport_cost ?? 0;
      const discountPercentage = updateData.discount_percentage ?? 0;
      const discountAmount = (subtotal * discountPercentage) / 100;
      const totalAmount = subtotal + transportCost - discountAmount;

      finalUpdateData = {
        ...finalUpdateData,
        discount_amount: discountAmount,
        total_amount: totalAmount,
      };
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("estimates")
      .update({
        ...finalUpdateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        items:estimate_items(
          *,
          product:products(*)
        )
      `,
      )
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to update estimate", 500);
    }

    return success<Estimate>(data);
  } catch (err) {
    console.error("Error updating estimate:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/estimates/[id] - Delete an estimate
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Delete estimate (items will cascade delete)
    const { error: dbError } = await supabaseAdmin
      .from("estimates")
      .delete()
      .eq("id", id);

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to delete estimate", 500);
    }

    return success({ deleted: true });
  } catch (err) {
    console.error("Error deleting estimate:", err);
    return error("Internal server error", 500);
  }
}
