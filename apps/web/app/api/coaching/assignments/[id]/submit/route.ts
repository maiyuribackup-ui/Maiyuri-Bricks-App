export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import type { CoachAssignmentSubmission } from "@maiyuri/shared";
import { z } from "zod";

const bodySchema = z.object({
  submission_text: z.string().optional(),
  attachment_url: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/coaching/assignments/[id]/submit — learner submits (manager review pending; AI score Phase 2)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const { id } = await params;

    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    if (!parsed.data.submission_text && !parsed.data.attachment_url) {
      return error("Provide a written answer or an attachment", 400);
    }

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_assignment_submissions")
      .insert({
        assignment_id: id,
        user_id: ctx.userId,
        submission_text: parsed.data.submission_text ?? null,
        attachment_url: parsed.data.attachment_url ?? null,
        manager_status: "pending",
      })
      .select()
      .single();
    if (dbErr || !data) {
      console.error("coaching assignment submit error:", dbErr);
      return error("Failed to submit assignment", 500);
    }
    return success<CoachAssignmentSubmission>(data as CoachAssignmentSubmission);
  } catch (err) {
    console.error("coaching/assignments/[id]/submit POST error:", err);
    return error("Internal server error", 500);
  }
}
