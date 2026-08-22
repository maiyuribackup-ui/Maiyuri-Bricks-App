export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { reviewSubmissionSchema, type CoachAssignmentSubmission } from "@maiyuri/shared";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/coaching/submissions/[id] — manager reviews a submission (admin)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can review submissions");
    const { id } = await params;

    const parsed = await parseBody(request, reviewSubmissionSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_assignment_submissions")
      .update({
        manager_status: parsed.data.manager_status,
        manager_comment: parsed.data.manager_comment ?? null,
      })
      .eq("id", id)
      .select()
      .single();
    if (dbErr || !data) return error("Failed to review submission", 500);
    return success<CoachAssignmentSubmission>(data as CoachAssignmentSubmission);
  } catch (err) {
    console.error("coaching/submissions/[id] PATCH error:", err);
    return error("Internal server error", 500);
  }
}
