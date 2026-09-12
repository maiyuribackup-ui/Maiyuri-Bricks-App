export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import {
  requireProductionRole,
  PRODUCTION_DELETE_ROLES,
} from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const patchSchema = z.object({
  planned_qty: z.number().int().min(0).optional(),
  plan_note: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_production_plan")
      .update(parsed.data)
      .eq("id", params.id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update plan row", 500);
    return success(data);
  } catch (err) {
    console.error("factory production-plan PATCH failed:", err);
    return error("Failed to update plan row", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProductionRole(request, PRODUCTION_DELETE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { error: dbError } = await supabaseAdmin
      .from("factory_production_plan")
      .delete()
      .eq("id", params.id);
    if (dbError) return error("Failed to delete plan row", 500);
    return success({ deleted: true });
  } catch (err) {
    console.error("factory production-plan DELETE failed:", err);
    return error("Failed to delete plan row", 500);
  }
}
