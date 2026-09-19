import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ANALYSIS_MODEL } from "./analysis.js";

test("all post-transcription analysis paths use the supported canonical model", () => {
  const source = readFileSync(join(__dirname, "analysis.ts"), "utf8");
  const sharedModelReferences = source.match(/model: ANALYSIS_MODEL/g) ?? [];

  assert.equal(ANALYSIS_MODEL, "gemini-2.5-flash");
  assert.equal(source.includes("gemini-2.0-flash"), false);
  assert.equal(sharedModelReferences.length, 3);
});
