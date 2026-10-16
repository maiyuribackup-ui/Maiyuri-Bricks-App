export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";

const patchSchema = z.object({
  status: z.enum(["planned", "done", "partial", "missed", "moved"]).optional(),
  actual_quantity: z.number().nonnegative().nullable().optional(),
  item_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // reschedule
  notes: z.string().nullable().optional(),
});

// PATCH /api/ops-planning/items/[id] — report actual / reschedule an item
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;

    const updates: Record<string, unknown> = { ...parsed.data };
    // Reporting an actual implies a status if none was given.
    if (
      parsed.data.actual_quantity != null &&
      parsed.data.status === undefined
    ) {
      updates.status = "done";
    }
    if (parsed.data.item_date && parsed.data.status === undefined) {
      updates.status = "moved";
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("ops_plan_items")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();

    if (dbError?.code === "PGRST116") return notFound("Plan item not found");
    if (dbError) return error("Failed to update plan item", 500);

    return success(data);
  } catch (err) {
    console.error("plan item update failed:", err);
    return error("Failed to update plan item", 500);
  }
}
