export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import {
  createCoachAssignmentSchema,
  type CoachAssignment,
  type CoachAssignmentSubmission,
} from "@maiyuri/shared";

// GET /api/coaching/assignments — active assignments + this learner's latest submission
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const admin = getSupabaseAdmin();

    let q = admin.from("coach_assignments").select("*").order("created_at", { ascending: false });
    if (!ctx.isAdmin) q = q.eq("is_active", true);
    const { data: assignments, error: aErr } = await q;
    if (aErr) return error("Failed to load assignments", 500);

    const { data: subs } = await admin
      .from("coach_assignment_submissions")
      .select("*")
      .eq("user_id", ctx.userId)
      .order("submitted_at", { ascending: false });

    const latestByAssignment = new Map<string, CoachAssignmentSubmission>();
    for (const s of (subs as CoachAssignmentSubmission[]) || []) {
      if (!latestByAssignment.has(s.assignment_id)) latestByAssignment.set(s.assignment_id, s);
    }

    const result = ((assignments as CoachAssignment[]) || []).map((a) => ({
      ...a,
      mySubmission: latestByAssignment.get(a.id) ?? null,
    }));
    return success(result);
  } catch (err) {
    console.error("coaching/assignments GET error:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/coaching/assignments — create (admin)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");

    const parsed = await parseBody(request, createCoachAssignmentSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_assignments")
      .insert(parsed.data)
      .select()
      .single();
    if (dbErr || !data) {
      console.error("coaching/assignments insert error:", dbErr);
      return error(`Failed to create assignment: ${dbErr?.message ?? "unknown"}`, 500);
    }
    return success<CoachAssignment>(data as CoachAssignment);
  } catch (err) {
    console.error("coaching/assignments POST error:", err);
    return error("Internal server error", 500);
  }
}
