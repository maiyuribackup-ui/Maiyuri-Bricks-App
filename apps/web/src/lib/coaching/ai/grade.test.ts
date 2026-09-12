import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("./client", () => ({ completeJson: vi.fn() }));
import { completeJson } from "./client";
import { gradeScenarioAnswer, scoreAssignment } from "./grade";

const quiz = { question: "Engineer doubts interlock. Respond.", explanation: "Acknowledge engineer; offer proof; suggest factory visit." };

describe("gradeScenarioAnswer", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns the model grade when JSON is valid", async () => {
    (completeJson as any).mockResolvedValue({ score: 80, isCorrect: true, feedback: "Good.", gaps: [] });
    const g = await gradeScenarioAnswer(quiz, "I'd acknowledge the engineer and offer lab reports + a factory visit.");
    expect(g.score).toBe(80);
    expect(g.isCorrect).toBe(true);
  });
  it("returns null when the model fails", async () => {
    (completeJson as any).mockResolvedValue(null);
    const g = await gradeScenarioAnswer(quiz, "answer");
    expect(g).toBeNull();
  });
});

describe("scoreAssignment", () => {
  beforeEach(() => vi.clearAllMocks());
  it("maps model output to an AssignmentGrade", async () => {
    (completeJson as any).mockResolvedValue({ ai_score: 90, ai_feedback: "Strong.", suggestedStatus: "approved" });
    const g = await scoreAssignment({ title: "Explain bricks", description: "60s explanation" }, "Sir, interlock bricks...");
    expect(g.suggestedStatus).toBe("approved");
  });
  it("returns null on model failure", async () => {
    (completeJson as any).mockResolvedValue(null);
    const g = await scoreAssignment({ title: "x", description: "y" }, "z");
    expect(g).toBeNull();
  });
});
