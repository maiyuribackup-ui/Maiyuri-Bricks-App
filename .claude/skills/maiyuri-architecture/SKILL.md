---
name: maiyuri-architecture
description: The definitive architecture, data-flow, and operational reference for the Maiyuri Bricks business operating system (web + Android + Odoo + Supabase). USE WHEN working anywhere in this repo, onboarding to the codebase, tracing how a feature works end-to-end, deciding where new code goes, debugging a cron/integration, or answering "how does X work" about leads, quotes, planning, production, deliveries, My Work, OneHub, receivables, coaching, projects, or the Telegram/push rhythm.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Maiyuri Bricks — System Architecture & Operating Manual

Maiyuri Bricks is a brick-manufacturing business in Tamil Nadu (founder-led,
~10 staff). This monorepo is its **complete business operating system**: a
Next.js web app + an Expo/React-Native Android app on a shared Supabase +
Odoo backend, glued together by GitHub-Actions crons and a Telegram/FCM
notification rhythm. Founder + primary user: Ram Kumaran.

> This skill is the map. It tells you **what exists, where it lives, how data
> flows, and the non-obvious rules that will bite you**. Read the relevant
> section before touching a subsystem; verify specifics against the code
> (files move). Keep it updated when architecture changes.

---

## 1. Topology & environments

| Thing | Value |
|-------|-------|
| Web app (prod) | `https://mb.maiyuri.com` (Vercel, Next.js 14 App Router, React 18) |
| Android app | Expo SDK 54 / React 19, EAS build + EAS Update (OTA) |
| Database / auth / storage | Supabase project **`pailepomvvwjkrhkwdqt`** (ap-south-1) |
| ERP | Odoo at `crm.maiyuri.com`, DB **`lite2`**, XML-RPC (uid 2) |
| Repo | `github.com/maiyuribackup-ui/Maiyuri-Bricks-App` |
| Notifications | Telegram bot `RKG1988bot` + FCM HTTP v1 (push) |
| Email | Gmail SMTP via nodemailer (switched off dead Resend) |
| Crash reporting | Sentry (web `@sentry/nextjs`, native `sentry-expo`) — DSNs publishable, env-gated |

### Monorepo layout
```
apps/
  web/    Next.js — ALL API routes (app/api/*) + all web pages (app/(dashboard)/*)
  native/ Expo Android app — OWN node_modules, own tsconfig (build from inside it)
  api/    CloudCore "kernels" (agent orchestration libs; imported by web)
packages/
  shared/ zod schemas + TS types (raw-source exports — see §11 gotchas)
  ui/     shared UI primitives
services/auth/
supabase/migrations/  SQL, applied to the prod project (no staging)
.github/workflows/    CI + every cron (Vercel Hobby caps crons at 2, so crons live here)
```

### The two apps split (critical mental model)
- **apps/web owns the backend.** Every API route the mobile app calls is a
  Next.js route under `apps/web/app/api/`. The native app is a **thin client**
  over `https://mb.maiyuri.com/api/*`.
- Native talks to the API via `apps/native/src/lib/api.ts` (`api.get/post/...`),
  which attaches the Supabase access token as a **Bearer** header and has a
  20 s timeout + 401→sign-out handling.
- **Auth duality:** API routes accept EITHER a browser cookie (web) OR a Bearer
  token (mobile) via `getUserFromRequest(request)` in
  `apps/web/src/lib/supabase-server.ts`. If a route is cookie-only
  (`createSupabaseRouteClient(...).auth.getUser()`), the **mobile app gets 401**.
  When wiring an existing web route for mobile, swap it to `getUserFromRequest`.
  `requireAuth`/`requireRole` (`apps/web/src/lib/api-helpers.ts`) already use it.

---

## 2. Roles & access control

Roles: `founder`, `owner`, `accountant`, `engineer`, `sales`, `driver`,
`production_supervisor`. `founder`/`owner` = full access (`["*"]`).

- **Web nav gating:** `roleModuleAccess` map in
  `apps/web/app/(dashboard)/layout.tsx` — role → allowed module keys.
- **Web page gating:** `protectedRoutes` in `apps/web/middleware.ts` — anonymous
  visitors to these are redirected to `/login`. **Every dashboard page must be
  listed here** or the page shell renders to anonymous users (this class of bug
  has bitten `/daily-report`, then `/quotes`/`/planning`/`/projects`/`/approvals`
  — all fixed). The E2E smoke suite guards it now.
- **Mobile tab gating:** `TAB_ACCESS` map in `apps/native/app/(tabs)/_layout.tsx`
  (hidden tabs use `href: null`). Role comes from `useMyProfile`.
- **API gating:** per-route via `requireRole` / `canApproveTickets` /
  `isWorkAdmin` / `WORK_ADMIN_ROLES`. **DB-level RLS is NOT yet role-scoped**
  (most tables are any-authenticated FOR ALL) — the API layer is the real
  enforcement today. Tightening RLS is on the backlog.

`WORK_ADMIN_ROLES = ['founder','owner','production_supervisor']`.
`canApproveTickets` roles = `['engineer','accountant','owner','founder']`.

---

## 3. Modules (what exists, where, how it flows)

### 3.1 Leads & CRM  — strongest module
- Web: `app/(dashboard)/leads/*`. Native: `(tabs)/leads.tsx`, `leads/[id].tsx`,
  `leads/new.tsx`. API: `app/api/leads/*`, `notes`, `recordings`, `transcribe`.
- Kanban by `pipeline_stage`; `lead_status`; `lead_temperature`; `ai_score`.
- **Call recordings pipeline** (see §5) auto-ingests Superfone call transcripts.
- Native lead detail has: Call / WhatsApp / ⚡ Quick-actions edit
  (`LeadQuickActions.tsx`), **Smart Quote card**, **"Can we deliver?" promise
  checker**, Notes.

### 3.2 Smart Quotes  (`smart_quotes`, `smart_quote_events`)
- Generate: `POST /api/smart-quotes/generate` (Bearer-enabled) — AI builds a
  personalised bilingual quote; one per lead unless `regenerate:true`.
- Public share page: `app/sq/[slug]/page.tsx` (`SmartQuoteView.tsx`) — served
  by `link_slug`. Engagement events (view/section_view/cta_click/lang_toggle)
  written back via `app/api/sq/[slug]/*`.
- **Quotes Inbox:** `app/(dashboard)/quotes/page.tsx` + `GET /api/smart-quotes`
  — every quote ranked by "warmth" (CTA click > repeat opens > opened). This is
  the "who's about to buy" list. Also hosts the web promise checker.
- Native: quote generate + WhatsApp share from `leads/[id].tsx`
  (`use-smart-quote.ts`).

### 3.3 Ops Planning / Production Planner  (`ops_plan*`, `product_planning_params`)
- API: `app/api/ops-planning/*` (generate, promise, variance, params, plans,
  plans/active, settings, inputs, items, notify).
- Service: `apps/web/src/lib/ops-planning/planning-service.ts` (deterministic
  scheduler + Gemini rationale pass). Odoo sync:
  `src/lib/ops-planning/odoo-planning.ts` (evicts cancelled orders explicitly —
  fetch is capped at 300 so it queries a dead-list, NOT not-in-fetched).
- Capacity model per product: `daily_capacity_units`, `curing_days`,
  `min_batch`. Products with no capacity set are excluded from planning.
- **Promise checker** (`POST /api/ops-planning/promise` `{finished_good_id,
  quantity}` → `{promised_delivery_date, unfulfilled_units}`) is surfaced to
  SALES on native lead detail + web Quotes page (not just the Plan tab).
- Native Plan tab: `(tabs)/plan.tsx` (Plan/Calendar/Variance). Web read-only
  view: `app/(dashboard)/planning/page.tsx`.
- **Plan generation + activation is intentionally mobile-only** (supervisor's
  job). Web view is read-only.

### 3.4 Production & Deliveries
- Production: `app/(dashboard)/production/*`, native `(tabs)/production.tsx`.
  Odoo orders, BOM/consumption, shift attendance, submit-for-approval.
- Deliveries: `app/(dashboard)/deliveries/*`, native `(tabs)/deliveries.tsx`.
  - **Driver route order:** Today tab clusters open deliveries by area (city),
    numbered stop badges (`routeOrder` in deliveries.tsx).
  - **Completion** (`POST /api/deliveries/[id]/complete`): photos (base64 data
    URLs), recipient, notes, **+ `tripKm` / `dieselCost`** (trip economics).
    Offline-safe (see §7).

### 3.5 My Work  (`work_items`, `work_item_templates`, `work_checklist_*`)
The task/assignment engine. Lifecycle:
`pending → in_progress → submitted → completed | returned | cancelled`.
- API: `app/api/my-work/*` (generate, [id]/start, /draft, /submit, /approve,
  /return, /complete, /attachments, checklist-templates, digest, templates).
- Web: `app/(dashboard)` surfaces via `onehub/my-work` + unified `/approvals`.
  Native: `onehub/my-work/{index,[id],new}.tsx` (`use-my-work.ts`).
  `new.tsx` = admin assign form (assignee/checklist/priority/due/proof).
- **Recurring engine:** `work_item_templates` (recurrence_rule
  `daily|weekly:1-7|monthly:1-28`, due_time, role fan-out or single assignee) →
  generated by `my-work-generate.yml` (00:00 UTC). Digest at
  `morning-digest.yml`.
- Photos: `work-item-photos` **private** bucket, signed URLs.
- Native home screen shows a **My Work strip** (overdue/today count, red when
  late) — the reason a driver opens the app.

### 3.6 OneHub  — the in-app "operating system" hub
Web: `app/onehub/page.tsx` (+ `RenewalsCard`, `RemindersCard`). Native stack:
`app/onehub/*` (`_layout.tsx` registers screens).
- **SOPs** (`onehub_sops`): bilingual EN + தமிழ், structured JSONB steps (not
  markdown), warning box, video URL, governance fields. On publish →
  **ingested into RAG** (`POST /api/knowledge`) so Ask Mayur cites them.
- **Ask Mayur:** thin client over `POST /api/knowledge/ask`
  `{question, language:'en'|'ta'}` → `{answer, sources, confidence}`.
- **Links** (`onehub_links`): category-grouped directory (incl. the APK
  install link).
- **New-joiner checklists** (`onehub_checklist_templates` / `_runs`).
- **Renewals & Compliance** (`compliance_renewals`): register on the OneHub
  page; generator creates approval-gated tasks; Telegram alerts at
  overdue/7/3/1/0 days (see §4).
- **Training** = the Coaching module surfaced here (see §3.9).
- Manage console: `app/onehub/admin/page.tsx` (checklists, recurring work,
  links, SOPs, planning settings).

### 3.7 Daily Report  (`app/(dashboard)/daily-report/*`)
One-page print-to-PDF business snapshot. Aggregator:
`apps/web/src/lib/daily-report/aggregate.ts` — **per-source isolation** (a dead
integration degrades ONE tile to pending/error, never breaks the page),
IST-anchored. Tiles: finance (Odoo invoiced/expenses/net + top invoices),
**receivables (overdue + top debtors)**, production plan-vs-actual, deliveries
(+ trip km/diesel), website (GA4), leads, calls (Superfone — pending creds),
whatsapp (pending creds), tasks (My Work). Protected route; `Export PDF` =
`window.print()`.

### 3.8 Receivables  (`apps/web/src/lib/receivables.ts`)
`fetchReceivables()` pulls unpaid Odoo customer invoices (out_invoice,
not_paid/partial, amount_residual>0), computes overdue + top debtors. Powers
the Daily Report AR tile AND the **daily AR-chase Telegram cron** (§4).

### 3.9 Coaching / Training  (`coach_modules`, `coach_lessons`, `coach_quizzes`,
`coach_knowledge_base`)
- Full web LMS: `app/(dashboard)/coaching/*` (learn, quiz, targets,
  assignments, performance, admin, review). API: `app/api/coaching/*`
  (auth via `getCoachContext` in `src/lib/coaching/context.ts`).
- **Native "Training"** (`onehub/training.tsx`, `use-training.ts`): modules →
  expandable lessons → mark complete. Quizzes remain web-only.
- Surfaced in OneHub on both platforms.
- NOTE: `coach_roleplays` was a shell (0 rows, never built) — drop migration
  authored, apply pending explicit consent.

### 3.10 Projects  (`projects`, `project_wbs_items`, `project_budgets`,
`project_estimates`, `boq_items`, `cbs_master`, `cost_entries`, `daily_progress`)
Construction-PM: estimate → approve budget → track cost/progress/variance.
Web: `app/(dashboard)/projects/*`. API: `app/api/projects/*`, `app/api/cbs`.
- **SECURITY NOTE (fixed):** all 14 project/cbs routes originally had NO auth
  (anonymous read+write). Now guarded with `getUserFromRequest`. If you add a
  projects route, include the auth guard.

### 3.11 Tickets / Approvals  (`tickets`, ticket-service)
Approval workflow for `production_order | quote_approval | payment_approval`.
Routes: `app/api/tickets/*` ([id]/approve, /reject, /request-changes, comments,
history). Web `/approvals` + native `onehub/approvals.tsx` (Bearer-enabled).
Overlaps conceptually with My Work approvals — unifying is on the backlog.

### 3.12 Knowledge / RAG  (`knowledgebase`)
`POST /api/knowledge` (ingest, Gemini text-embedding-004 → vector + FTS),
`/api/knowledge/ask` (language-aware Q&A), `/gaps`, `/pending`, `/scrape`.
Auto-ingests call transcripts + published SOPs.

### 3.13 OpenProject bridge  (`src/lib/openproject.ts`)
OpenProject = the founder's PLANNING cockpit (Gantt, dependencies); My Work
stays the ONE staff queue. The bridge (`/api/cron/openproject-sync`, every
30 min): open assigned work packages → `work_items`
(`source_module='openproject'`, `source_record_id=<wp id>`, assignee matched
by email, push notification); title/due edits flow through; WPs closed in OP
cancel the local item; items COMPLETED in the app close the WP + leave a
completion comment. Env: `OPENPROJECT_URL`, `OPENPROJECT_API_KEY` (API v3,
Basic auth, username literally `apikey`). OP-derived tasks surface in the
Daily Report through the existing Tasks tile (they ARE work_items).

**Where OpenProject actually runs** (final topology, 2026-07-13):
- Docker container `openproject` (image `openproject/openproject:16`,
  bundled PG + memcached) inside the **VMware Workstation VM "Openclaw"**
  (Ubuntu, hostname `ram-VMware-Virtual-Platform`) on the founder's PC —
  NOT WSL, NOT Docker Desktop. Compose file:
  `/home/ram/openproject-docker/docker-compose.yml` (user `ram`).
- Public URL: **`https://ram-vmware-virtual-platform.tailec7c1f.ts.net`**
  via **Tailscale Funnel** (`tailscale funnel --bg 8080`), NOT Cloudflare.
  Container binds `127.0.0.1:8080:80` only — Funnel and the tailnet are the
  only doors. `OPENPROJECT_HOST__NAME` = that ts.net name, `HTTPS=true`
  (it 400s "Invalid host_name configuration" on any other Host header —
  that is OpenProject's guard, not a network problem).
- The VM also hosts: `maiyuri-metabase` (:3030), Mealie, Homepage. The
  Openclaw VM's tailnet IP is 100.77.129.54; SSH access: key
  `Claude workings/openproject/.ssh/openclaw_ed25519` as `ram@100.77.129.54`
  (Tailscale SSH was tried and disabled — its check-mode kept denying;
  plain sshd + authorized_keys works).
- A leftover `op.maiyuri.com → host.docker.internal:8080` ingress exists in
  the IMMICH Cloudflare tunnel config
  (`Claude workings/immich/cloudflared/config.yml`) — redundant (no DNS
  record was ever created); safe to remove.
- **The VM sleeps with the PC** — the sync treats unreachable as a graceful
  skip (no alert); an alert from openproject-sync means a real bug.

### 3.14 Dashboards & Settings
- Multiple overlapping dashboards exist (dashboard, kpi, business-health,
  observability, analytics, daily-report) — consultant audit flagged
  consolidation onto Daily Report as the founder home.
- Settings: `app/(dashboard)/settings/*` — Team (invite/roles), notification
  prefs (`push_leads`/`push_ops`/`push_digest`), Smart Quote config, wall
  costs, **nudges** rule engine. Native settings: `(tabs)/settings.tsx`
  (planning params incl. min_batch, push prefs).

---

## 4. The cron / notification rhythm  (`.github/workflows/*.yml`)

Vercel Hobby caps crons at 2, so **all scheduled jobs are GitHub workflows**
that curl an app endpoint with `Authorization: Bearer $CRON_SECRET`, each with
a `continue-on-error` Telegram **alert-on-failure** step. Times are UTC (IST =
UTC+5:30).

| Workflow | UTC | IST | Hits | Does |
|----------|-----|-----|------|------|
| `my-work-generate` | 00:00 | 05:30 | /api/my-work/generate | spawn recurring tasks + renewals roll-forward |
| `odoo-sync` | 00:15 | 05:45 | odoo sync | refresh orders/stock |
| `deliveries-digest` | 01:30 | 07:00 | /api/deliveries/cron | driver's day list |
| `morning-digest` | 03:00 | 08:30 | /api/nudges/digest | per-person lead digest (push + Telegram) |
| `ar-chase` | 03:30 | 09:00 | /api/cron/ar-chase | overdue receivables → Telegram |
| `renewal-alerts` | 03:35 | 09:05 | /api/cron/renewal-alerts | renewals due (overdue/7/3/1/0d) → Telegram |
| `salespulse` | 03:40 (+Mon 04:10) | 09:10 (+Mon 09:40) | /api/cron/salespulse | sales digest → Telegram (daily + weekly) |
| `plan-reminder` | — | evening | plan reminder | "update Odoo/plan" nudge |
| `db-backup` | 21:00 | 02:30 | pg_dump (docker) | 30-day artifact |
| `e2e` | 05:00 + post-push | 10:30 | Playwright smoke | read-only prod regression net |
| `openproject-sync` | */30 | every 30 min | /api/cron/openproject-sync | OP work packages ↔ My Work bridge |

Other CI: `ci.yml` (Code Quality — required check: typecheck+lint+test via
turbo), `native-ci.yml` (native typecheck), `release.yml`, `android-apk.yml`,
`claude*.yml`.

**Recordings processing** is a Vercel cron in root `vercel.json` (Hobby's 2
slots: health 08:00, recordings 14:00 UTC).

### Push (FCM) & Telegram
- Push: `sendPushToUsers` / `filterByPushPref` in `src/lib/push/fcm.ts`; deep
  links `/onehub/my-work/{id}` resolve on BOTH web and native.
- Telegram: `src/lib/telegram.ts` (`sendTelegramMessage`). Bot token +
  chat id are server-side; the `salespulse/send` relay is token-gated
  (`SALESPULSE_TOKEN`) so external callers never hold the bot token.

---

## 5. Superfone call-recording pipeline

Flow: **Superfone call → forwarded to Telegram group → bot webhook →
download → transcribe (Gemini) → AI analyse → link to lead by phone.**

- Webhook: `app/api/telegram/webhook/route.ts` (accepts voice/audio/audio-mime
  document; chat-id whitelist; filename → phone/name via
  `src/lib/telegram-webhook.ts`).
- Processing: `app/api/recordings/process/route.ts` — picks oldest
  `pending`/`failed` with `retry_count < 3`, statuses in `call_recordings`:
  `pending → downloading → uploading → transcribing → analyzing → completed`
  (or `failed`). Runs on the 14:00 UTC Vercel cron (≤10/run).
- **Failure mode to know:** a Gemini outage fails a batch; after 3 retries rows
  are stuck `failed` forever and the health monitor reports "worker pipeline
  unhealthy". Fix = reset `retry_count=0, error_message=null` on those rows and
  the next cron retries. Audio is re-fetched by Telegram `file_id` (long-lived
  but can expire on very old files).

---

## 6. Odoo integration

- Config is ENV-ONLY: `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_PASSWORD`
  (Vercel). Service: `apps/web/src/lib/odoo-service.ts` — `odooExecute(model,
  method, args, kwargs)` XML-RPC with a 25 s AbortController timeout;
  `assertOdooConfigured()`.
- Also a single MCP server `odoo` in `.mcp.json` (`ODOO_API_KEY` env).
- Key models used: `account.move` (invoices/bills/AR), `sale.order` +
  `sale.order.line` (orders/planning), stock for FG.
- **Gotcha:** confirmed-order lines show remaining qty; qty=1 lines may be lots
  not brick counts — unresolved semantics question, confirm with the business.

---

## 7. Offline & OTA (native)

- Offline: `src/lib/offline.ts` (`initOnlineManager` + NetInfo). Mutations pause
  offline; `complete-delivery` mutation has `setMutationDefaults` +
  `PersistQueryClientProvider` so it **survives app restart** and replays on
  reconnect. Banner: `OfflineBanner.tsx`.
- OTA: `expo-updates` + EAS Update. Channels `preview` / `production`,
  `runtimeVersion` policy. `checkForAppUpdate` on launch (`src/lib/app-updates.ts`).
- **Publishing OTA:** from `apps/native`, ALL `EXPO_PUBLIC_*` env must be set in
  the shell (they're inlined at bundle time) plus `EXPO_TOKEN`. Then
  `npx eas-cli update --channel preview --message "..."`.
  JS-only changes ship by OTA — **no APK rebuild**. Native module changes need a
  new build.

---

## 8. Data model quick index (Supabase)

`leads`, `notes`, `call_recordings` · `smart_quotes`, `smart_quote_events` ·
`ops_plan*`, `product_planning_params` · `deliveries` (+ trip_km, diesel_cost) ·
`work_items`, `work_item_templates`, `work_checklist_templates`/`_items`/
`_instances`/`_responses` · `onehub_sops`, `onehub_links`,
`onehub_checklist_templates`/`_runs` · `compliance_renewals` ·
`coach_modules`/`_lessons`/`_quizzes`/`_knowledge_base`/`_lesson_progress` ·
`projects`, `project_wbs_items`, `project_budgets`, `project_estimates`,
`boq_items`, `cbs_master`, `template_wbs_items`, `template_boq_items` ·
`tickets` · `knowledgebase` · `nudge_rules` · `users`, `device_tokens`.
Migrations in `supabase/migrations/` (applied to prod; no staging DB).

---

## 9. Where to put new code (decision guide)

- **New API endpoint** → `apps/web/app/api/<group>/route.ts`. Auth with
  `getUserFromRequest` (mobile-capable) or `requireRole`. Validate with a zod
  schema from `@maiyuri/shared`. Return the `{data,error,meta}` envelope
  (`src/lib/api-utils.ts`).
- **New web page** → `apps/web/app/(dashboard)/<x>/page.tsx`; add its key to
  `roleModuleAccess` AND `middleware.ts` `protectedRoutes`; add a nav entry.
- **New mobile screen** → `apps/native/app/...`; register in the relevant
  `_layout.tsx`; data via a `src/hooks/use-*.ts` calling `api.*`; gate in
  `TAB_ACCESS` if a tab.
- **New scheduled job** → an endpoint under `app/api/cron/<x>` guarded by
  `CRON_SECRET`, + a `.github/workflows/<x>.yml` copying an existing cron
  (curl + alert-on-failure). NOT a Vercel cron (Hobby cap).
- **New shared type/schema** → `packages/shared/src/*` (see §11 zod gotcha).
- **DB change** → write a `supabase/migrations/*.sql` file AND apply to prod
  (migrations are applied directly; keep the file for history).

---

## 10. Standing conventions & user preferences

- **Repo is bun-locked** — `bun.lock` is the ONLY lockfile. NEVER commit a root
  `package-lock.json` (npm workspace installs create one) — it makes CI vitest
  SEGFAULT (exit 139). Delete before committing.
- **Multi-session repo:** other Claude sessions merge PRs concurrently. Always
  check GitHub PR/branch state before trusting local git. Stacked PRs often
  need a rebase after the parent squash-merges.
- **Merge discipline:** NEVER self-merge a PR without the user's explicit
  per-PR "merge NN". No prod writes without specific consent.
- **Secrets:** never put literal secrets on a command line (classifier blocks
  it). Never extract secrets from git history. For one-shot git pushes use an
  ephemeral `GIT_ASKPASS` script deleted right after; don't persist creds to
  the credential helper.
- **PRs:** create via the GitHub API (`gh` CLI is NOT on PATH here). End PR
  bodies with the Claude Code generated-with line.
- **Windows/PowerShell host**, but the Bash tool runs Git Bash — use POSIX
  syntax there. `apps/native` has its own node_modules; run its tsc/expo from
  inside it.

---

## 11. Gotchas that will bite you

1. **Cookie-only auth routes 401 the mobile app.** Use `getUserFromRequest`.
2. **`packages/shared` exports raw src importing zod** — clean npm installs
   can't resolve it → CI typecheck red. Fixed via zod in root devDeps +
   `preserveSymlinks` in `apps/native/tsconfig`. Don't undo that.
3. **ESLint 9 flat config loads neither `@next/next` nor `react-hooks`
   plugins** → an orphan `eslint-disable <that rule>` is itself an ERROR
   ("rule not found"). Remove stale disables.
4. **Middleware `protectedRoutes` is a separate list from `roleModuleAccess`.**
   Adding a page to nav does NOT protect it. Add to both. The E2E smoke suite
   now catches misses.
5. **Only root `vercel.json` is read by Vercel.** App-level ones are ignored.
6. **`topN` in salespulse metrics returns a `Record`, not entries** — don't
   `.slice()` it (caused a 500 on first run).
7. **Odoo planning eviction** must query an explicit dead-list, not
   "not in fetched" — fetch is capped at 300.
8. **KPICard locale test** ("15,00,000" en-IN) fails locally, passes on CI
   (en-US) — environment artifact, ignore.
9. **E2E secrets:** `E2E_EMAIL`/`E2E_PASSWORD` repo secrets unlock the
   authenticated smoke tier; without them those tests skip (not fail).

---

## 12. Integrations awaiting credentials (grey tiles / future)

GA4 (property id + service-account JSON — code ready), Superfone API (calls
tile), WhatsApp Meta Cloud API (whatsapp tile). Backlog: RLS role-scoping,
dashboard consolidation, git-history secret scrub, more SOPs (dispatch/accounts/
HR/safety), unify Tickets vs My Work approvals.

---

**When you change architecture, update this skill.** It is only useful while
it is true.
