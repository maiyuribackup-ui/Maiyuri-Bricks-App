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
import { updateCoachLessonSchema, type CoachLesson, type CoachQuiz } from "@maiyuri/shared";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/coaching/lessons/[id] — lesson + its quizzes (answers hidden for learners)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: lesson, error: lErr } = await admin
      .from("coach_lessons")
      .select("*")
      .eq("id", id)
      .single();
    if (lErr || !lesson) return notFound("Lesson not found");

    const [{ data: quizzes }, { data: progress }] = await Promise.all([
      admin.from("coach_quizzes").select("*").eq("lesson_id", id).eq("is_active", true).order("sequence_order", { ascending: true }),
      admin.from("coach_lesson_progress").select("status").eq("user_id", ctx.userId).eq("lesson_id", id).maybeSingle(),
    ]);

    // Never leak correct answers/explanations to a learner taking the quiz.
    const quizList = ((quizzes as CoachQuiz[]) || []).map((q) =>
      ctx.isAdmin
        ? q
        : { ...q, correct_answer: null, explanation: null, suggested_lesson_id: null },
    );

    return success({
      lesson: lesson as CoachLesson,
      quizzes: quizList,
      completed: (progress as { status: string } | null)?.status === "completed",
    });
  } catch (err) {
    console.error("coaching/lessons/[id] GET error:", err);
    return error("Internal server error", 500);
  }
}

// PATCH /api/coaching/lessons/[id] — update (admin)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const parsed = await parseBody(request, updateCoachLessonSchema);
    if (parsed.error) return parsed.error;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_lessons")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (dbErr || !data) return error("Failed to update lesson", 500);
    return success<CoachLesson>(data as CoachLesson);
  } catch (err) {
    console.error("coaching/lessons/[id] PATCH error:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/coaching/lessons/[id] — soft-retire (admin)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const { error: dbErr } = await getSupabaseAdmin()
      .from("coach_lessons")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (dbErr) return error("Failed to retire lesson", 500);
    return success({ retired: true });
  } catch (err) {
    console.error("coaching/lessons/[id] DELETE error:", err);
    return error("Internal server error", 500);
  }
}
