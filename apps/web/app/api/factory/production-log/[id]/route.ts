export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import {
  requireProductionRole,
  PRODUCTION_DELETE_ROLES,
} from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DATA_FLAGS_PRODUCTION, DOWNTIME_REASONS } from "@/lib/factory";

const patchSchema = z.object({
  qty_produced: z.number().int().min(0).optional(),
  cement_bags: z.number().min(0).nullable().optional(),
  downtime_reason: z.enum(DOWNTIME_REASONS).optional(),
  remarks: z.string().nullable().optional(),
  data_flag: z.enum(DATA_FLAGS_PRODUCTION).optional(),
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
      .from("factory_production_log")
      .update(parsed.data)
      .eq("id", params.id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update entry", 500);
    return success(data);
  } catch (err) {
    console.error("factory production-log PATCH failed:", err);
    return error("Failed to update entry", 500);
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
      .from("factory_production_log")
      .delete()
      .eq("id", params.id);
    if (dbError) return error("Failed to delete entry", 500);
    return success({ deleted: true });
  } catch (err) {
    console.error("factory production-log DELETE failed:", err);
    return error("Failed to delete entry", 500);
  }
}
