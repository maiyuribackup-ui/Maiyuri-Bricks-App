export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext, getOrCreateCoachUser } from "@/lib/coaching/context";
import { computeProgressScore } from "@/lib/coaching/progress";
import type {
  CoachLesson,
  CoachModule,
  CoachTarget,
  CoachTodayPlanItem,
} from "@maiyuri/shared";

/** A module applies to a learner if it lists their path or targets everyone. */
function applies(mod: CoachModule, path: string): boolean {
  return (
    !mod.role_applicability ||
    mod.role_applicability.length === 0 ||
    mod.role_applicability.includes(path)
  );
}

// GET /api/coaching/me — learner dashboard bundle (no AI)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();

    const admin = getSupabaseAdmin();
    const coachUser = await getOrCreateCoachUser(ctx.userId, ctx.role);
    const path = coachUser.training_path;
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: modules }, { data: targets }] = await Promise.all([
      admin.from("coach_modules").select("*").eq("is_active", true).order("sequence_order", { ascending: true }),
      admin.from("coach_targets").select("*").eq("user_id", ctx.userId),
    ]);

    const applicable = ((modules as CoachModule[]) || []).filter((m) => applies(m, path));
    const moduleIds = applicable.map((m) => m.id);

    const { data: lessons } = moduleIds.length
      ? await admin
          .from("coach_lessons")
          .select("*")
          .in("module_id", moduleIds)
          .eq("is_active", true)
          .order("sequence_order", { ascending: true })
      : { data: [] as CoachLesson[] };

    const lessonList = (lessons as CoachLesson[]) || [];
    const lessonIds = lessonList.map((l) => l.id);

    const [{ data: progress }, { data: attempts }, { data: assignments }] =
      await Promise.all([
        lessonIds.length
          ? admin.from("coach_lesson_progress").select("lesson_id,status").eq("user_id", ctx.userId).in("lesson_id", lessonIds)
          : Promise.resolve({ data: [] as { lesson_id: string; status: string }[] }),
        admin.from("coach_quiz_attempts").select("score,is_correct").eq("user_id", ctx.userId).not("is_correct", "is", null),
        admin.from("coach_assignments").select("id,title,is_active").eq("is_active", true),
      ]);

    const completedIds = new Set(
      ((progress as { lesson_id: string; status: string }[]) || [])
        .filter((p) => p.status === "completed")
        .map((p) => p.lesson_id),
    );
    const gradedQuizScores = ((attempts as { score: number; is_correct: boolean | null }[]) || []).map(
      (a) => Number(a.score) || 0,
    );

    const score = computeProgressScore({
      lessonsTotal: lessonList.length,
      lessonsCompleted: completedIds.size,
      gradedQuizScores,
      targets: (targets as CoachTarget[]) || [],
      today,
    });

    // Today's plan: next 2 incomplete lessons + today's daily targets + active assignments.
    const todayPlan: CoachTodayPlanItem[] = [];
    for (const l of lessonList) {
      if (!completedIds.has(l.id)) {
        todayPlan.push({ kind: "lesson", refId: l.id, title: l.title, done: false });
        if (todayPlan.length >= 2) break;
      }
    }
    for (const t of ((targets as CoachTarget[]) || []).filter(
      (t) => t.frequency === "daily" && (t.due_date ?? today) === today,
    )) {
      todayPlan.push({
        kind: "target",
        refId: t.id,
        title: t.title,
        done: t.status === "completed",
      });
    }
    for (const a of ((assignments as { id: string; title: string }[]) || []).slice(0, 2)) {
      todayPlan.push({ kind: "assignment", refId: a.id, title: a.title, done: false });
    }

    return success({
      coachUser,
      isAdmin: ctx.isAdmin,
      progress: score,
      todayPlan,
      targets: (targets as CoachTarget[]) || [],
    });
  } catch (err) {
    console.error("coaching/me GET error:", err);
    return error("Failed to load coaching dashboard", 500);
  }
}
