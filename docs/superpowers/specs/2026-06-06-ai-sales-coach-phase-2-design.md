# AI Sales Coach — Phase 2 Design

**Date:** 2026-06-06
**Status:** Approved (design) — ready for implementation planning
**Builds on:** Phase 1 (merged PR #42, migration `20260606000001_ai_sales_coach.sql`, live on mb.maiyuri.com)

---

## 1. Purpose

Phase 1 shipped the AI Sales Coach foundation: schema, admin CMS, learning content,
deterministic quiz grading, assignments, targets, progress tracking — **no AI**. Phase 2
adds the intelligent layer on top of the tables and `ai_*` columns Phase 1 already
created. Goal: a new Production Supervisor (and future hires) gets *active* coaching —
instant feedback on open-ended answers, a customer-roleplay trainer, grounded answers to
product/objection questions, and a daily nudge — without waiting on a manager.

## 2. Confirmed scope decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope | Full Phase 2 architecture (all 5 capabilities); **auto-grading built first** |
| 2 | Grading autonomy | **Auto-finalize, manager can override** (AI result is the learner's immediate result; manager may adjust) |
| 3 | Model | **Gemini 2.5 Flash-Lite for everything** (single `@google/generative-ai` SDK, lowest cost) |
| 4 | Roleplay modality | **Text chat only** (voice deferred to a later phase) |
| 5 | Feedback delivery | **In-app + proactive push/Telegram** (the cron layer is pulled into Phase 2) |

Architecture approach chosen: **A — shared `coaching/ai/` module + document-stuffing
grounding + reuse of existing cron/push infra.** Rejected: per-route inline AI (duplication,
untestable) and pgvector RAG (overkill for a ~5–50 article corpus — YAGNI).

## 3. Module layout

```
apps/web/src/lib/coaching/ai/
  client.ts        # one wrapper: completeJson<T>(system, user, opts) over GEMINI_MODEL.FLASH_LITE
  grounding.ts     # fetchKnowledge(categories?, tags?) → context block from coach_knowledge_base + brand guardrails
  grade.ts         # gradeScenarioAnswer(quiz, answer) / scoreAssignment(assignment, submissionText)
  roleplay.ts      # roleplayTurn(scenario, history, userMsg) / scoreRoleplay(scenario, transcript)
  coaching.ts      # generateDailyCoaching(progress, weakAreas) / generateWeeklyReview(stats)
  prompts.ts       # all system prompts + the shared brand-guardrail preamble
  *.test.ts        # parser + prompt-builder unit tests (client mocked)
```

**Two invariants every AI call obeys:**
1. **Strict-JSON + fallback.** Each call requests strict JSON, parses + Zod-validates the
   result, and falls back to deterministic text on any parse/validation failure. An AI
   failure must NEVER throw a 500 into a learner flow.
2. **Brand guardrails in every prompt.** A shared preamble enforces the same rules as the
   Phase 1 seed content: proof-backed claims only; never "guaranteed cooler / zero
   plastering / 100% waterproof / carbon negative"; structural claims are "subject to
   engineer approval"; no competitor attacks; always end on a next step.

Reuse map: `GEMINI_MODEL` registry (`apps/web/src/lib/ai/models.ts`, `FLASH_LITE` default),
the `completeJson<T>` shape from `nudge-ai.ts`, `getSupabaseAdmin()`, `@/lib/api-utils`
(`success`/`error`/`parseBody`/`handleZodError`), the Phase 1 coaching context helpers,
`sendPushToUsers` (`@/lib/push/fcm`), `@/lib/telegram`, and the `vercel.json` cron +
`CRON_SECRET` pattern from `notifications/daily-summary`.

## 4. Capability A — AI auto-grading *(first slice, highest ROI)*

**Scenario quizzes.** Phase 1 stores scenario/voice_text attempts with `is_correct=null`
(pending). `gradeScenarioAnswer(quiz, answer)` returns
`{ score: 0–100, isCorrect: boolean, feedback: string, gaps: string[] }`, grounded in the
quiz's `explanation` + parent lesson. The existing
`POST /api/coaching/quizzes/[id]/attempt` route writes `score`, `is_correct`, `ai_feedback`
synchronously and returns them — **auto-finalized**. Deterministic MCQ/fill-blank grading
is unchanged.

**Assignments.** On `POST /api/coaching/assignments/[id]/submit`,
`scoreAssignment(assignment, submissionText)` returns
`{ ai_score: 0–100, ai_feedback: string, suggestedStatus: 'approved' | 'needs_improvement' }`.
The route stores `ai_score`/`ai_feedback` and sets `manager_status` to the suggestion so the
learner sees a result immediately.

**Manager override.** The existing `PATCH /api/coaching/submissions/[id]` already lets a
manager set `manager_status` + `manager_comment`; UI labels AI-graded items "AI-graded ·
manager can adjust."

Data flow: `route → ai/grade.ts (grounded in rubric) → write row → return`. One Flash-Lite
call (~1–2s), within serverless limits.

## 5. Capability B — "Ask the Coach" (KB-grounded Q&A)

New `POST /api/coaching/ask` → `answerFromKB(question)`. `grounding.ts` selects the most
relevant `coach_knowledge_base` rows (category-keyword + tag overlap, capped at ~8 articles
/ ~6k chars), stuffs them into the prompt, and Gemini answers **only from that context**,
returning `{ answer: string, sourceSlugs: string[] }`. If the context doesn't support an
answer, it replies "check with the owner/technical team" rather than inventing. Surfaced as
a chat box on `/coaching`. No persistence in Phase 2 (optional `coach_qa_log` later).

## 6. Capability C — AI roleplay simulator (text)

Routes: `POST /api/coaching/roleplay` (start → create `coach_roleplays` row with
`scenario_type` + empty `conversation_json`) and
`POST /api/coaching/roleplay/[id]/turn` (append user message → `roleplayTurn()` returns the
simulated customer's next line, KB-grounded so the customer raises real Maiyuri objections).
On "End & score" → `scoreRoleplay(transcript)` fills `ai_score` plus the four sub-scores the
schema already has (`clarity_score`, `empathy_score`, `product_score`, `closing_score`) and
`ai_feedback`. New page `/coaching/roleplay` (scenario picker → chat → scorecard). Scenarios
derive from the objection-handling + factory-visit modules.

## 7. Capability D — daily/weekly feedback & weak-area coaching

`generateDailyCoaching(progressScore, weakAreas)` converts the Phase 1
`computeProgressScore` output + quiz/target history into a short, specific nudge (e.g.
"Objection-handling quiz avg 60% — replay *engineer-doubt*, then try a roleplay").
`generateWeeklyReview(stats)` produces the `/coaching/review` narrative (Phase 1 showed raw
aggregates). Both render in-app, computed on load and **cached per day** (see schema) so
repeated visits don't regenerate.

## 8. Capability E — proactive push / Telegram

New cron `GET /api/coaching/cron/daily`, added to `vercel.json` `crons` (e.g. `30 3 * * *`
≈ 09:00 IST), `CRON_SECRET`-guarded exactly like `daily-summary`. For each active
`coach_user`: compute progress → `generateDailyCoaching` → `sendPushToUsers([userId], …)`
(FCM) + `sendTelegram(...)`. A weekly variant (Sundays) sends the weekly review. Per-run
cost is bounded by staff count (a handful of Flash-Lite calls/day).

## 9. Schema delta (one small additive migration)

```sql
-- supabase/migrations/<ts>_coach_daily_feedback.sql
CREATE TABLE IF NOT EXISTS public.coach_daily_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('daily','weekly')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date, kind)
);
CREATE INDEX IF NOT EXISTS idx_coach_daily_feedback_user ON public.coach_daily_feedback(user_id);
-- RLS authenticated-all, same loop pattern as 20260606000001.
```

Everything else uses columns Phase 1 already created (`coach_roleplays.*`,
`coach_quiz_attempts.ai_feedback`, `coach_assignment_submissions.ai_score/ai_feedback`).

## 10. Cross-cutting

- **Shared types/schemas** (`packages/shared`): add `RoleplayTurn`, `RoleplayScore`,
  `AskCoachResponse`, `DailyCoaching` + Zod schemas for the new request bodies (reuse
  `emptyStringToNull`/`optionalNumber`).
- **Cost/safety:** Flash-Lite only; `maxOutputTokens` caps per call; grounding caps context
  size; all AI writes best-effort with deterministic fallback; an admin **"AI enabled"
  settings toggle** to switch the whole layer off.
- **Testing:** unit-test every `ai/*.ts` parser + prompt-builder against a mocked client,
  including the malformed-JSON → fallback path. Keep the green-gate (typecheck + lint 0
  errors + tests) and ship via the MaiyuriPush flow (branch → PR → `Code Quality` →
  non-author approval → squash-merge → migration-first deploy).

## 11. Build order (each step independently shippable behind the AI-enabled toggle)

1. Shared `ai/client.ts` + `grounding.ts` + guardrail preamble (+ tests).
2. **Auto-grading** — scenario quizzes + assignment pre-scoring *(first slice)*.
3. "Ask the Coach" KB-grounded Q&A.
4. Roleplay simulator (text) + scorecard.
5. Daily/weekly feedback (in-app) + `coach_daily_feedback` migration.
6. Proactive cron → FCM + Telegram.

## 12. Out of scope (later phases)

Voice roleplay (speak/hear), WhatsApp reminders, Odoo guidance, leaderboard/certificates,
pgvector semantic retrieval. Revisit RAG only if the knowledge base grows into hundreds of
documents.
