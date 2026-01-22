# Maiyuri_Bricks_App — Review Recommendations (Best-Effort Static Scan)

This file captures actionable recommendations from a repo-wide, best-effort static review (no production access; not an audit).

> **Remediation Plan:** See [SECURITY_REMEDIATION_PLAN.md](./SECURITY_REMEDIATION_PLAN.md) for implementation details and timeline.

## Status Summary

| Priority | Total | Planned | In Progress | Done |
| -------- | ----- | ------- | ----------- | ---- |
| P0       | 4     | 4       | 0           | 0    |
| P1       | 7     | 4       | 0           | 0    |
| P2       | 7     | 3       | 0           | 0    |
| P3       | 2     | 2       | 0           | 0    |

**Last Updated:** 2026-01-22

---

## Applied Improvements (Latest)

The following changes were implemented to make AI insights action-oriented and connected to Tasks, Knowledge, and Coaching:

- Lead AI analysis now auto-creates deduplicated action tasks with sensible due dates and assignees.
- Sales coach knowledge gaps now link created tasks back to `unanswered_questions`.
- Knowledge tab now surfaces open knowledge gaps and allows quick resolution + reuse in chat.
- Coaching tab now shows recent call coaching insights per staff member.
- Dashboard analytics uses deterministic fallback AI scores (no random values).
- Lead analysis persistence now includes `ai_factors` and `ai_suggestions`, and the UI displays them even after refresh.

---

## P0 (Security/Release Blocking)

### 1. Lock down API routes (authentication + authorization) `[PLANNED]`

**Status:** Planned in Phase 1.1
**Effort:** 4 hours
**Files:** `apps/web/middleware.ts`, `apps/web/src/lib/api-helpers.ts`

- `apps/web/middleware.ts` currently allows all `/api/*` requests through without requiring a session; it only rate-limits them.
- Multiple API routes use `supabaseAdmin` (service role) and perform privileged DB actions without checking the caller's auth/role (e.g., `apps/web/app/api/leads/route.ts` GET/POST, `apps/web/app/api/leads/[id]/route.ts` PUT/DELETE).
- **Recommendation:** enforce auth for `/api/*` by default in middleware (except explicitly public endpoints), and/or add a shared "require session + role" helper used by every route. Prefer using a user-scoped Supabase client with RLS where possible; reserve service role for strictly internal tasks.

### 2. Remove committed credentials and rotate them `[PLANNED]`

**Status:** Planned in Phase 1.3
**Effort:** 3 hours
**Files:** `supabase/migrations/20260109000001_seed_auth_users.sql`, test files

- `apps/web/test-credentials.txt` is referenced in docs but not present in this workspace; confirm it stays removed.
- Many scripts/tests and migrations hardcode `TempPass123!` and real emails (e.g., `supabase/migrations/20260109000001_seed_auth_users.sql`, multiple Playwright specs and `.mjs` scripts).
- **Recommendation:** remove/replace committed credentials with environment-based secrets, rotate the affected accounts/passwords, and ensure CI/e2e uses `process.env.*` (or secret storage) rather than literals.

### 3. Prevent accidental exposure of Supabase service-role usage in client bundles `[PLANNED]`

**Status:** Planned in Phase 1.2
**Effort:** 2 hours
**Files:** `apps/web/src/lib/supabase.ts` → split into `supabase-browser.ts` + `supabase-admin.ts`

- `apps/web/src/lib/supabase.ts` exports both browser and admin clients from the same module; importing this in a Client Component can risk bundling server-only code paths.
- **Recommendation:** split into explicit modules (e.g., `supabase-browser.ts` and `supabase-admin.server.ts`), mark server-only modules with `server-only`, and make it hard to import admin helpers from client code.

### 4. Protect user management endpoints and remove default passwords `[PLANNED]`

**Status:** Planned in Phase 1.4
**Effort:** 2 hours
**Files:** `apps/web/app/api/users/route.ts`

- `apps/web/app/api/users/route.ts` allows bulk seed creation and user creation without an auth/role gate; it requires a password but does not restrict who can call it.
- **Recommendation:** require founder/admin role for user management, disable public seed endpoints in production, and prefer invite-flow links for user creation.

---

## P1 (Correctness/Functional)

### 1. Fix optional lead fields that currently reject blank selections `[PLANNED]`

**Status:** Planned in Phase 2.1
**Effort:** 1 hour
**Files:** `packages/shared/src/schemas.ts`

- `packages/shared/src/schemas.ts` defines `classification` and `requirement_type` as `z.enum(...).nullable().optional()` which does not accept `""`.
- The UI forms default to `""` for unselected `<select>` values, so submitting with "Select ..." will fail validation.
- **Recommendation:** coerce empty string to `null` in the schema (or in the form submit transform) so the fields remain truly optional.

### 2. Ensure "auto-archive when lost" is consistent and auditable `[BACKLOG]`

- `apps/web/app/api/leads/[id]/route.ts` auto-archives on status `"lost"` but does not set `archived_by`, and doesn't account for "un-lost" transitions.
- **Recommendation:** define clear rules (e.g., only set on transition to lost; optionally store actor; decide whether restoring status unarchives) and encode them in one place (API layer or DB trigger).

### 3. Normalize WhatsApp phone numbers consistently `[PLANNED]`

**Status:** Planned in Phase 2.4
**Effort:** 2 hours
**Files:** `packages/shared/src/utils/phone.ts` (new), multiple components

- `apps/web/app/(dashboard)/leads/page.tsx` and `apps/web/app/(dashboard)/dashboard/page.tsx` build `wa.me` links without adding the country code for local 10-digit numbers, while `apps/web/src/components/leads/WhatsAppButton.tsx` does add `91`.
- **Recommendation:** centralize phone normalization (E.164) and reuse it for all WhatsApp/call links to avoid broken links for local numbers.

### 4. Design tab: modification flow is effectively disabled `[BACKLOG]`

- The input area only renders for `session.status === 'iterating' || 'presenting'`, but the design flow sets statuses like `collecting`, `generating`, `halted`, and `complete`.
- `handleSendMessage` simulates a response instead of calling `modifyDesign`, so real changes never reach the backend.
- **Recommendation:** wire modification requests to `/api/planning/modify`, and set a reachable status (or always show the input after completion).

### 5. Design tab: survey upload is mocked and not synced to backend `[BACKLOG]`

- `handleSurveyUpload` uses hardcoded dimensions and never submits the extracted result (or the file) to `/api/planning/answer`.
- This will desync the backend session and produce incorrect designs in production.
- **Recommendation:** integrate a real extraction pipeline (or call the planning API with extracted values) and remove the mock dimensions.

### 6. Design tab: canceling survey upload can mis-answer the next question `[BACKLOG]`

- The cancel handler calls `handleOptionSelect('manual')`, but the "current question" may already have advanced beyond `plotInput`.
- **Recommendation:** explicitly reset `plotInput` to `manual` and re-ask the plot question, rather than calling the generic option handler.

### 7. Design tab: downloads can't be refreshed after a page reload `[BACKLOG]`

- `backendSessionIdRef` is not restored from storage, so `handleRefreshDownloads` immediately errors after refresh.
- **Recommendation:** persist the planning session ID and restore it on load (or fetch the latest session ID from Supabase and call `setSessionId` in the generation hook).

### 8. (NEW) CSP headers allow unsafe-eval in production `[PLANNED]`

**Status:** Planned in Phase 2.2
**Effort:** 1 hour
**Files:** `apps/web/middleware.ts`

- `apps/web/middleware.ts` sets `script-src 'unsafe-inline' 'unsafe-eval'` unconditionally.
- **Recommendation:** make CSP environment-specific so production does not include `unsafe-eval`.

### 9. (NEW) Lead search filter can break on special characters `[PLANNED]`

**Status:** Planned in Phase 2.3
**Effort:** 1 hour
**Files:** `apps/web/app/api/leads/route.ts`

- `apps/web/app/api/leads/route.ts` interpolates `filters.search` directly into `query.or(...)`, which can break if the search string contains commas or special characters.
- **Recommendation:** escape/normalize search input or use separate `.ilike` filters.

---

## P2 (Maintainability/Quality)

### 1. Reduce duplication of domain constants `[PLANNED]`

**Status:** Planned in Phase 3.1
**Files:** `packages/shared/src/constants/leads.ts` (new)

- Lead option lists (source/classification/requirement) appear in multiple UI files and helper functions.
- **Recommendation:** centralize enums/labels in `packages/shared` and import them in UI/API to prevent drift.

### 2. Standardize API route patterns `[PLANNED]`

**Status:** Planned in Phase 3.2
**Files:** `apps/web/src/lib/api-helpers.ts` (new)

- Many routes have similar patterns (parse, validate, query, respond, log).
- **Recommendation:** create small shared helpers: `requireSession()`, `requireRole()`, `handleSupabaseError()`, and consistent error response shapes.

### 3. Strengthen linting rules around production code `[BACKLOG]`

- Root `eslint.config.js` allows `console.*` broadly and disables some TS rules in various globs.
- **Recommendation:** keep relaxed rules for scripts/tests, but tighten for `apps/*/src` and `apps/*/app`.

### 4. Separate seed/test data from migrations `[PLANNED]`

**Status:** Included in Phase 1.3

- `supabase/migrations/20260109000001_seed_auth_users.sql` creates users with known passwords and fixed UUIDs.
- **Recommendation:** move seeds to a non-migration "seed" mechanism.

### 5. Fix lead list stats accuracy `[PLANNED]`

**Status:** Planned in Phase 3.3
**Files:** `apps/web/app/api/leads/stats/route.ts` (new)

- `apps/web/app/(dashboard)/leads/page.tsx` calculates "newToday", "hot", etc. from a paginated subset.
- **Recommendation:** move these metrics to an aggregated API endpoint.

### 6. Harden search filters against query breakage `[PLANNED]`

**Status:** Combined with P1 #9

### 7. (NEW) Add request/response logging middleware `[BACKLOG]`

- No centralized API logging for debugging and audit trails.
- **Recommendation:** add logging middleware to capture request/response metadata.

---

## P3 (DX/Observability)

### 1. Document and codify environment variables `[PLANNED]`

**Status:** Planned in Phase 4.1
**Effort:** 2 hours
**Files:** `apps/web/src/lib/env.ts` (new)

- Env var usage is spread across apps and scripts.
- **Recommendation:** define a typed env schema per app (e.g., Zod-based `env.ts`) and fail fast when required vars are missing.

### 2. Make test credentials configurable `[PLANNED]`

**Status:** Planned in Phase 4.2
**Files:** `.env.example`, Playwright config, test files

- Playwright and `.mjs` scripts embed user creds.
- **Recommendation:** read creds from env and provide a `.env.example` for local testing.

---

## Codex Review Addendum (Local Workspace Only)

Scope: local workspace scan only; no GitHub/network access.

### Confirmed Findings (Evidence-Based)

1. **P0: API routes allow unauthenticated access and use service-role clients** - Confirmed
2. **P0: Seed migration includes real emails and a shared password** - Confirmed
3. **P1: CSP is permissive in production** - Confirmed
4. **P1: Lead search filter can break on special characters** - Confirmed
5. **P2: E2E test uses production login and hardcoded password** - Confirmed

### Open Questions (Answered)

> Are `/api/*` endpoints intended to be publicly accessible?

**Answer:** No. Authentication will be enforced in Phase 1.1.

> Are seed migrations ever run outside local/dev environments?

**Answer:** They should not be. Phase 1.3 will gate them with environment checks.

---

## Notes

- This is not a formal security audit; the P0 items are still high-impact and worth addressing immediately.
- See [SECURITY_REMEDIATION_PLAN.md](./SECURITY_REMEDIATION_PLAN.md) for detailed implementation plan.
