export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, unauthorized, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { scoreAssignment } from "@/lib/coaching/ai/grade";
import { isCoachAiEnabled } from "@/lib/coaching/ai/flags";
import type { CoachAssignment, CoachAssignmentSubmission } from "@maiyuri/shared";
import { z } from "zod";

const bodySchema = z.object({
  submission_text: z.string().optional(),
  attachment_url: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/coaching/assignments/[id]/submit — learner submits; AI pre-scores when enabled
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

    const admin = getSupabaseAdmin();
    const { data: assignment, error: aErr } = await admin
      .from("coach_assignments")
      .select("*")
      .eq("id", id)
      .single();
    if (aErr || !assignment) return notFound("Assignment not found");

    const a = assignment as CoachAssignment;

    // AI pre-score when enabled and a text submission is present.
    let aiScore: { ai_score: number; ai_feedback: string; suggestedStatus: "approved" | "needs_improvement" } | null = null;
    if (isCoachAiEnabled() && parsed.data.submission_text) {
      aiScore = await scoreAssignment(
        { title: a.title, description: a.description },
        parsed.data.submission_text,
      );
    }

    const { data, error: dbErr } = await admin
      .from("coach_assignment_submissions")
      .insert({
        assignment_id: id,
        user_id: ctx.userId,
        submission_text: parsed.data.submission_text ?? null,
        attachment_url: parsed.data.attachment_url ?? null,
        manager_status: aiScore ? aiScore.suggestedStatus : "pending",
        ai_score: aiScore ? aiScore.ai_score : null,
        ai_feedback: aiScore ? aiScore.ai_feedback : null,
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
