export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { createCoachTargetSchema, type CoachTarget } from "@maiyuri/shared";

// GET /api/coaching/targets — own targets (admins may pass ?userId=)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();

    const requested = new URL(request.url).searchParams.get("userId");
    const userId = ctx.isAdmin && requested ? requested : ctx.userId;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_targets")
      .select("*")
      .eq("user_id", userId)
      .order("due_date", { ascending: true });
    if (dbErr) return error("Failed to load targets", 500);
    return success<CoachTarget[]>((data as CoachTarget[]) || []);
  } catch (err) {
    console.error("coaching/targets GET error:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/coaching/targets — assign a target to a learner (admin)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can assign targets");

    const parsed = await parseBody(request, createCoachTargetSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_targets")
      .insert({
        ...parsed.data,
        target_value: parsed.data.target_value ?? 1,
        created_by: ctx.userId,
      })
      .select()
      .single();
    if (dbErr || !data) {
      console.error("coaching/targets insert error:", dbErr);
      return error(`Failed to assign target: ${dbErr?.message ?? "unknown"}`, 500);
    }
    return success<CoachTarget>(data as CoachTarget);
  } catch (err) {
    console.error("coaching/targets POST error:", err);
    return error("Internal server error", 500);
  }
}
