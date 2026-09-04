export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  success,
  error,
  notFound,
  unauthorized,
  parseBody,
} from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { gradeQuizAnswer } from "@/lib/coaching/grading";
import { gradeScenarioAnswer } from "@/lib/coaching/ai/grade";
import { isCoachAiEnabled } from "@/lib/coaching/ai/flags";
import type { CoachQuiz, ScenarioGrade } from "@maiyuri/shared";
import { z } from "zod";

const attemptSchema = z.object({ selected_answer: z.string().min(1, "An answer is required") });

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/coaching/quizzes/[id]/attempt — grade (deterministic) + store + return result
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const { id } = await params;

    const parsed = await parseBody(request, attemptSchema);
    if (parsed.error) return parsed.error;

    const admin = getSupabaseAdmin();
    const { data: quiz, error: qErr } = await admin
      .from("coach_quizzes")
      .select("*")
      .eq("id", id)
      .single();
    if (qErr || !quiz) return notFound("Quiz not found");

    const q = quiz as CoachQuiz;
    const grade = gradeQuizAnswer(q, parsed.data.selected_answer);

    // For open-ended types, replace the pending result with an AI grade when enabled.
    let aiGrade: ScenarioGrade | null = null;
    if (grade.pending && isCoachAiEnabled()) {
      aiGrade = await gradeScenarioAnswer(
        { question: q.question, explanation: q.explanation },
        parsed.data.selected_answer,
      );
    }

    const { error: insErr } = await admin.from("coach_quiz_attempts").insert({
      user_id: ctx.userId,
      quiz_id: id,
      selected_answer: parsed.data.selected_answer,
      is_correct: aiGrade ? aiGrade.isCorrect : grade.isCorrect,
      score: aiGrade ? aiGrade.score : grade.score,
      ai_feedback: aiGrade ? aiGrade.feedback : null,
    });
    if (insErr) {
      console.error("coaching quiz attempt insert error:", insErr);
      return error("Failed to record attempt", 500);
    }

    // Surface the explanation + suggested revision lesson only AFTER answering.
    const answeredWrong = aiGrade ? !aiGrade.isCorrect : !grade.isCorrect;
    return success({
      is_correct: aiGrade ? aiGrade.isCorrect : grade.isCorrect,
      score: aiGrade ? aiGrade.score : grade.score,
      pending: aiGrade ? false : grade.pending,
      correct_answer: (aiGrade || grade.pending) ? null : q.correct_answer,
      explanation: q.explanation ?? null,
      suggested_lesson_id: answeredWrong ? q.suggested_lesson_id ?? null : null,
      feedback: aiGrade ? aiGrade.feedback : null,
      gaps: aiGrade ? aiGrade.gaps : null,
    });
  } catch (err) {
    console.error("coaching/quizzes/[id]/attempt POST error:", err);
    return error("Internal server error", 500);
  }
}
