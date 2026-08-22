export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import {
  requireProductionRole,
  PRODUCTION_DELETE_ROLES,
} from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { WORK_TYPES } from "@/lib/factory";

const patchSchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  worker: z.string().min(1).max(120).optional(),
  work_type: z.enum(WORK_TYPES).optional(),
  qty: z.number().optional(),
  rate: z.number().optional(),
  notes: z.string().nullable().optional(),
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
      .from("factory_labour")
      .update(parsed.data)
      .eq("id", params.id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update labour entry", 500);
    return success(data);
  } catch (err) {
    console.error("factory labour PATCH failed:", err);
    return error("Failed to update labour entry", 500);
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
      .from("factory_labour")
      .delete()
      .eq("id", params.id);
    if (dbError) return error("Failed to delete labour entry", 500);
    return success({ deleted: true });
  } catch (err) {
    console.error("factory labour DELETE failed:", err);
    return error("Failed to delete labour entry", 500);
  }
}
