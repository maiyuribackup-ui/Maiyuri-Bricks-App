/**
 * Deterministic quiz grading for the AI Sales Coach (Phase 1 — no AI).
 *
 * - mcq        → exact match of the selected option key vs correct_answer
 * - fill_blank → normalized (case/space/punctuation-insensitive) text match
 * - scenario / voice_text → cannot be auto-graded; left pending (is_correct=null)
 *   for manager review (and AI scoring in Phase 2).
 */
import type { CoachQuiz } from "@maiyuri/shared";

export interface GradeResult {
  /** true / false for auto-gradable types; null when pending review. */
  isCorrect: boolean | null;
  /** 0–100. 0 while pending. */
  score: number;
  pending: boolean;
}

/** Lowercase, trim, strip punctuation, collapse internal whitespace. */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // drop punctuation/symbols, keep letters+numbers
    .replace(/\s+/g, " ")
    .trim();
}

export function gradeQuizAnswer(
  quiz: Pick<CoachQuiz, "question_type" | "correct_answer">,
  selectedAnswer: string,
): GradeResult {
  const selected = (selectedAnswer ?? "").toString();

  switch (quiz.question_type) {
    case "mcq": {
      const correct = (quiz.correct_answer ?? "").toString().trim();
      const isCorrect = correct.length > 0 && selected.trim() === correct;
      return { isCorrect, score: isCorrect ? 100 : 0, pending: false };
    }
    case "fill_blank": {
      const correct = quiz.correct_answer ?? "";
      const isCorrect =
        correct.trim().length > 0 &&
        normalizeAnswer(selected) === normalizeAnswer(correct);
      return { isCorrect, score: isCorrect ? 100 : 0, pending: false };
    }
    case "scenario":
    case "voice_text":
    default:
      // Open-ended → store the answer, mark pending for manager/AI review.
      return { isCorrect: null, score: 0, pending: true };
  }
}
