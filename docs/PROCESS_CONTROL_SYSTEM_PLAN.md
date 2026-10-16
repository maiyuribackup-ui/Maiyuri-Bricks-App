# Process Flow & Operational Control System — Assessment and Plan

Status: **Phase 0 draft, for review** · Date: 2026-10-16 · Scope: `Maiyuri_Mobile_Process_Flow_Claude_Prompt.md`
Rule for this document: nothing here has been applied. Every migration below is additive; each item marked **GATE** needs an owner decision before work proceeds.

---

## 1. Headline

Most of the engine already exists. **Process OS V0.1** (versioned multi-stage processes, gates, handovers, QC release, SLA sweep, audit events, swimlane map) and **My Work** (assigned work items, recurring generation, checklists with fail-reason/photo/corrective-action rules, supervisor approval, nudges, native screens) together cover roughly 60% of the brief.

The plan is to **extend these two systems, not build the parallel `control_*` schema the brief suggests**. The new tables are only the ones that have no existing equivalent: exceptions, corrective actions, rules/holds, approval policies and delegations.

The main gaps are:
- maker-checker enforcement
- DB-enforced immutability and append-only audit
- versioned checklists
- exceptions/CAPA as first-class records
- event-triggered task generation
- offline-safe drafts
- bilingual content as data rather than hard-coded strings
- a worker role

---

## 2. As-is architecture map

```
 Expo app (apps/native, SDK 54)          Next.js web (apps/web, Vercel mb.maiyuri.com)
 expo-router, NativeWind, TanStack Q  ─┐  App Router UI + ALL API routes (/api/**)
 Supabase JS = auth only               │  requireAuth/requireRole → users.role
 Bearer JWT → web API ─────────────────┘  writes via supabaseAdmin (service role) + SECURITY DEFINER RPCs
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              ▼                              ▼                              ▼
   Supabase Postgres (Free)        Odoo (XML-RPC, source of truth)   Notifications
   RLS: "auth read" + no write     sale.order(.line), account.move,   FCM push (device_tokens,
   policies; writes server-side    stock.picking, product qty,        push prefs), Telegram group,
   Storage: private buckets,       mrp.production, hr.attendance      email (auth only)
   1-h signed URLs                 No webhooks; nightly pulls
              ▲
   GitHub Actions crons (curl + CRON_SECRET): my-work-generate 00:00, odoo-sync 00:15,
   oc-demand-sync 00:20, process-sla hourly, my-work-nudges 5×/day, ar-chase, digests …
```

**Source of truth by business object (keep as is):**

| Object | Source of truth | App holds |
|---|---|---|
| Sales orders, invoices, payments, receivables, vendor bills, stock quantity | **Odoo** | Read caches (`oc_sales_order_lines`, `finished_goods.stock_qty`), never a competing balance |
| Leads, quotes | App (`leads`, `smart_quotes`) → pushed to Odoo `crm.lead` | — |
| Production plan/actuals, dispatch trips, labour, stock-change explanations | App (`oc_*`); Odoo write-back deliberately off | `oc_inventory_movements` (append-only) explains *why*, Odoo owns *how many* |
| Standard costs | App (`std_cost_versions`, immutable once published) | — |
| Process cases, work items, checklists, evidence, approvals, exceptions | **App** (this project) | Odoo IDs as references only |

---

## 3. Reuse / gap matrix

| Brief requirement | What exists (reuse) | Gap → action |
|---|---|---|
| Process library → definition → version → steps/transitions | `process_definitions`, `process_versions` (DRAFT/ACTIVE/RETIRED), `process_stages`, `process_transitions`, `process_gates`; publish/retire RPCs; instances pin `process_version_id` | Immutability is by convention only → **add guard triggers** on stages/gates/items/transitions of non-DRAFT versions (same pattern as `std_cost_versions`) |
| Checklist template → items → evidence rules | Two engines: `process_checklist_items`/`process_tasks`, and `work_checklist_templates/_items` (richer: N/A, photo-on-fail, corrective-action-on-fail, number input) | **Make `work_checklist_*` the single checklist engine.** Add versioning plus a pinned version on the instance. Process stages can reference a checklist template version. Leave `process_tasks` in place for v1.1 definitions. |
| Step metadata: accountable/executor/validator, SLA, escalation, branch, blocking | Stages have `owner_role`, `sla_minutes`, outcomes, exception transitions, gates | Add `executor_role`, `validator_role`, `escalation`, `blocking` to stage configuration (JSONB, validated in `validate-definition.ts`) |
| Bilingual SOP, pictorial guidance | `onehub_sops` (bilingual steps, versioned, `approved_by`); Tamil only hard-coded in `TaskFirstHome` | Add `prompt_ta`, `help_en/ta`, `reference_photo_path` to checklist items. Add a small `t()` dictionary in `packages/shared`. Use `users.language_preference` on native. |
| My Work home (Due now/Today/Overdue/Waiting/Blocked/Done) | Native and web My Work, `TaskFirstHome`, `v_process_open_work`, work-queue scopes | Add **Blocked** and **Waiting for approval** buckets and a location/process filter. Selective-column, paginated list endpoint. |
| Visual stepper / flow map | `ProcessFlowMap` (xyflow), `ProcessProgressTrack`, native `processes/case/[id]` | Reuse. Add a lightweight vertical stepper for checklists on native. |
| Guided one-action-per-screen execution | Native `my-work/[id].tsx` (682 lines, all items on one screen) | Extract a `ChecklistRunner` component. Add a guided mode (one item per screen, numeric bounds and units, mandatory N/A reason). |
| Report Issue on failure | `fail_reason` and `corrective_action` text on responses | New `control_exceptions` + `corrective_actions` (§4.3). A failed item on a blocking control raises an exception automatically. |
| State machine `draft→assigned→in_progress→submitted→verified/rejected→closed` | `work_items`: pending/in_progress/submitted/completed/returned/cancelled | **Map, don't rename** (pending≈assigned, returned≈rejected, completed≈verified/closed). Add `performed_by`, `verified_by`, `verified_at`. Move transitions into SECURITY DEFINER RPCs with explicit valid-transition guards. |
| Maker-checker / separation of duties | None. The approve route lets a supervisor approve their own submission. | Enforce in the RPC: `verified_by <> performed_by` when the template or policy requires separation |
| Tamper-evident append-only audit | `process_events`, `work_item_events`, `oc_audit_events`. No trigger enforcement. The approve event is silently dropped (CHECK violation). | Fix the CHECK. Add **append-only triggers**. Add a hash chain (`prev_hash`, `row_hash`) on critical events. Requires landing the event-delivery branch first (§6, step 0). |
| Event-triggered task generation, idempotent | Scheduled only (`work_item_templates` + unique (template, user, date)); `process_automations` defined but never executed; lead trigger hard-coded | Add `control_triggers` (business-event inbox, unique `idempotency_key`). Cron and route handlers call `control_raise_trigger()`, which creates the work item or process case exactly once. |
| Durable notifications / webhooks | `process_events` dispatch (claim-then-send, loses events); **branch `fix/process-auth-and-event-delivery` (unmerged)** adds `process_event_deliveries` outbox with leases, backoff and dead-lettering | **Rebase and land that branch first.** Reuse its outbox for all control notifications. |
| Approval thresholds, effective-dated, default to Ram | None (expenses, budgets and tickets approve by role only) | `approval_policies` + `approval_policy_versions` (effective-dated, publish needs partner). Default policy is "all payments → MANAGING_PARTNER". Split detection on supplier, day and window. |
| Delegation (deputy during Engineer absence) | `process_role_defaults` (one holder per role key) | `role_delegations` (delegate, scope, from/to, reason, created_by). Accountability stays with the delegator. |
| Worker role | `users.role`: founder, owner, accountant, engineer, production_supervisor, driver, sales. **No worker.** | **GATE:** add `factory_worker`. Widening the constraint is additive, but it touches nav maps (`TAB_ACCESS`, `roleModuleAccess`, `ROLE_KEYS`). |
| RLS least privilege | All process/work tables: any authenticated user can SELECT. The anon key is public in `eas.json`, so any logged-in user can read every row directly. | New tables get role-scoped SELECT policies. Existing tables are tightened one at a time once each is confirmed server-read-only (app reads go through the service role). |
| Photo evidence | Private `work-item-photos` bucket, 1-h signed URLs; `quality:0.4` only | Resize on device with `expo-image-manipulator` (~1280 px, JPEG 0.6, ≈150–250 KB). Record capture metadata. Retention job. |
| Offline drafts | Query cache persisted (24 h). Only `complete-delivery` mutations replay. Checklist edits live in `useState`. | Persist checklist drafts per item to AsyncStorage. `setMutationDefaults` for draft and response saves, with a `client_mutation_id` (unique server-side). Photos queued from the file cache. Submit, verify, release and payment are **online only**. |
| Control tower dashboards | CEO brief, daily report, business-health; no exception view | One server-side summary RPC per persona. Counts plus top-N only, date-windowed, no history fetch. |
| Batch QC hold | `process_qc_releases` (released/hold) + `qc_released` gate on Lead-to-Delivery | No batch entity (only `batch_ref`). Phase 3: a `control_holds` row scoped to a batch, plan line, product or trip, checked by the dispatch gate. |
| Supplier invoices / payments | Odoo `in_invoice` read-only in the CEO P&L; no app table | App holds the **approval record only**, referencing the Odoo `account.move` id. It never creates a balance. |
| Project milestones | `project_wbs_items`; no milestone or billing table | Phase 3: a milestone flag on WBS items plus a billing-readiness checklist |
| Safety incidents | None | `control_exceptions` with `category=safety`, a stop-work hold, and restart authorisation |
| AI assist | Process AI tools route, CloudCore agents, Gemini | Phase 5. Off the critical path. Everything AI-generated is labelled. |

---

## 4. Target design (additive)

### 4.1 Layers
1. **Definition layer:** Process OS for multi-stage, cross-role workflows (lead→delivery, dispatch, supplier payment, milestone billing). Versioned `work_checklist_templates` for recurring and single-owner controls (opening, closing, QC, counts).
2. **Execution layer:** `work_items` is the universal "task in My Work" (process stages already mirror into it). Checklist instances are pinned to a template version.
3. **Control layer (new):** `control_exceptions`, `corrective_actions`, `control_holds`, `control_rules` (versioned, mode `off|warn|block`, plain-language reason), `approval_policies(+versions)`, `role_delegations`, `control_triggers`.
4. **Integration layer:** Odoo stays read-mostly through the existing clients. Events go through the `process_event_deliveries` outbox (FCM, Telegram, n8n). No new services.

### 4.2 Schema additions (all additive)
- `work_checklist_templates`: `version int`, `status draft|published|retired`, `published_by/at`, `supersedes_id`, `category`, `requires_verification`, `requires_separation`. Guard trigger blocks edits once published.
- `work_checklist_template_items`: `prompt_ta`, `help_en`, `help_ta`, `reference_photo_path`, `unit`, `min_value`, `max_value`, `blocking bool`, `executor_scope` (`any|deputy_allowed|validator_only`), `evidence_rule jsonb`, `config_required bool` (shows "configuration required" until an approver sets values).
- `work_checklist_instances`: `template_version`, `pinned_at`.
- `work_items`: `performed_by`, `blocked_reason`, `client_mutation_id`. The verifier is `approved_by`/`approved_at`, added in step 0 together with the `work_items_approver_not_assignee` CHECK.
- `work_checklist_responses` and `work_item_attachments`: `client_mutation_id` (unique), `captured_at`, `device_meta`.
- `work_item_events`: widen CHECK (`approved`, `verified`, `rejected`, `exception_raised`, `delegated`, `override`), add `prev_hash`/`row_hash`, append-only trigger.

### 4.3 New tables
| Table | Key columns |
|---|---|
| `control_exceptions` | `category` (quality/safety/stock/finance/ops), `severity` (low/med/high/critical), `status` open→acknowledged→contained→resolved→verified→closed, `source_type/id`, `scope_type/id` (factory_day, batch, trip, product, order), `owner_id`, `due_at`, `escalated_at`, `blocks` (bool) |
| `corrective_actions` | `exception_id`, `assignee`, `due_at`, `status`, `evidence`, `verified_by` (≠ assignee) |
| `control_holds` | `scope_type/id`, `reason`, `exception_id`, `placed_by`, `released_by`, `release_evidence`, `override_*` (reason, scope, expiry) |
| `control_rules` / `control_rule_versions` | `rule_key` (e.g. `PRODUCTION_REQUIRES_OPENING_CHECK`), `mode`, `params`, `reason_en/ta`, `overridable`, `effective_from/to`, `approved_by` |
| `approval_policies` / `approval_policy_versions` | `domain` (supplier_payment, …), `thresholds jsonb` (per payment, per supplier per day, daily), `approver_role`, `effective_from/to`, `approved_by`. **Seeded with "all → MANAGING_PARTNER" and no rupee values.** |
| `control_approvals` | `subject_type/id` (Odoo move id for bills), `amount`, `requested_by`, `approver_id`, `decision`, `policy_version_id`, `split_check` |
| `role_delegations` | `delegator_id`, `delegate_id`, `role_key`, `scope` (checklist template ids), `valid_from/to`, `reason`, `revoked_*` |
| `control_triggers` | `trigger_type`, `idempotency_key` UNIQUE, `subject_type/id`, `status`, `result_ref`, `attempts` |

All writes go through SECURITY DEFINER RPCs called by API routes (the existing convention). RLS is role-scoped SELECT. Indexes are on (assignee, status, due), (scope_type, scope_id) and (status, severity).

### 4.4 Gate integration
- Process OS: new gate types `control_ready` (reads readiness) and `no_active_hold` (reads `control_holds`). The database checks both itself.
- Ops Control: `oc_post_production_actual` and trip dispatch call `control_check(rule_key, scope)`. In **warn** mode the request succeeds and returns a warning plus an audit row. In **block** mode it returns 409 with the plain-language reason. Missing data counts as not ready.

### 4.5 Bandwidth posture (Supabase Free)
- No realtime, no polling. Push payloads carry `invalidate: [queryKeys]`, and the app refetches only those queries.
- My Work list: about 12 columns, paginated (25), `today ± overdue` window. Checklist detail is fetched once and cached with the persisted query client.
- Dashboards: one RPC each, returning counts plus top 10 per bucket over a 7- or 30-day window.
- **Estimate (factory slice):** about 25 checklist runs a day, ~40 KB API payload per run, and ~1 MB/day of verifier photo views gives **under 50 MB/month of egress**, well under 5% of the Free egress quota. **Storage is the constraint, not egress:** about 10 photos a day at ~200 KB is roughly 60 MB/month against 1 GB of Free storage. A retention policy is needed (e.g. 90 days in full, then thumbnail only), or move to Drive (see `docs/STORAGE_COMPARISON.md`). **GATE:** retention period.
- Telemetry: a route wrapper logs `bytes_out`, route and user role to the existing observability pipeline (`docs/OBSERVABILITY.md`), plus a weekly egress line in the Monday scorecard.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Two checklist engines drift further apart | Standardise on `work_checklist_*`. Process tasks stay only for v1.1 cases already running. |
| Tightening RLS breaks a hidden client-side read | Tighten one table at a time after grepping for direct reads. All current app reads go through the service role. SQL RLS tests per role. |
| Blocking production on a missing check stops the factory | Rules ship in **warn** mode. Ram switches to block per rule. Emergency override has reason, expiry and notification. |
| Offline replay duplicates or overwrites data | `client_mutation_id` unique per response. Server compares `template_version` and rejects stale-version submits with a readable error. Only drafts sync offline. |
| Role changes on 31 Oct (Rajesh exit) leave orphaned assignments | Migration-free reassignment script: `process_role_defaults`, `work_item_templates.default_assignee`, open items with a reassignment event. **GATE:** names and accounts for Engineer and Jeniffer. |
| `fix/process-auth-and-event-delivery` conflicts with main after #195 | Rebase first. Run the `process-os-sql` and vitest suites. Small, isolated PR. |
| Photo storage outgrows the Free plan | On-device compression, retention job, storage-used alert in heartbeat. |
| Native has no test runner | Put the state machine, offline queue and guided-flow logic in `packages/shared` (vitest). Playwright covers web. Manual EAS preview script for native screens. |

**Rollback strategy:** each migration ships with a commented `-- ROLLBACK` block (the existing Process OS convention). New tables can be dropped independently. Column additions are nullable or defaulted. Guard triggers can be dropped. Every feature is behind `control_rules.mode` or a template's published status, so turning it off means data changes only, with no deploy.

---

## 6. Phased execution plan

**Step 0 — Stabilise what exists** (branch `fix/control-step0-foundations`)
1. Land `fix/process-auth-and-event-delivery` (durable outbox and dotted-route auth). Also: backfill marks events older than a day as `skipped`, and the delivery views are `security_invoker`.
2. Fix My Work audit: widen the `work_item_events` CHECK so approve rows stop being lost. Type `logWorkEvent` against a shared enum that mirrors the constraint.
3. Separation of duties on approve (approver ≠ assignee), enforced by the route and by a DB CHECK. Web and native hide Approve on your own submission.
4. From `feat/checklist-polish`: the native-side readable validation toast. Its chip and icon polish is already on main. Its server change was dropped because the web page parses the structured `validation_issues`.

**Phase 1 — Core control engine (DB plus API)**
- Checklist versioning, pinning and immutability. Append-only and hash-chained events. `performed_by`/`verified_by` and transition RPCs.
- `control_exceptions`, `corrective_actions`, `control_holds`, `control_rules`, `role_delegations`, `control_triggers`.
- SQL tests in `supabase/tests/control/` (run-local pattern), vitest for routes, RLS matrix tests.

**Phase 2 — Mobile UX (native first, web parity)**
- My Work buckets (Due now, Today, Overdue, Waiting for approval, Blocked, Done) and filters.
- Guided checklist runner, Report Issue sheet, verification screen, bilingual content, offline drafts, on-device photo compression, push with targeted invalidation.

**Phase 3 — Operational slices, one at a time**
Order: factory opening/closing → first-batch QC and hold → production completion reconciliation → dispatch readiness and proof of delivery → raw-material receipt and count → advance verification and order release → supplier invoice approval (thresholds) → cash/bank and collections → lead follow-up → milestone billing → incidents.

**Phase 4 — Governance**
- Ram, Engineer and Jeniffer control towers (summary RPCs).
- Admin template editor with preview, test and publish; approval-policy UI; audit search and export.

**Phase 5 — AI and optimisation**
- Explain-this-step (SOP-grounded, bilingual, labelled).
- Exception summaries and recurring-failure patterns.
- Egress review.

### 13 initial templates: where each one lives
| # | Template | Vehicle | Trigger | Phase |
|---|---|---|---|---|
| 1 | Factory opening & safety | Checklist (daily) | `my-work-generate` | 3 (slice 1) |
| 2 | Plan readiness and recipe/BOM version | Checklist per production day | `oc_production_days` created → trigger | 3 |
| 3 | First-batch QC | Checklist plus `process_qc_releases` / hold | Production posted → trigger | 3 |
| 4 | Production completion and qty reconciliation | Checklist (daily, Jeniffer verifies the record, not the physical) | Daily | 3 |
| 5 | Closing and safe shutdown | Checklist (daily) | Daily | 3 (slice 1b) |
| 6 | Raw material receipt and stock reconciliation | Checklist; discrepancy → exception → recount → approved `reconciliation` movement | Receipt / schedule | 3 |
| 7 | Dispatch readiness, loading, POD | Process definition (readiness gate + finance clearance + `no_active_hold`) | `oc_trips` planned | 3 |
| 8 | Lead response and quote follow-up | Existing lead-stage task + Process OS QUALIFICATION | Lead → `qualified_lead` | 3 |
| 9 | Advance payment verification and release | Existing `ADVANCE_VERIFICATION` stage | Process OS | 3 |
| 10 | Supplier invoice and payment approval | Process definition + `approval_policies` | Odoo `in_invoice` nightly pull → trigger | 3 |
| 11 | Daily cash/bank recon and overdue collections | Checklist (Jeniffer) + `ar-chase` data | Daily | 3 |
| 12 | Milestone verification and billing readiness | Checklist on WBS milestone | WBS milestone due | 3 |
| 13 | Incident and corrective action | `control_exceptions` + `corrective_actions` | Event (Report Issue) | 1–2 |

Ratios, thresholds, QC limits, SLAs and bank details are seeded as **configuration required** (`config_required = true`). They stay inactive until an approver fills them in.

---

## 7. First safe vertical slice

**Journey:** factory opening → required checks → physical verification → production-ready status → exception route.

| Step | What is built | Reuses |
|---|---|---|
| Generate | Opening checklist v1 (the existing "Production Opening Checklist", bilingual, items flagged blocking or deputy-allowed) generated daily for the Engineer. A deputy delegation lets the senior worker execute. | `work_item_templates`, `my-work-generate` cron, unique (template, user, date) |
| Execute (worker/deputy) | Guided runner, one item per screen. Yes/No/N/A, with a mandatory reason for N/A. Number readings with bounds. Photos where required. Offline draft. Submit online. | Native `my-work/[id].tsx` → extracted runner; attachments route |
| Fail | A blocking item answered No opens Report Issue (severity, reason, photo, corrective-action owner) and creates a `control_exceptions` row scoped to `factory_day`. The Engineer is pushed. The worker cannot mark the check complete. | FCM push via outbox |
| Verify (Engineer) | Engineer reviews and verifies, or returns it. Verifying requires `verified_by ≠ performed_by`. An unresolved blocking exception prevents verification. | Approve route → RPC |
| Readiness | `control_factory_readiness(date)` returns `ready`, `not_ready` or `blocked`, with reasons in English and Tamil. A badge shows on the native Production tab and Ops home. Missing checklist = not ready. | `oc_production_days` |
| Gate | `PRODUCTION_REQUIRES_OPENING_CHECK` rule in **warn** mode on production posting. Ram can switch it to **block**. | `oc_post_production_actual` route |
| Escalate | SLA: opening not verified by the configured time → push to the Engineer, then to Ram (reuses the nudges and SLA crons, no new cron). | `my-work-nudges`, `process-sla` |
| Ram view | One control-tower card: today's readiness, open critical exceptions, missed opening checks. One summary RPC. | Web dashboard / native CEO screen |

**Acceptance journeys covered by slice 1:** 1 (version pinning, applied to checklists), 2 (in full), 6 (deputy and escalation), 7 (offline draft and online-only verify), 9 (partial: RLS on the new tables), 10 (summary RPC). Journeys 3, 4, 5 and 8 come with the Phase 3 slices.

**Test plan:**
- SQL tests: version pin, separation of duties, append-only, RLS per role, readiness function.
- Vitest: transition RPC wrappers, offline queue reducer, rule evaluation.
- Playwright: web verify flow and control-tower card.
- Manual EAS preview script with screenshots for the worker, Engineer and Ram flows.

---

## 8. Decisions needed before building (GATES)

1. **Environment for the end-to-end demo:** is there a staging Supabase project, or should the slice be demonstrated on local Supabase (`supabase start` + `run-local.sh`) with a Vercel preview? Migrations must not touch prod `pailepomvvwjkrhkwdqt` without your approval.
2. **Roles:** OK to add a `factory_worker` app role? Which user accounts are "Engineer" and "Jeniffer"? Neither name is in the repo today. Who is the deputy? What should change in `process_role_defaults` and `production_supervisor` assignments when Rajesh leaves on 31 Oct?
3. **Opening checklist content:** approve, edit or replace the six seeded items. Mark which items block production and which a deputy may perform.
4. **Gate mode at launch:** warn (recommended) or block for "no production before verified opening check".
5. **Photo retention:** how long to keep full-resolution evidence.
6. **Unmerged work:** OK to rebase and land `fix/process-auth-and-event-delivery` (and `feat/checklist-polish`) as step 0?

## 9. Validation commands (per repo conventions)
```
bun typecheck && bun lint && bun test
cd apps/native && npx tsc --noEmit
bash supabase/tests/process_os/run-local.sh      # plus new supabase/tests/control/run-local.sh
cd apps/web && bun run test:e2e
```
Deploy path: PR → CI (`ci.yml`, `migration-gate.yml`, `process-os-sql.yml`) → approval → manual migration apply → Vercel deploy → EAS OTA to the `preview` channel, then production.
