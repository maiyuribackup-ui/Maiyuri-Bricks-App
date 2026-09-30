export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  success,
  error,
  notFound,
  unauthorized,
  forbidden,
  parseBody,
} from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { updateCoachTargetSchema, type CoachTarget } from "@maiyuri/shared";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/coaching/targets/[id] — learner updates own progress; admin any
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: target, error: tErr } = await admin
      .from("coach_targets")
      .select("user_id")
      .eq("id", id)
      .single();
    if (tErr || !target) return notFound("Target not found");
    if (!ctx.isAdmin && target.user_id !== ctx.userId) {
      return forbidden("You can only update your own targets");
    }

    const parsed = await parseBody(request, updateCoachTargetSchema);
    if (parsed.error) return parsed.error;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.completion_value !== undefined) patch.completion_value = parsed.data.completion_value;

    const { data, error: dbErr } = await admin
      .from("coach_targets")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (dbErr || !data) return error("Failed to update target", 500);
    return success<CoachTarget>(data as CoachTarget);
  } catch (err) {
    console.error("coaching/targets/[id] PATCH error:", err);
    return error("Internal server error", 500);
  }
}
