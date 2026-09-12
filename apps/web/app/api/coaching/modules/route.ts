export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { createCoachModuleSchema, type CoachModule } from "@maiyuri/shared";

// GET /api/coaching/modules — list active modules (admins see all)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();

    let q = getSupabaseAdmin()
      .from("coach_modules")
      .select("*")
      .order("sequence_order", { ascending: true });
    if (!ctx.isAdmin) q = q.eq("is_active", true);

    const { data, error: dbErr } = await q;
    if (dbErr) {
      console.error("coaching/modules list error:", dbErr);
      return error("Failed to load modules", 500);
    }
    return success<CoachModule[]>((data as CoachModule[]) || []);
  } catch (err) {
    console.error("coaching/modules GET error:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/coaching/modules — create (admin only)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");

    const parsed = await parseBody(request, createCoachModuleSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_modules")
      .insert(parsed.data)
      .select()
      .single();
    if (dbErr || !data) {
      console.error("coaching/modules insert error:", dbErr);
      return error(`Failed to create module: ${dbErr?.message ?? "unknown"}`, 500);
    }
    return success<CoachModule>(data as CoachModule);
  } catch (err) {
    console.error("coaching/modules POST error:", err);
    return error("Internal server error", 500);
  }
}
