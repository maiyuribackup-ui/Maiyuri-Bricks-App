import { describe, it, expect } from "vitest";
import { extractJson, completeJson } from "./client";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ```json code fences", () => {
    expect(extractJson<{ a: number }>('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("returns null on malformed JSON instead of throwing", () => {
    expect(extractJson("not json")).toBeNull();
  });
});

describe("completeJson fail-open", () => {
  it("returns null when the coaching AI flag is disabled", async () => {
    const prev = process.env.COACH_AI_ENABLED;
    process.env.COACH_AI_ENABLED = "false";
    const out = await completeJson("sys", "user");
    expect(out).toBeNull();
    process.env.COACH_AI_ENABLED = prev;
  });
  it("returns null when GOOGLE_AI_API_KEY is missing", async () => {
    const prevFlag = process.env.COACH_AI_ENABLED;
    const prevKey = process.env.GOOGLE_AI_API_KEY;
    process.env.COACH_AI_ENABLED = "true";
    delete process.env.GOOGLE_AI_API_KEY;
    const out = await completeJson("sys", "user");
    expect(out).toBeNull();
    process.env.COACH_AI_ENABLED = prevFlag;
    if (prevKey !== undefined) process.env.GOOGLE_AI_API_KEY = prevKey;
  });
});
