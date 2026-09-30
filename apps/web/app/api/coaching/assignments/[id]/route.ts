export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { updateCoachAssignmentSchema, type CoachAssignment } from "@maiyuri/shared";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/coaching/assignments/[id] — update (admin)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const parsed = await parseBody(request, updateCoachAssignmentSchema);
    if (parsed.error) return parsed.error;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_assignments")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (dbErr || !data) return error("Failed to update assignment", 500);
    return success<CoachAssignment>(data as CoachAssignment);
  } catch (err) {
    console.error("coaching/assignments/[id] PATCH error:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/coaching/assignments/[id] — soft-retire (admin)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const { error: dbErr } = await getSupabaseAdmin()
      .from("coach_assignments")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (dbErr) return error("Failed to retire assignment", 500);
    return success({ retired: true });
  } catch (err) {
    console.error("coaching/assignments/[id] DELETE error:", err);
    return error("Internal server error", 500);
  }
}
