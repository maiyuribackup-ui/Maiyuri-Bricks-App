import { completeJson } from "./client";
import { SCENARIO_GRADE_SYSTEM, ASSIGNMENT_GRADE_SYSTEM, PASS_THRESHOLD } from "./prompts";
import type { ScenarioGrade, AssignmentGrade } from "@maiyuri/shared";

export async function gradeScenarioAnswer(
  quiz: { question: string; explanation?: string | null },
  answer: string,
): Promise<ScenarioGrade> {
  const user = `SCENARIO: ${quiz.question}\nMODEL GUIDANCE: ${quiz.explanation ?? "(none)"}\nTRAINEE ANSWER: ${answer}`;
  const out = await completeJson<ScenarioGrade>(SCENARIO_GRADE_SYSTEM, user, { maxOutputTokens: 500 });
  if (!out || typeof out.score !== "number") {
    return { score: 0, isCorrect: false, feedback: "Saved — pending manager review.", gaps: [] };
  }
  const score = Math.max(0, Math.min(100, Math.round(out.score)));
  return {
    score,
    isCorrect: score >= PASS_THRESHOLD,
    feedback: out.feedback ?? "",
    gaps: Array.isArray(out.gaps) ? out.gaps : [],
  };
}

export async function scoreAssignment(
  assignment: { title: string; description?: string | null },
  submissionText: string,
): Promise<AssignmentGrade> {
  const user = `ASSIGNMENT: ${assignment.title}\nINSTRUCTIONS: ${assignment.description ?? ""}\nSUBMISSION: ${submissionText}`;
  const out = await completeJson<AssignmentGrade>(ASSIGNMENT_GRADE_SYSTEM, user, { maxOutputTokens: 500 });
  if (!out || typeof out.ai_score !== "number") {
    return { ai_score: 0, ai_feedback: "Saved — pending manager review.", suggestedStatus: "needs_improvement" };
  }
  const score = Math.max(0, Math.min(100, Math.round(out.ai_score)));
  return {
    ai_score: score,
    ai_feedback: out.ai_feedback ?? "",
    suggestedStatus: score >= PASS_THRESHOLD ? "approved" : "needs_improvement",
  };
}
