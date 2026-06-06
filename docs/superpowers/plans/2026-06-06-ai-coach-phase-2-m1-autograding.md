# AI Sales Coach Phase 2 — Milestone 1 (AI foundation + auto-grading) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared `coaching/ai` module (Gemini Flash-Lite) and use it to auto-grade scenario quizzes and assignments, auto-finalized with manager override — the first shippable slice of Phase 2.

**Architecture:** A thin Gemini client wrapper (`completeJson<T>`) with strict-JSON parsing + deterministic fallback and a brand-guardrail preamble. Two pure grading functions (`gradeScenarioAnswer`, `scoreAssignment`) consume it. Existing quiz-attempt and assignment-submit routes call them synchronously and persist to the `ai_*` columns Phase 1 already created. An admin "AI enabled" flag gates the whole layer.

**Tech Stack:** Next.js 14 route handlers, `@google/generative-ai` (`GEMINI_DEFAULT_MODEL` = `gemini-2.5-flash-lite`), Zod, Vitest, Supabase (`getSupabaseAdmin`), Turborepo (`@maiyuri/shared`).

**Spec:** `docs/superpowers/specs/2026-06-06-ai-sales-coach-phase-2-design.md` (§3, §4, §10).

**Conventions:** Bun locally / npm in CI. Run vitest with `bunx vitest run`. Ship via MaiyuriPush flow (branch → PR → `Code Quality` → non-author approval → squash-merge). Working copy: `/Users/ramkumaranganeshan/Developer/MBAppV2`.

---

## File Structure

- Create `apps/web/src/lib/coaching/ai/client.ts` — Gemini wrapper `completeJson<T>(system, user, opts)`; strips code fences, `JSON.parse`, returns `null` on failure (callers supply fallback).
- Create `apps/web/src/lib/coaching/ai/prompts.ts` — `BRAND_GUARDRAILS` preamble + grading system prompts.
- Create `apps/web/src/lib/coaching/ai/grade.ts` — `gradeScenarioAnswer`, `scoreAssignment` (pure: build prompt → call client → validate → fallback).
- Create `apps/web/src/lib/coaching/ai/client.test.ts`, `grade.test.ts` — unit tests with a mocked client.
- Modify `packages/shared/src/types.ts` — add `ScenarioGrade`, `AssignmentGrade` interfaces.
- Modify `apps/web/app/api/coaching/quizzes/[id]/attempt/route.ts` — call `gradeScenarioAnswer` for scenario/voice_text; persist `score`/`is_correct`/`ai_feedback`.
- Modify `apps/web/app/api/coaching/assignments/[id]/submit/route.ts` — call `scoreAssignment`; persist `ai_score`/`ai_feedback`/`manager_status`.
- Modify `apps/web/src/lib/coaching/ai/flags.ts` (create) — `isCoachAiEnabled()` reads `COACH_AI_ENABLED` env (default on).
- Modify the quiz/assignment UI components — show an "AI-graded · manager can adjust" badge.

---

## Task 1: AI client wrapper

**Files:**
- Create: `apps/web/src/lib/coaching/ai/client.ts`
- Test: `apps/web/src/lib/coaching/ai/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// client.test.ts
import { describe, it, expect, vi } from "vitest";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bunx vitest run src/lib/coaching/ai/client.test.ts`
Expected: FAIL — `extractJson` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// client.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_DEFAULT_MODEL } from "@/lib/ai/models";

/** Strip ```json fences and parse; return null on any failure (never throws). */
export function extractJson<T>(raw: string): T | null {
  try {
    const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** One Gemini Flash-Lite call returning strict JSON, or null on failure. */
export async function completeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxOutputTokens?: number } = {},
): Promise<T | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_DEFAULT_MODEL,
      generationConfig: { maxOutputTokens: opts.maxOutputTokens ?? 700, responseMimeType: "application/json" },
    });
    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    return extractJson<T>(result.response.text());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bunx vitest run src/lib/coaching/ai/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/coaching/ai/client.ts apps/web/src/lib/coaching/ai/client.test.ts
git commit -m "feat(coaching): add Gemini AI client wrapper with strict-JSON + fallback"
```

---

## Task 2: Brand-guardrail prompts + AI-enabled flag

**Files:**
- Create: `apps/web/src/lib/coaching/ai/prompts.ts`
- Create: `apps/web/src/lib/coaching/ai/flags.ts`

- [ ] **Step 1: Write `flags.ts`**

```ts
// flags.ts
/** Master switch for the coaching AI layer. Default ON; set COACH_AI_ENABLED=false to disable. */
export function isCoachAiEnabled(): boolean {
  return process.env.COACH_AI_ENABLED !== "false";
}
```

- [ ] **Step 2: Write `prompts.ts`**

```ts
// prompts.ts
export const BRAND_GUARDRAILS = `You are the Maiyuri Bricks sales coach. Enforce these brand rules in all output:
- Make only proof-backed claims. NEVER say "guaranteed cooler", "zero plastering", "100% waterproof", or "carbon negative".
- Any structural/strength claim must be "subject to engineer approval".
- Never attack competitors (incl. Kerala bricks). Reframe to total wall value.
- Always be encouraging, specific, and end on a concrete next step.
Respond ONLY with valid JSON matching the requested shape. No prose outside JSON.`;

export const SCENARIO_GRADE_SYSTEM = `${BRAND_GUARDRAILS}
Grade a trainee's open-ended answer to a sales scenario. Output JSON:
{"score": <0-100 int>, "isCorrect": <bool, true if score>=70>, "feedback": "<2-3 sentences, encouraging + specific>", "gaps": ["<missed point>", ...]}`;

export const ASSIGNMENT_GRADE_SYSTEM = `${BRAND_GUARDRAILS}
Grade a trainee's assignment submission against its description. Output JSON:
{"ai_score": <0-100 int>, "ai_feedback": "<3-4 sentences>", "suggestedStatus": "approved" | "needs_improvement"}
Use "approved" only when ai_score >= 70.`;
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/coaching/ai/prompts.ts apps/web/src/lib/coaching/ai/flags.ts
git commit -m "feat(coaching): brand-guardrail grading prompts + AI-enabled flag"
```

---

## Task 3: Shared grade types

**Files:**
- Modify: `packages/shared/src/types.ts` (append near the other Coach* types)

- [ ] **Step 1: Append types**

```ts
// types.ts (append)
export interface ScenarioGrade {
  score: number;
  isCorrect: boolean;
  feedback: string;
  gaps: string[];
}
export interface AssignmentGrade {
  ai_score: number;
  ai_feedback: string;
  suggestedStatus: "approved" | "needs_improvement";
}
```

- [ ] **Step 2: Typecheck shared**

Run: `cd packages/shared && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): ScenarioGrade + AssignmentGrade types"
```

---

## Task 4: `gradeScenarioAnswer`

**Files:**
- Create/Modify: `apps/web/src/lib/coaching/ai/grade.ts`
- Test: `apps/web/src/lib/coaching/ai/grade.test.ts`

- [ ] **Step 1: Write the failing test (mock the client)**

```ts
// grade.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bunx vitest run src/lib/coaching/ai/grade.test.ts`
Expected: FAIL — `gradeScenarioAnswer` not defined.

- [ ] **Step 3: Implement**

```ts
// grade.ts
import { completeJson } from "./client";
import { SCENARIO_GRADE_SYSTEM, ASSIGNMENT_GRADE_SYSTEM } from "./prompts";
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
  return {
    score: Math.max(0, Math.min(100, Math.round(out.score))),
    isCorrect: out.score >= 70,
    feedback: out.feedback ?? "",
    gaps: Array.isArray(out.gaps) ? out.gaps : [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bunx vitest run src/lib/coaching/ai/grade.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/coaching/ai/grade.ts apps/web/src/lib/coaching/ai/grade.test.ts
git commit -m "feat(coaching): gradeScenarioAnswer with deterministic fallback"
```

---

## Task 5: `scoreAssignment`

**Files:**
- Modify: `apps/web/src/lib/coaching/ai/grade.ts`
- Modify: `apps/web/src/lib/coaching/ai/grade.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// grade.test.ts (append inside file)
import { scoreAssignment } from "./grade";
describe("scoreAssignment", () => {
  beforeEach(() => vi.clearAllMocks());
  it("maps model output to an AssignmentGrade", async () => {
    (completeJson as any).mockResolvedValue({ ai_score: 90, ai_feedback: "Strong.", suggestedStatus: "approved" });
    const g = await scoreAssignment({ title: "Explain bricks", description: "60s explanation" }, "Sir, interlock bricks...");
    expect(g.suggestedStatus).toBe("approved");
  });
  it("falls back to needs_improvement/pending on model failure", async () => {
    (completeJson as any).mockResolvedValue(null);
    const g = await scoreAssignment({ title: "x", description: "y" }, "z");
    expect(g.suggestedStatus).toBe("needs_improvement");
    expect(g.ai_score).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bunx vitest run src/lib/coaching/ai/grade.test.ts`
Expected: FAIL — `scoreAssignment` not defined.

- [ ] **Step 3: Implement (append to grade.ts)**

```ts
// grade.ts (append)
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
    suggestedStatus: score >= 70 ? "approved" : "needs_improvement",
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && bunx vitest run src/lib/coaching/ai/grade.test.ts`
Expected: PASS (4 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/coaching/ai/grade.ts apps/web/src/lib/coaching/ai/grade.test.ts
git commit -m "feat(coaching): scoreAssignment with deterministic fallback"
```

---

## Task 6: Wire grading into the quiz-attempt route

**Files:**
- Modify: `apps/web/app/api/coaching/quizzes/[id]/attempt/route.ts`

- [ ] **Step 1: Read the current handler** to find where a scenario/voice_text attempt is stored with `is_correct=null`.

Run: `sed -n '1,120p' apps/web/app/api/coaching/quizzes/[id]/attempt/route.ts`

- [ ] **Step 2: Add grading for open-ended types**

In the branch that currently sets `is_correct = null` for `question_type` in `("scenario","voice_text")`, replace with:

```ts
import { gradeScenarioAnswer } from "@/lib/coaching/ai/grade";
import { isCoachAiEnabled } from "@/lib/coaching/ai/flags";

// ...inside the handler, for scenario / voice_text:
let aiFeedback: string | null = null;
let isCorrect: boolean | null = null;
let score = 0;
if (isCoachAiEnabled()) {
  const g = await gradeScenarioAnswer(
    { question: quiz.question, explanation: quiz.explanation },
    selectedAnswer,
  );
  score = g.score; isCorrect = g.isCorrect; aiFeedback = g.feedback;
}
// persist: score, is_correct: isCorrect, ai_feedback: aiFeedback in the coach_quiz_attempts insert
```

Return the `feedback` + `gaps` in the route's JSON response so the quiz UI can show it.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/coaching/quizzes/[id]/attempt/route.ts"
git commit -m "feat(coaching): auto-grade scenario quiz attempts via AI"
```

---

## Task 7: Wire scoring into the assignment-submit route

**Files:**
- Modify: `apps/web/app/api/coaching/assignments/[id]/submit/route.ts`

- [ ] **Step 1: Read the current handler.**

Run: `sed -n '1,120p' apps/web/app/api/coaching/assignments/[id]/submit/route.ts`

- [ ] **Step 2: Add scoring before the insert**

```ts
import { scoreAssignment } from "@/lib/coaching/ai/grade";
import { isCoachAiEnabled } from "@/lib/coaching/ai/flags";

let ai_score: number | null = null;
let ai_feedback: string | null = null;
let manager_status = "pending";
if (isCoachAiEnabled()) {
  const g = await scoreAssignment({ title: assignment.title, description: assignment.description }, submissionText);
  ai_score = g.ai_score; ai_feedback = g.ai_feedback; manager_status = g.suggestedStatus;
}
// persist ai_score, ai_feedback, manager_status in the coach_assignment_submissions insert
```

(Manager override path is unchanged: `PATCH /api/coaching/submissions/[id]` still sets `manager_status` + `manager_comment`.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/coaching/assignments/[id]/submit/route.ts"
git commit -m "feat(coaching): AI-score assignment submissions (auto-finalize, manager override)"
```

---

## Task 8: UI — show AI grade + "manager can adjust" badge

**Files:**
- Modify: `apps/web/app/(dashboard)/coaching/quiz/[quizId]/page.tsx` — render `ai_feedback` + `gaps` in the result panel.
- Modify: `apps/web/app/(dashboard)/coaching/assignments/page.tsx` — show `ai_score`/`ai_feedback` + an "AI-graded · manager can adjust" badge on submitted items.

- [ ] **Step 1: Quiz result** — in the graded-result block, when `result.feedback` is present, render it and a bulleted `result.gaps` list (only if non-empty).

- [ ] **Step 2: Assignment list** — for a submission with `ai_score != null`, render the score, `ai_feedback`, and a small muted badge `AI-graded · manager can adjust`.

- [ ] **Step 3: Typecheck + lint**

Run: `cd "/Users/ramkumaranganeshan/Developer/MBAppV2" && bun run typecheck && bun run lint`
Expected: typecheck exit 0; lint 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/coaching/quiz/[quizId]/page.tsx" "apps/web/app/(dashboard)/coaching/assignments/page.tsx"
git commit -m "feat(coaching): surface AI grade + manager-override badge in UI"
```

---

## Task 9: Green-gate + ship

- [ ] **Step 1: Full local gate**

Run: `~/.claude/Skills/MaiyuriPush/scripts/pre-push-verify.sh`
Expected: `✅ READY TO PUSH` (typecheck 4/4, lint 0 errors, all tests pass incl. the new client/grade tests).

- [ ] **Step 2: Push the feature branch**

```bash
cd "/Users/ramkumaranganeshan/Developer/MBAppV2"
git push -u origin feat/ai-coach-p2-autograding   # NEVER --force; NEVER main
```

- [ ] **Step 3: Open PR → main, trigger CodeRabbit**

```bash
gh pr create --repo maiyuribackup-ui/Maiyuri-Bricks-App --base main --head feat/ai-coach-p2-autograding \
  --title "feat(coaching): Phase 2 M1 — AI auto-grading" --body "Auto-grade scenario quizzes + assignments (auto-finalize, manager override). Spec: docs/superpowers/specs/2026-06-06-ai-sales-coach-phase-2-design.md"
gh pr comment <n> --body "@coderabbitai review"
```

- [ ] **Step 4: Verify the required check via check-runs (not /status), get non-author approval, squash-merge.**

- [ ] **Step 5: Confirm `GOOGLE_AI_API_KEY` exists on Vercel prod** (server-runtime var) before relying on grading in prod:

```bash
# per MaiyuriOps: GET /v9/projects/$PRJ/env?teamId=$TEAM ; add if missing
```

If absent, grading silently falls back to "pending manager review" — safe, but AI won't run until the key is set. No migration in this milestone.

---

## Self-Review

- **Spec coverage:** §3 module layout (client/prompts/grade/flags) → Tasks 1,2,4,5. §4 auto-grading (scenario quizzes + assignments, auto-finalize + manager override) → Tasks 6,7,8. §10 cross-cutting (shared types, AI-enabled toggle, fallback, tests) → Tasks 2,3,4,5,9. Capabilities B–E (Ask-the-Coach, roleplay, daily/weekly feedback, cron) are explicitly **out of scope for M1** — each gets its own plan.
- **Placeholder scan:** none — every code step shows real code; the only `<n>`/`<ts>` tokens are PR number / not-applicable.
- **Type consistency:** `ScenarioGrade`/`AssignmentGrade` defined in Task 3 are used unchanged in Tasks 4–8; `completeJson`/`extractJson` signatures match between Task 1 and its callers; `suggestedStatus` values (`approved`/`needs_improvement`) match the `coach_assignment_submissions.manager_status` CHECK constraint.
- **Note:** confirm the exact property names in the two routes (Task 6/7 Step 1 reads them first) since Phase 1 field names (`selectedAnswer` vs `selected_answer`, `submissionText` vs `submission_text`) must match the existing handler — adapt the snippet to what the read reveals.
