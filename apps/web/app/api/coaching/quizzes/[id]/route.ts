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
import { updateCoachQuizSchema, type CoachQuiz } from "@maiyuri/shared";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/coaching/quizzes/[id] — answers hidden for learners
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const { id } = await params;

    const { data: quiz, error: qErr } = await getSupabaseAdmin()
      .from("coach_quizzes")
      .select("*")
      .eq("id", id)
      .single();
    if (qErr || !quiz) return notFound("Quiz not found");

    const q = quiz as CoachQuiz;
    return success(
      ctx.isAdmin
        ? q
        : { ...q, correct_answer: null, explanation: null, suggested_lesson_id: null },
    );
  } catch (err) {
    console.error("coaching/quizzes/[id] GET error:", err);
    return error("Internal server error", 500);
  }
}

// PATCH /api/coaching/quizzes/[id] — update (admin)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const parsed = await parseBody(request, updateCoachQuizSchema);
    if (parsed.error) return parsed.error;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_quizzes")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (dbErr || !data) return error("Failed to update quiz", 500);
    return success<CoachQuiz>(data as CoachQuiz);
  } catch (err) {
    console.error("coaching/quizzes/[id] PATCH error:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/coaching/quizzes/[id] — soft-retire (admin)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const { error: dbErr } = await getSupabaseAdmin()
      .from("coach_quizzes")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (dbErr) return error("Failed to retire quiz", 500);
    return success({ retired: true });
  } catch (err) {
    console.error("coaching/quizzes/[id] DELETE error:", err);
    return error("Internal server error", 500);
  }
}
