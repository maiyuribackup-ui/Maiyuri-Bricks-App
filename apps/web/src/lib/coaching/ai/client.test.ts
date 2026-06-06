import { describe, it, expect } from "vitest";
import { extractJson } from "./client";

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
