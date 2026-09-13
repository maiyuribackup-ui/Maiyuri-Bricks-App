import { describe, it, expect } from "vitest";
import { gradeQuizAnswer, normalizeAnswer } from "./grading";

describe("normalizeAnswer", () => {
  it("lowercases, trims, strips punctuation, collapses spaces", () => {
    expect(normalizeAnswer("  Wall! ")).toBe("wall");
    expect(normalizeAnswer("Total  WALL, value.")).toBe("total wall value");
    expect(normalizeAnswer("WALL")).toBe(normalizeAnswer("wall"));
  });
});

describe("gradeQuizAnswer", () => {
  it("grades MCQ by exact key match", () => {
    const quiz = { question_type: "mcq" as const, correct_answer: "C" };
    expect(gradeQuizAnswer(quiz, "C")).toEqual({ isCorrect: true, score: 100, pending: false });
    expect(gradeQuizAnswer(quiz, "A")).toEqual({ isCorrect: false, score: 0, pending: false });
  });

  it("MCQ with no correct answer configured is never correct", () => {
    const quiz = { question_type: "mcq" as const, correct_answer: null };
    expect(gradeQuizAnswer(quiz, "A")).toEqual({ isCorrect: false, score: 0, pending: false });
  });

  it("grades fill_blank case/punctuation/space-insensitively", () => {
    const quiz = { question_type: "fill_blank" as const, correct_answer: "wall" };
    expect(gradeQuizAnswer(quiz, "Wall").isCorrect).toBe(true);
    expect(gradeQuizAnswer(quiz, "  WALL! ").isCorrect).toBe(true);
    expect(gradeQuizAnswer(quiz, "floor").isCorrect).toBe(false);
    expect(gradeQuizAnswer(quiz, "wall").score).toBe(100);
  });

  it("leaves scenario answers pending for review", () => {
    const quiz = { question_type: "scenario" as const, correct_answer: null };
    expect(gradeQuizAnswer(quiz, "a long open answer")).toEqual({
      isCorrect: null,
      score: 0,
      pending: true,
    });
  });

  it("leaves voice_text answers pending", () => {
    const quiz = { question_type: "voice_text" as const, correct_answer: null };
    expect(gradeQuizAnswer(quiz, "spoken answer").pending).toBe(true);
  });
});
