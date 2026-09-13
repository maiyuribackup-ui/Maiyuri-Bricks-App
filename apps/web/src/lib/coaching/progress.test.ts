import { describe, it, expect } from "vitest";
import { computeProgressScore } from "./progress";
import type { CoachTarget } from "@maiyuri/shared";

const target = (over: Partial<CoachTarget>): CoachTarget =>
  ({
    id: Math.random().toString(),
    user_id: "u1",
    target_type: "custom",
    title: "t",
    frequency: "daily",
    status: "not_started",
    completion_value: 0,
    target_value: 1,
    created_at: "",
    updated_at: "",
    ...over,
  }) as CoachTarget;

describe("computeProgressScore", () => {
  it("computes training completion + quiz average as rounded percentages", () => {
    const score = computeProgressScore({
      lessonsTotal: 8,
      lessonsCompleted: 2,
      gradedQuizScores: [100, 0, 100], // avg 66.67 -> 67
      targets: [],
      today: "2026-06-06",
    });
    expect(score.trainingCompletionPct).toBe(25);
    expect(score.quizAveragePct).toBe(67);
    expect(score.lessonsCompleted).toBe(2);
    expect(score.lessonsTotal).toBe(8);
  });

  it("handles empty inputs without dividing by zero", () => {
    const score = computeProgressScore({
      lessonsTotal: 0,
      lessonsCompleted: 0,
      gradedQuizScores: [],
      targets: [],
      today: "2026-06-06",
    });
    expect(score.trainingCompletionPct).toBe(0);
    expect(score.quizAveragePct).toBe(0);
    expect(score.weekTargetCompletionPct).toBe(0);
  });

  it("counts today's daily targets (by due_date or undated)", () => {
    const score = computeProgressScore({
      lessonsTotal: 1,
      lessonsCompleted: 0,
      gradedQuizScores: [],
      targets: [
        target({ frequency: "daily", status: "completed", due_date: "2026-06-06" }),
        target({ frequency: "daily", status: "not_started", due_date: null }),
        target({ frequency: "daily", status: "completed", due_date: "2026-06-05" }), // not today
      ],
      today: "2026-06-06",
    });
    expect(score.todayTargetsTotal).toBe(2);
    expect(score.todayTargetsCompleted).toBe(1);
  });

  it("computes weekly target completion percentage", () => {
    const score = computeProgressScore({
      lessonsTotal: 1,
      lessonsCompleted: 1,
      gradedQuizScores: [],
      targets: [
        target({ frequency: "weekly", status: "completed" }),
        target({ frequency: "weekly", status: "completed" }),
        target({ frequency: "weekly", status: "not_started" }),
        target({ frequency: "weekly", status: "missed" }),
      ],
      today: "2026-06-06",
    });
    expect(score.weekTargetCompletionPct).toBe(50); // 2 of 4
  });
});
