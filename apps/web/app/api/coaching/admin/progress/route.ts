export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { computeProgressScore } from "@/lib/coaching/progress";
import type { CoachTarget } from "@maiyuri/shared";

/** Compute one learner's progress + weak area (lowest module quiz accuracy). */
async function buildReport(userId: string) {
  const admin = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: lessons }, { data: progress }, { data: attempts }, { data: targets }, { data: subs }] =
    await Promise.all([
      admin.from("coach_lessons").select("id,module_id,title").eq("is_active", true),
      admin.from("coach_lesson_progress").select("lesson_id,status").eq("user_id", userId),
      admin.from("coach_quiz_attempts").select("quiz_id,is_correct,score").eq("user_id", userId),
      admin.from("coach_targets").select("*").eq("user_id", userId),
      admin.from("coach_assignment_submissions").select("manager_status").eq("user_id", userId),
    ]);

  const lessonRows = (lessons as { id: string; module_id: string; title: string }[]) || [];
  const completed = new Set(
    ((progress as { lesson_id: string; status: string }[]) || [])
      .filter((p) => p.status === "completed")
      .map((p) => p.lesson_id),
  );
  const graded = ((attempts as { quiz_id: string; is_correct: boolean | null; score: number }[]) || []).filter(
    (a) => a.is_correct !== null,
  );

  const score = computeProgressScore({
    lessonsTotal: lessonRows.length,
    lessonsCompleted: lessonRows.filter((l) => completed.has(l.id)).length,
    gradedQuizScores: graded.map((a) => Number(a.score) || 0),
    targets: (targets as CoachTarget[]) || [],
    today,
  });

  // Weak area: module with the most incorrect graded attempts.
  const { data: quizzes } = graded.length
    ? await admin.from("coach_quizzes").select("id,module_id,lesson_id").in("id", graded.map((a) => a.quiz_id))
    : { data: [] as { id: string; module_id: string | null; lesson_id: string | null }[] };
  const lessonModule = new Map(lessonRows.map((l) => [l.id, l.module_id]));
  const wrongByModule = new Map<string, number>();
  for (const a of graded) {
    if (a.is_correct) continue;
    const quiz = ((quizzes as { id: string; module_id: string | null; lesson_id: string | null }[]) || []).find(
      (q) => q.id === a.quiz_id,
    );
    const moduleId = quiz?.module_id ?? (quiz?.lesson_id ? lessonModule.get(quiz.lesson_id) : null);
    if (moduleId) wrongByModule.set(moduleId, (wrongByModule.get(moduleId) ?? 0) + 1);
  }
  let weakModuleId: string | null = null;
  let weakCount = 0;
  for (const [m, c] of wrongByModule) if (c > weakCount) { weakModuleId = m; weakCount = c; }
  let weakArea: string | null = null;
  if (weakModuleId) {
    const { data: m } = await admin.from("coach_modules").select("title").eq("id", weakModuleId).single();
    weakArea = (m?.title as string) ?? null;
  }

  const pendingSubs = ((subs as { manager_status: string }[]) || []).filter(
    (s) => s.manager_status === "pending",
  ).length;

  return { userId, progress: score, weakArea, pendingSubmissions: pendingSubs };
}

// GET /api/coaching/admin/progress[?userId=] — per-employee progress (admin)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Admins only");

    const userId = new URL(request.url).searchParams.get("userId");
    if (userId) {
      return success(await buildReport(userId));
    }

    // List mode: a report per provisioned learner (+ their name).
    const admin = getSupabaseAdmin();
    const { data: coachUsers } = await admin
      .from("coach_users")
      .select("user_id,training_path,active_status");
    const rows = (coachUsers as { user_id: string; training_path: string; active_status: boolean }[]) || [];

    const reports = await Promise.all(
      rows.map(async (r) => {
        const rep = await buildReport(r.user_id);
        const { data: u } = await admin.from("users").select("name,email").eq("id", r.user_id).maybeSingle();
        return {
          ...rep,
          training_path: r.training_path,
          active_status: r.active_status,
          name: (u?.name as string) ?? (u?.email as string) ?? r.user_id,
        };
      }),
    );
    return success(reports);
  } catch (err) {
    console.error("coaching/admin/progress GET error:", err);
    return error("Internal server error", 500);
  }
}
