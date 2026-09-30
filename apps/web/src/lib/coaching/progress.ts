/**
 * Pure progress-aggregation helpers for the AI Sales Coach dashboard.
 * No DB / no AI — fed plain rows so they are easily unit-tested.
 */
import type { CoachProgressScore, CoachTarget } from "@maiyuri/shared";

export interface ProgressInputs {
  lessonsTotal: number;
  lessonsCompleted: number;
  /** Scores (0–100) of graded quiz attempts (exclude pending). */
  gradedQuizScores: number[];
  /** All of this learner's targets (any frequency/date). */
  targets: Pick<CoachTarget, "frequency" | "status" | "due_date">[];
  /** ISO date (YYYY-MM-DD) treated as "today". */
  today: string;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function computeProgressScore(input: ProgressInputs): CoachProgressScore {
  const {
    lessonsTotal,
    lessonsCompleted,
    gradedQuizScores,
    targets,
    today,
  } = input;

  const quizAveragePct =
    gradedQuizScores.length > 0
      ? Math.round(
          gradedQuizScores.reduce((a, b) => a + b, 0) / gradedQuizScores.length,
        )
      : 0;

  const todays = targets.filter(
    (t) => t.frequency === "daily" && (t.due_date ?? today) === today,
  );
  const todayDone = todays.filter((t) => t.status === "completed").length;

  const weekly = targets.filter((t) => t.frequency === "weekly");
  const weeklyDone = weekly.filter((t) => t.status === "completed").length;

  return {
    trainingCompletionPct: pct(lessonsCompleted, lessonsTotal),
    quizAveragePct,
    lessonsCompleted,
    lessonsTotal,
    todayTargetsCompleted: todayDone,
    todayTargetsTotal: todays.length,
    weekTargetCompletionPct: pct(weeklyDone, weekly.length),
  };
}
