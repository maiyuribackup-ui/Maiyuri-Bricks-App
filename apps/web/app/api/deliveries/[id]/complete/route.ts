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
