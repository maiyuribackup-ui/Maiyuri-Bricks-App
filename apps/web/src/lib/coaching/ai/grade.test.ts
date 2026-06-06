import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("./client", () => ({ completeJson: vi.fn() }));
import { completeJson } from "./client";
import { gradeScenarioAnswer } from "./grade";

const quiz = { question: "Engineer doubts interlock. Respond.", explanation: "Acknowledge engineer; offer proof; suggest factory visit." };

describe("gradeScenarioAnswer", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns the model grade when JSON is valid", async () => {
    (completeJson as any).mockResolvedValue({ score: 80, isCorrect: true, feedback: "Good.", gaps: [] });
    const g = await gradeScenarioAnswer(quiz, "I'd acknowledge the engineer and offer lab reports + a factory visit.");
    expect(g.score).toBe(80);
    expect(g.isCorrect).toBe(true);
  });
  it("falls back to pending (score 0, isCorrect false) when the model fails", async () => {
    (completeJson as any).mockResolvedValue(null);
    const g = await gradeScenarioAnswer(quiz, "answer");
    expect(g.score).toBe(0);
    expect(g.isCorrect).toBe(false);
    expect(g.feedback).toMatch(/review/i);
  });
});
