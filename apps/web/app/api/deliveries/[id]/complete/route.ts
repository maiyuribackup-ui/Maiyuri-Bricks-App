export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { completeDelivery } from "@/lib/delivery-service";

// Complete delivery schema (camelCase from API)
const completeDeliverySchema = z.object({
  signatureData: z.string().optional(),
  photoUrls: z.array(z.string().url()).optional(),
  recipientName: z.string().optional(),
  notes: z.string().optional(),
  tripKm: z.number().nonnegative().optional(),
  dieselCost: z.number().nonnegative().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/deliveries/[id]/complete - Mark delivery as complete with POD
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const parsed = await parseBody(request, completeDeliverySchema);
    if (parsed.error) return parsed.error;

    // Transform to snake_case for service layer
    const result = await completeDelivery(id, {
      signature_data: parsed.data.signatureData,
      photo_urls: parsed.data.photoUrls,
      recipient_name: parsed.data.recipientName,
      notes: parsed.data.notes,
    });

    if (!result.success) {
      return error(result.message, 500);
    }

    // Trip economics: km + diesel are simple columns, set outside the
    // service layer so its Odoo-sync path stays untouched.
    if (parsed.data.tripKm != null || parsed.data.dieselCost != null) {
      try {
        const { supabaseAdmin } = await import("@/lib/supabase-admin");
        await supabaseAdmin
          .from("deliveries")
          .update({
            ...(parsed.data.tripKm != null ? { trip_km: parsed.data.tripKm } : {}),
            ...(parsed.data.dieselCost != null
              ? { diesel_cost: parsed.data.dieselCost }
              : {}),
          })
          .eq("id", id);
      } catch (costErr) {
        console.error("trip cost update failed:", costErr);
      }
    }

    // Auto-variance: mark the matching active-plan delivery item done.
    try {
      const { supabaseAdmin } = await import("@/lib/supabase-admin");
      const { matchDeliveryDone } = await import(
        "@/lib/ops-planning/variance-matcher"
      );
      const { data: deliveryRow } = await supabaseAdmin
        .from("deliveries")
        .select("odoo_sale_name, origin, total_quantity")
        .eq("id", id)
        .single();
      if (deliveryRow) await matchDeliveryDone(deliveryRow);
    } catch (matchErr) {
      console.error("delivery variance match failed:", matchErr);
    }

    // Return warning if Odoo sync failed but local update succeeded
    if (result.error) {
      const responseData = (result.data as Record<string, unknown>) ?? {};
      return success({ ...responseData, warning: result.error }, { total: 0 });
    }

    return success(result.data ?? {});
  } catch (err) {
    console.error("Error in POST /api/deliveries/[id]/complete:", err);
    return error("Internal server error", 500);
  }
}
