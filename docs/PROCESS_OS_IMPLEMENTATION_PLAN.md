# Process OS — Implementation Plan (V0.1)

> PRD: [PRD_PROCESS_OS.md](PRD_PROCESS_OS.md) · Status: **IMPLEMENTED (V0.1)** on
> branch `claude/brave-edison-myfgtf` — see §10 for what shipped and what
> remains open. Originally Written after inspecting the repository as
> required by PRD §5 and §39. Sibling plan for the convention this follows:
> [MY_WORK_IMPLEMENTATION_PLAN.md](MY_WORK_IMPLEMENTATION_PLAN.md).

## 0. One-paragraph summary

Build the Process OS as a **thin, data-driven workflow engine inside
`apps/web`** (the app that owns every API route), persisted in new additive
`process_*` tables in Supabase, with stage transitions executed by PostgreSQL
functions (the only transactional path available through the Supabase client).
It **reuses** `work_items` as the single staff queue, `my-work-notify` /
`fcm.ts` / `telegram.ts` for notifications, `oc_*` (ops-control) for stock,
reservations and dispatch facts, Odoo via `odoo-service.ts` for
quotation/order/payment truth, and `onehub_sops.slug` for "How do I do this?".
V0.1 ships one process, **Lead-to-Delivery v1.0**, as the reference
implementation. No new app, no workflow microservice, no BPMN editor.

## 1. Codebase facts this plan is grounded on

| PRD asks for | What exists today (verified) | Decision |
|---|---|---|
| Auth / roles / permissions | `requireAuth` / `requireRole` / `requireFounder` in `apps/web/src/lib/api-helpers.ts`; cookie **or** Bearer via `getUserFromRequest` (mobile-safe). Roles: `founder, owner, accountant, engineer, sales, driver, production_supervisor`. `WORK_ADMIN_ROLES` in `src/lib/my-work-service.ts`. RLS is coarse; the API layer is the real enforcement. | Reuse. Map PRD process roles onto app roles (§3.2). Enforce in the engine service, not only in routes. |
| Task / checklist engine | `work_items` (status `pending→in_progress→submitted→completed/returned/cancelled`, `source_module`, `source_record_id`, `related_lead_id`, `linked_sop_slug`, `requires_approval`), `work_item_events` audit, `my-work-notify.ts` (`notifyWorkAssigned`, `notifyWorkReturned`, `notifyWorkEscalated`…). Native + web My Work screens already deep-link `/onehub/my-work/{id}`. | **My Work IS the PRD's "My Work".** Each active process stage instance mirrors to exactly one `work_items` row (`source_module='process_os'`). Checklist items live in `process_tasks`, not `work_checklist_*` (those are date/photo inspection checklists). |
| Lead stage model | `leads.pipeline_stage` CHECK: `new_inquiry, qualified_lead, quote_shared, factory_visit_proof, decision_pending, finalisation, order_won, closed_lost`. Migration `20260903120000_lead_stage_progression_tasks.sql` has a **BEFORE UPDATE trigger that creates one open `work_items` row per lead stage** (`source_module='lead_stage_progression'`). | The sales half of Lead-to-Delivery **reads** `pipeline_stage` in its gates rather than duplicating it. The trigger must skip leads that have an active process instance (§3.6) or staff get two tasks per stage. |
| Odoo links on leads | `leads.odoo_lead_id`, `odoo_partner_id`, `odoo_quote_id/number/amount/date`, `odoo_order_id/number/amount/date` (pull via `pullQuotesFromOdoo`). | Gate `quote_exists` = `odoo_quote_id IS NOT NULL`; `order_confirmed` = `odoo_order_id IS NOT NULL`. |
| Payment truth | `receivables.ts` reads `account.move` with `payment_state`. No advance/payment helper exists. `odooExecute()` has a 25 s timeout. `leads.odoo_quote_id` / `odoo_order_id` are both `sale.order` ids (quote vs confirmed). | New `readOrderPaymentStatus(odooOrderId)` in `src/lib/process/facts/odoo.ts` (invoices linked to the sale order → paid amount). Advance threshold is an **open question** (§8). |
| Stock / reservation / dispatch facts | Odoo stock = `product.product.qty_available` mirrored into `finished_goods.stock_qty` by `pullFinishedGoodStock()` (no `stock.quant` read). ops-control: `oc_sales_order_lines` (Odoo SO lines synced, `qty_ordered/qty_delivered`, `finished_good_id`), `oc_stock_reservations`, `oc_inventory_movements`, `loadInventory()` / `loadReservationsBySoLine()` in `inventory-service.ts`, `computeCoverage()` / `computeReadiness()` in `fulfilment.ts`, `oc_delivery_schedules`, `oc_trips`, `oc_audit_events`. | Factory gates call these — no new stock model. `stock_feasible` = `computeCoverage` for the SO line at the requested date. |
| Production plan | `ops_plan*` + `oc_production_plan_lines` / `oc_production_allocations`. | Stage 9 links `process_stage_instances.linked_record` to an allocation id; no new plan table. |
| Quality release | **Not found** — no QC table anywhere. | V0.1.1: a real QC record (`process_qc_releases` — product, quantity, batch, released/hold, checker) written through `process_record_qc_release`; the `qc_released` gate is verified in the database from the record. Lead-to-Delivery v1.1 uses it. |
| Delivery | `deliveries` (+ `/api/deliveries/[id]/complete` with photos, recipient), `oc_trips` / `oc_trip_load_lines`. | Stages 11–13 link to `oc_trips` / `deliveries` ids; `delivered` gate = linked delivery `completed`. |
| Notifications | `fcm.ts` (`sendPushToUsers`, `filterByPushPref`, `getUserIdsByRoles`), `telegram.ts`, `email.ts`, `my-work-notify.ts`. No unified event bus, no `notifications` table, **no n8n / webhook helper**. | Add a small in-process dispatcher `emitProcessEvent()` that (1) inserts `process_events`, (2) fans out to notify handlers, (3) optionally POSTs to `PROCESS_EVENT_WEBHOOK_URL` (n8n) if set. Engine never imports a provider directly. |
| Approval workflow precedent | `tickets` (`pending/in_review/approved/rejected/changes_requested`) + `ticket_history`, `ticket-service.ts`. | Handover accept/reject copies the ticket-service shape (service function + `[id]/accept`, `[id]/reject` routes) but is its own table per PRD §11. |
| Audit precedent | `work_item_events`, `ticket_history`, `oc_audit_events` (`before_value/after_value/reason/performed_by`). | `process_events` follows `oc_audit_events` column style. |
| SOPs | `onehub_sops.slug` (UNIQUE), bilingual JSONB steps, RAG-ingested on publish. `work_items.linked_sop_slug` already exists. | Stage `configuration.sop_slug` → "How do I do this?" opens the SOP; AI fallback via `/api/knowledge/ask`. |
| Intelligence layer | `POST /api/knowledge/ask` (Gemini RAG), `src/lib/maiyuri-agents/*` (collectors), `apps/api/src/agents/tools/supabase-tools.ts` (plain async functions), `AgentTool {name, description, inputSchema, handler}` in `apps/api/src/agents/types.ts` (no live tool-calling loop wired yet), `docs/plans/2026-08-25-agentic-ai-operating-architecture.md` (Hermes + Maiyuri Intelligence MCP, planned). Frozen contract in `UNIT_ECONOMICS.md` is read-only SQL views. | Tools are pure TS functions with zod inputs in `src/lib/process/ai-tools.ts`, exposed as (a) a server route for the future MCP, (b) context enrichment inside `/api/knowledge/ask`, (c) SQL views `v_process_*` in the same "frozen contract" style. |
| Web nav | `roleModuleAccess` + `navigation[]` in `app/(dashboard)/layout.tsx` **and** `protectedRoutes` in `middleware.ts` (both required — known bug class). | Add `processes` module key + `/processes` route to both. |
| Native nav | `TAB_ACCESS` in `app/(tabs)/_layout.tsx`, `NavDrawer` `DESTINATIONS` + `ROLE_KEYS` (`src/ui/NavDrawer.tsx`), role via `useMyRole()` (`src/hooks/use-approvals.ts`), OneHub stack `app/onehub/*`. UI kit `src/ui/*` (Touchable/Button/Icon/Card/Skeleton). | Processes screen under OneHub stack + drawer entry; **no new tab** (tabs are primary destinations, this is JS-only so ships by OTA). |
| API conventions | `{data,error,meta}` envelope via `src/lib/api-utils.ts` (`success/error/parseBody/handleZodError`); zod schemas in `packages/shared/src`. | Follow. |
| Tests | Vitest via `apps/web/vitest.config.ts`, co-located `*.test.ts` (e.g. `ops-control/fulfilment.test.ts`); Playwright in `apps/web/tests/e2e/*.spec.ts`. No local DB in unit tests; services are tested with mocked supabase clients. | Engine core is written as pure functions over an in-memory state + a thin repository, so gate/transition logic is unit-testable without a DB. RPC/SQL logic gets pgTAP-style SQL smoke tests run manually against a Supabase branch. |
| Migrations | `supabase/migrations/<timestamp>_<name>.sql`, `BEGIN … COMMIT`, `update_updated_at()` trigger helper, RLS via SECURITY DEFINER helpers (`is_work_supervisor`), applied to **prod directly; no staging DB**. | One additive migration per milestone with a commented `-- ROLLBACK` block. Apply only with explicit consent per repo rule. |

## 2. Architectural decisions (record before coding — PRD §5)

- **D1 — Engine location:** `apps/web/src/lib/process/` (service layer) + `apps/web/app/api/process/*` (routes). No separate service. Native is a thin client as everywhere else.
- **D2 — Transactions:** Supabase JS has no multi-statement transactions and CLAUDE.md prohibits non-transactional multi-table writes. Every state-changing operation (start, complete task, advance stage, accept/reject handover, cancel, override) is a **plpgsql function** (`process_*`) that takes an *expected current stage* argument and fails with a typed error on mismatch (optimistic concurrency). Gate evaluation that needs Odoo happens in TypeScript **before** the RPC; the RPC re-checks the DB-resident gates (checklist complete, handover accepted) so a stale client cannot skip them.
- **D3 — Definitions are data, seeded from code:** the canonical Lead-to-Delivery definition is a typed TS object (`definitions/lead-to-delivery.ts`) validated by a zod schema in `packages/shared/src/process.ts`, imported into the tables through the admin import endpoint. Same schema accepts JSON upload from admins later (PRD §19). No YAML dependency.
- **D4 — Versions are immutable once ACTIVE:** stage/transition/gate rows belong to a `process_versions` row; instances store `process_version_id`. Publishing a new version never touches rows of old versions (PRD §20).
- **D5 — My Work is the queue:** no second queue UI. A stage instance ⇢ one `work_items` row; completing the stage completes the item; returned handover re-opens the sender's item. `work_items.activity_type` gains `'process'` (CHECK constraint widened additively).
- **D6 — Role ⇄ user resolution:** PRD roles are process-level keys (`SALES_ENGINEER`, `FACTORY_MANAGER`, `FINANCE`, `MANAGING_PARTNER`). `process_role_defaults(role_key → user_id)` is admin-set (Srinivasan, Rajesh, …). Assignment order: explicit assignee on instance → role default → unassigned (visible in the role queue, claimable by anyone whose app role maps to that process role).
- **D7 — Gates fail closed:** any gate that cannot be evaluated (Odoo timeout, missing SO line, ops-control not synced) returns `UNKNOWN`, which blocks with a human-readable reason and emits `process.gate_failed`. Never auto-pass.
- **D8 — Overrides:** only `founder`/`owner`. Override is its own RPC that records `process_events(event_type='GATE_OVERRIDDEN', payload={gate_key, reason})`; reason is mandatory.
- **D9 — Existing lead trigger:** `prepare_lead_stage_progression()` / its AFTER trigger get one additive early-return: *if an active `process_instances` row exists for this lead, do nothing* (the process now owns the lead's task). Leads without a process instance behave exactly as today (PRD §37.16).
- **D10 — Events first:** every mutation emits through `emitProcessEvent()`; notifications, the SLA cron, analytics views and AI tools consume `process_events` — nothing reads engine internals directly.

## 3. Design

### 3.1 Database (migration `supabase/migrations/<ts>_process_os.sql`)

All tables: UUID PK, `created_at`, `updated_at` via the current `public.set_updated_at()` helper (`trg_<table>_updated_at`), RLS enabled (authenticated SELECT; writes only through service-role routes, per the ops-control pattern), `COMMENT ON` everything, indexes on FKs and status columns. Names follow the repo's plural snake_case. Timestamp prefix must not collide with an existing file (two already share `20260808120000`).

| Table | Notes beyond PRD §10 |
|---|---|
| `process_definitions` | `process_key TEXT UNIQUE`, `category` CHECK (`SALES, FACTORY, DELIVERY, FINANCE, PROJECTS, SAFETY`), `status` (`active, archived`), `active_version_id` |
| `process_versions` | `UNIQUE(process_definition_id, version)`, `status` (`DRAFT, ACTIVE, RETIRED`), `definition JSONB` (the imported source, for display/export), `effective_from/to` |
| `process_stages` | `stage_key` UNIQUE per version, `stage_type` CHECK (`ACTION, DECISION, HANDOVER, WAIT, AUTOMATION, END`), `owner_role TEXT`, `sla_minutes INT`, `is_start BOOLEAN`, `configuration JSONB` (`sop_slug`, `evidence_types`, `handover_payload_fields`, `entity_link`) |
| `process_transitions` | `from_stage_id`, `to_stage_id`, `transition_key`, `condition JSONB` (gate keys / outcome value), `priority`, `is_exception BOOLEAN` |
| `process_checklist_items` | `item_key` UNIQUE per stage, `required`, `evidence_required`, `sequence` |
| `process_gates` | `gate_key`, `gate_type` CHECK (see §3.3), `condition JSONB`, `failure_message`, `overridable BOOLEAN DEFAULT true` |
| `process_automations` | `event` (event type), `action_type` CHECK (`SEND_NOTIFICATION, CREATE_TASK, ASSIGN_USER, CREATE_HANDOVER, UPDATE_STATUS, CALL_WEBHOOK`), `configuration`, `enabled` |
| `process_role_defaults` | `role_key` UNIQUE, `user_id`, `updated_by` |
| `process_instances` | `entity_type` CHECK (`lead, sales_order, delivery, project, generic`), `entity_id TEXT`, `status` (`active, blocked, completed, cancelled`), `current_stage_id`, `imported_existing_case BOOLEAN DEFAULT false`, `import_source`, `imported_at`, `context JSONB` (customer/product/qty snapshot for display), `lock_version INTEGER NOT NULL DEFAULT 0` (ops-control optimistic-concurrency convention). Partial unique index: one **active** instance per (definition, entity). |
| `process_stage_instances` | `status` (`upcoming, current, completed, blocked, failed, skipped, cancelled`), `assigned_role`, `assigned_user_id`, `work_item_id → work_items`, `due_at`, `sla_warned_at`, `sla_breached_at`, `blocked_reason JSONB` (`{code, message, proposed_date?}`), `linked_record JSONB` (`{type, id}` e.g. oc allocation / trip / delivery), `outcome TEXT` (DECISION stages: `QUALIFIED/NURTURE/DISQUALIFIED`…) |
| `process_tasks` | one row per checklist item per stage instance; `status` (`open, done, na`), `completed_by`, `note` |
| `process_evidence` | `evidence_type` (`quotation, payment_reference, photo, drawing, customer_confirmation, lab_report, delivery_ack, note, link`), `source_type` (`storage, odoo, url, work_item_attachment`), `source_id`, `path` |
| `process_handovers` | per PRD §11; `payload JSONB` validated against the stage's `handover_payload_fields`; `rejection_reason_code` CHECK (`INSUFFICIENT_STOCK, INSUFFICIENT_CURING_STOCK, CAPACITY, RAW_MATERIAL, DATE_INFEASIBLE, INCOMPLETE_PACKAGE, OTHER`), `proposed_date DATE` |
| `process_events` | `event_type`, `actor_type` (`user, system, ai`), `actor_id`, `stage_instance_id`, `before_value JSONB`, `after_value JSONB`, `reason`, `payload JSONB`. **Insert-only** (no UPDATE/DELETE policy; revoke from authenticated). |

Views for analytics / AI (frozen-contract style, `security_invoker`):
`v_process_stage_durations`, `v_process_sla_compliance`, `v_process_handover_outcomes`, `v_process_open_work`.

Functions (SECURITY DEFINER, `SET search_path=''`, every one inserts its own `process_events` rows inside the same transaction):

- `process_start(p_definition_key, p_entity_type, p_entity_id, p_actor, p_context, p_start_stage_key DEFAULT NULL, p_imported BOOLEAN DEFAULT false)`
- `process_complete_task(p_task_id, p_actor, p_status, p_note)`
- `process_advance(p_instance_id, p_expected_stage_id, p_transition_key, p_actor, p_gate_results JSONB)` — validates required tasks done, DB-resident gates, transition exists from current stage; creates next stage instance + mirrored `work_items` row; completes previous work item.
- `process_block(p_instance_id, p_expected_stage_id, p_reason JSONB, p_actor)` / `process_unblock(...)`
- `process_handover_create / _accept / _reject(p_handover_id, p_actor, p_reason_code, p_proposed_date, p_comment)` — reject moves the instance back along the stage's `is_exception` transition and re-opens the sender's work item.
- `process_cancel(p_instance_id, p_reason, p_actor)`
- `process_override_gate(p_instance_id, p_gate_key, p_reason, p_actor)` — checks `users.role IN ('founder','owner')` inside SQL too.
- `process_publish_version(p_version_id, p_actor)` — flips previous ACTIVE to RETIRED, sets `active_version_id`; refuses if the version fails `process_validate_version()` (SQL-side duplicate/orphan checks; the full validator is TS).

Every function takes `pg_advisory_xact_lock(hashtextextended(p_instance_id::text, 0))` first (same race guard as `sync_lead_stage_progression_work_item`).

Rollback: existing migrations are forward-only with no DOWN sections; the PRD requires a rollback strategy, so this migration ends with a commented `-- ROLLBACK` block that drops functions, views, tables (reverse order), restores the `activity_type` CHECK, and removes the trigger early-return. `work_items` rows with `source_module='process_os'` are left in place (they are history).

### 3.2 Roles and permissions (`src/lib/process/permissions.ts`)

```
PROCESS_ROLE_MAP = {
  SALES_ENGINEER:   ['sales', 'engineer'],
  FACTORY_MANAGER:  ['production_supervisor'],
  FINANCE:          ['accountant'],
  MANAGING_PARTNER: ['founder', 'owner'],
}
```
`founder`/`owner` satisfy every role. Lead-scoped stages additionally reuse `canWorkOnLead()` from `src/lib/sales-access.ts` so a sales user only acts on their own leads. Server checks (all in the service, not only routes): complete task / advance stage → actor's app role ∈ stage `owner_role` map **or** actor is the assigned user; accept/reject handover → `to_role`; verify advance → `FINANCE` (or override); cancel → creator of instance or `MANAGING_PARTNER`; publish/retire/import → `MANAGING_PARTNER`.

### 3.3 Gate types (`src/lib/process/gates/*.ts`, each pure + one fact-loader)

| `gate_type` | Condition JSON | Fact source | V0.1 use |
|---|---|---|---|
| `checklist_complete` | `{}` | `process_tasks` | every ACTION stage |
| `entity_field` | `{table:'leads', field:'pipeline_stage', in:[...]}` | Supabase | sales stages read `pipeline_stage`, `lead_status`, `odoo_quote_id` |
| `odoo_quote_linked` | `{}` | `leads.odoo_quote_id` (+ live `sale.order` state check, tolerant) | Stage 4 |
| `advance_verified` | `{min_percent: 30}` | `readOrderPaymentStatus()` (Odoo invoices on the SO) **or** a FINANCE-role `payment_reference` evidence with amount | Stage 7 |
| `handover_accepted` | `{}` | `process_handovers` | Stage 8 |
| `stock_feasible` | `{as_of:'requested_delivery_date'}` | `computeCoverage()` over `oc_sales_order_lines` + `loadInventory()` + reservations | Stage 8 checklist helper + Stage 11 gate |
| `manual_confirmation` | `{role:'FACTORY_MANAGER', evidence_type?:'photo'}` | `process_evidence` by allowed role | Stage 10 (QC), Stage 6 (customer acceptance) |
| `linked_record_status` | `{type:'delivery', status:'completed'}` | `deliveries` / `oc_trips` | Stages 12–13 |
| `decision_outcome` | `{in:['QUALIFIED']}` | `process_stage_instances.outcome` | Stage 2 |

Every evaluator returns `{ok:true} | {ok:false, code, message} | {ok:'unknown', message}`; `unknown` blocks (D7).

### 3.4 Events → notifications (`src/lib/process/events.ts`, `notify.ts`)

Event types exactly as PRD §32 plus `process.gate_overridden`, `process.blocked`, `process.unblocked`. `notify.ts` maps: `handover_requested` → push+Telegram to `to_user` (or all users of `to_role`), `handover_rejected` → sender, `stage_started` → assignee (reuses `notifyWorkAssigned` on the mirrored work item — so no duplicate push), `sla_warning/breached` → assignee + MANAGING_PARTNER, `completed` → instance creator. Idempotency key `(event_id, channel, user_id)` stored in `process_events.payload.notified` to satisfy PRD §33 "no duplicates". Webhook: if `PROCESS_EVENT_WEBHOOK_URL` is set, POST the event (n8n) with `PROCESS_EVENT_WEBHOOK_SECRET` header; failures are logged, never block the transaction.

### 3.5 SLA cron

`app/api/cron/process-sla/route.ts` (guarded by `CRON_SECRET`) + `.github/workflows/process-sla.yml` (hourly, alert-on-failure step copied from `ar-chase.yml`). Warns at 80 % of `sla_minutes`, breaches at 100 %; both idempotent via the `sla_*_at` columns. Breach also escalates the mirrored work item through existing `notifyWorkEscalated`. The existing `/api/my-work/nudges` engine (nag/evening/escalate) keeps nagging the mirrored work item unchanged, so staff get one consistent reminder rhythm.

### 3.6 Lead-to-Delivery v1.0 definition (summary; full object in `definitions/lead-to-delivery.ts`)

| # | stage_key | type | owner_role | key gates | entity link |
|---|---|---|---|---|---|
| 1 | `NEW_LEAD` | ACTION | SALES_ENGINEER | checklist; `entity_field leads.id exists`; first response = a `notes` row or `call_recordings` row for the lead | lead |
| 2 | `QUALIFICATION` | DECISION | SALES_ENGINEER | `decision_outcome` (QUALIFIED → 3, NURTURE → wait/5, DISQUALIFIED → END with reason) | lead (`pipeline_stage ≥ qualified_lead`) |
| 3 | `TECHNICAL_FIT` | ACTION | SALES_ENGINEER | checklist + evidence `drawing` optional | lead |
| 4 | `QUOTATION` | ACTION | SALES_ENGINEER | `odoo_quote_linked` | lead.odoo_quote_id |
| 5 | `FOLLOW_UP` | WAIT | SALES_ENGINEER | SLA on staleness; transitions → 6 or back to 4 (revision) or 2 (lost) | lead |
| 6 | `CUSTOMER_ACCEPTANCE` | ACTION | SALES_ENGINEER | `manual_confirmation` evidence `customer_confirmation`; `entity_field odoo_order_id not null` | lead → SO |
| 7 | `ADVANCE_VERIFICATION` | ACTION | FINANCE | `advance_verified` (non-overridable by SALES) | SO |
| 8 | `FACTORY_HANDOVER` | HANDOVER | FACTORY_MANAGER | `handover_accepted`; reject → exception transition back to 6 with `proposed_date` | SO line |
| 9 | `PRODUCTION_ALLOCATION` | ACTION | FACTORY_MANAGER | checklist; `linked_record` = oc allocation/reservation | oc_stock_reservations |
| 10 | `QUALITY_RELEASE` | ACTION | FACTORY_MANAGER | `manual_confirmation` (QC) — fail → block | — |
| 11 | `DELIVERY_PLANNING` | ACTION | FACTORY_MANAGER | checklist; `stock_feasible`; `advance_verified` re-check | oc_delivery_schedules / oc_trips |
| 12 | `DISPATCH` | ACTION | FACTORY_MANAGER | `linked_record_status` trip dispatched | oc_trips |
| 13 | `DELIVERED` | ACTION | FACTORY_MANAGER | `linked_record_status` delivery completed | deliveries |
| 14 | `POST_DELIVERY` | ACTION | SALES_ENGINEER | checklist → END | lead |

Instance `entity_type='lead'` throughout; `context` carries `odoo_order_id` once known so factory stages resolve SO facts. Exception transitions (`is_exception=true`) exist for: 8→6 (date infeasible), 10→9 (QC hold), 11→9 (stock short), any→CANCELLED (customer lost, requires reason).

### 3.7 API (`apps/web/app/api/process/*`, all `getUserFromRequest`-based, envelope from `api-utils`)

| Route | Method | Who |
|---|---|---|
| `definitions` · `definitions/[key]` · `definitions/[key]/versions/[v]` | GET | any auth |
| `definitions/import` | POST (JSON body validated by `ProcessDefinitionSchema`) → DRAFT version | MANAGING_PARTNER |
| `versions/[id]/publish` · `versions/[id]/retire` | POST | MANAGING_PARTNER |
| `instances` (start) · `instances/[id]` · `instances/[id]/advance` · `/block` · `/cancel` · `/override` · `/history` | POST/GET | per §3.2 |
| `instances/for/[entityType]/[entityId]` | GET (journey view) | any auth |
| `tasks/[id]/complete` · `tasks/[id]/evidence` | POST | owner role / assignee |
| `handovers` (create) · `handovers/[id]/accept` · `/reject` | POST | from_role / to_role |
| `work` (`?scope=mine|role|overdue`) | GET — merges mirrored work_items + role queue + pending handovers | any auth |
| `role-defaults` | GET/PUT | MANAGING_PARTNER |
| `ai/tools` | POST `{tool, input}` — server-side tool runner for the intelligence layer | auth + `PROCESS_AI_TOKEN` for MCP |
| `cron/process-sla` | POST | `CRON_SECRET` |

Shared zod schemas: `packages/shared/src/process.ts` (definition schema, request bodies, event types) — exported raw like the rest of `@maiyuri/shared` (see LEARNINGS zod gotcha; zod already in root devDeps).

### 3.8 Web UI (`apps/web/app/(dashboard)/processes/*`, `src/components/process/*`)

- `/processes` — library grid (cards per PRD §7.1) grouped by category; search box filters processes + SOPs (`onehub_sops`) + my active cases.
- `/processes/[key]` — Process Map: horizontal stepper on desktop, vertical journey under `md:`; stage drawer shows owner, checklist, gates, SLA, SOP link; version switcher (read-only for non-admin).
- `/processes/[key]/versions/[v]/edit` — V0.1 admin = **JSON import + validation report** only (PRD §19).
- `ProcessJourney` component (✓ ● ! ○) embedded in `leads/[id]` (web) and in the `/quotes` inbox row when an instance exists.
- My Work detail (`onehub/my-work/[id]`) renders `ProcessStagePanel` when `source_module==='process_os'`: context header, task checklist, evidence attach (reuses `work_item_attachments` upload), gate status list, primary buttons (Complete stage / Raise exception / Accept handover / Reject handover), "How do I do this?" → SOP or Ask Mayur.
- `/processes/instances/[id]` — timeline (PRD §28) from `process_events`.
- Nav: add `processes` to `roleModuleAccess` for all roles except `driver`; add `/processes` to `middleware.ts` `protectedRoutes`; E2E smoke covers the redirect.

### 3.9 Native UI (JS-only → OTA)

- `app/onehub/processes/index.tsx` (library), `processes/[key].tsx` (vertical map: previous ✓ / current ● / next ○), drawer entry.
- `onehub/my-work/[id].tsx` gains the same `ProcessStagePanel` (built with `Card`, `Button`, `Icon`; haptics from `toast`); Accept/Reject handover is a bottom-sheet form (reason code picker + proposed date + comment).
- `leads/[id].tsx` gets a compact journey strip above Smart Quote.
- Hooks: `src/hooks/use-process.ts` (`useProcessWork`, `useProcessInstance`, `useHandoverActions`) over `api.*`.

### 3.10 AI tools (`src/lib/process/ai-tools.ts`)

Pure functions with zod inputs, exactly the PRD §16 names: `get_process_definition`, `get_active_process`, `get_current_process_stage`, `get_user_process_tasks`, `get_process_blockers`, `get_process_handover`, `explain_next_action`, `get_process_history`, `get_process_sla_risks`. `explain_next_action` composes definition text + gate results + linked Odoo facts, never free-form. Wiring: (1) `/api/knowledge/ask` — if the question resolves to a lead/order with an active instance (phone/name/SO match through existing collectors), the stage facts are prepended to the RAG context and cited as a source; (2) `/api/process/ai/tools` for the planned Maiyuri Intelligence MCP / Hermes; (3) `apps/api/src/agents/tools/process-tools.ts` exposes them as `AgentTool[]` for CloudCore agents. Note `/api/knowledge/ask` currently has no `requireAuth`; process facts are only injected when a user is resolved, and never for anonymous calls. Coaching ("Why do I have to do this?") = `explain_next_action` + the stage's `sop_slug` article through the existing RAG.

## 4. Milestones (each = one PR, each ends with `bun typecheck && bun lint && bun test` green)

| # | PR | Deliverable | Tests | PRD §37 criteria |
|---|---|---|---|---|
| M0 | `docs: process os prd + plan` | This document + PRD | — | — |
| M1 | `feat(process): schema + definition model` | Migration (tables, views, RPC functions, trigger early-return, rollback block); `@maiyuri/shared` process schemas; definition validator (`validate-definition.ts`); `lead-to-delivery.ts` seed; import/publish/retire service + routes | Validator unit tests for every PRD §33 rule; SQL smoke script on a Supabase branch (`process_start`, `process_advance`, concurrency) | 1, 14 |
| M2 | `feat(process): engine + gates` | Engine service (start / task / advance / block / cancel / override), gate evaluators + Odoo/ops-control fact loaders, `emitProcessEvent`, permissions | Runtime unit tests (mocked repo + facts): start, complete task, gate enforcement, transition, exception, cancel, fail-closed on Odoo error; security tests (role matrix, payment bypass, override) | 5, 7, 8, 9, 10 |
| M3 | `feat(process): handovers + my work + notifications` | Handover service + routes, work_items mirroring, `/api/process/work`, `notify.ts`, SLA cron + workflow | Handover accept/reject/idempotent-notify tests; cron idempotency | 3, 6, 11 |
| M4 | `feat(process): web ui` | Library, map, journey on lead detail, stage panel in My Work, timeline, nav + middleware | Component tests; Playwright: anon redirect, library renders, Scenario A walk-through against a seeded instance | 2, 12, 15 |
| M5 | `feat(process): native ui` | OneHub processes screens, stage panel, journey strip, drawer entry; `npx tsc --noEmit` inside `apps/native` | Hook tests | 15 |
| M6 | `feat(process): ai tools` | Tool functions, ask-route enrichment, tool runner route, CloudCore re-export, views documented as frozen contract in `UNIT_ECONOMICS.md` style | Tool unit tests; "AI never invents stage" test (answer must cite instance) | 13 |
| M7 | `feat(process): golden e2e + import of open leads` | Golden scenarios A–E as service-level integration tests (mocked Odoo, real definition); optional admin action "start process at current stage" (`imported_existing_case=true`) | Scenarios A–E | 4, 16 |

Phase mapping to PRD §36: Phase 1 = M1–M2, Phase 2 = M3–M5, Phase 3 = M6, Phases 4–5 = new definitions only (no engine changes expected — that is the test of the design).

## 5. Migration and rollout risks

| Risk | Mitigation |
|---|---|
| **No staging DB** — migration applies to prod | Develop on a Supabase branch via MCP `create_branch`; apply to prod only with explicit consent (repo rule). All DDL additive; rollback block tested on the branch. |
| Double tasks per lead stage (existing trigger + process) | D9 early-return; regression test that a lead **without** an instance still gets its trigger item. |
| `work_items.activity_type` CHECK | Widen with `ALTER TABLE … DROP CONSTRAINT / ADD CONSTRAINT` in the same migration; rollback restores. |
| Advance semantics unknown (percent? fixed? which Odoo document?) | Gate reads `condition.min_percent`; until the business confirms, FINANCE evidence path is the default and Odoo auto-pass is off (`condition.auto_from_odoo=false`). |
| Odoo qty semantics (qty=1 lines may be lots — known gotcha) | Factory gates use `oc_sales_order_lines.is_demand` + `finished_good_id` only; unmapped lines block with a clear message. |
| No QC model | Done in V0.1.1: `process_qc_releases` + `qc_released` gate; the swap shipped as Lead-to-Delivery v1.1 (running 1.0 cases unaffected). |
| Coarse RLS | Engine functions are SECURITY DEFINER and enforce role checks in SQL; routes enforce again; `process_events` is insert-only for everyone. |
| Native needs OTA, not a build | All native changes are JS-only (no new native modules). |
| `packages/shared` raw-source zod export | Follow the existing pattern; do not add new runtime deps to `shared`. |
| Multi-session repo (other Claude sessions merge concurrently) | Each milestone rebases on `main` before push; migration timestamp assigned at merge time. |

## 6. Test plan (maps PRD §33–34)

- **Definition validation** (`validate-definition.test.ts`): duplicate stage keys, transition to missing stage, unreachable stage, no/multiple start stages, unknown `owner_role`, cycle without an `is_exception` edge, gate key referenced but undefined, checklist key duplicates, END stage with outgoing transitions.
- **Runtime** (`engine.test.ts` with an in-memory repository): start creates stage 1 + work item + `PROCESS_STARTED`; task completion; advance refused while required task open; gate `unknown` blocks; exception transition restores previous owner; cancel requires reason; two concurrent advances → second gets `STALE_STAGE`.
- **Security** (`permissions.test.ts`): sales completing a FACTORY stage → 403; sales calling `advance_verified` evidence → 403; engineer override → 403; founder override → OK + `GATE_OVERRIDDEN` event.
- **Versioning**: publish v1.1 while an instance runs on v1.0 → instance still resolves v1.0 stages; new start uses v1.1.
- **Audit**: every RPC path inserts ≥1 event; timeline route returns them ordered.
- **Odoo**: fact loader throws → gate `unknown`; missing SO line → `unknown` with message; payment partial below threshold → `fail`.
- **Notifications**: recipients per event type; re-emitting the same event id does not re-send.
- **Golden A–E** (`golden.test.ts`): full definition, mocked facts, assert final status and event sequence. Scenario C asserts the instance never has a stage instance for `FACTORY_HANDOVER`; D asserts a 403 and no state change; E asserts `DELIVERY_PLANNING` never starts while QC evidence is missing.
- **E2E** (`apps/web/tests/e2e/process.spec.ts`): anonymous `/processes` → `/login`; authenticated library renders Lead-to-Delivery card; map shows 14 stages.

## 7. Files to be created / touched (index)

```
supabase/migrations/<ts>_process_os.sql
packages/shared/src/process.ts                      (+ export from index)
apps/web/src/lib/process/
  types.ts  permissions.ts  validate-definition.ts  repository.ts
  engine.ts  events.ts  notify.ts  sla.ts  handovers.ts  work-queue.ts
  ai-tools.ts
  gates/{index,checklist,entity-field,odoo-quote,advance,handover,stock,manual,linked-record,decision}.ts
  facts/{odoo.ts,ops-control.ts,leads.ts}
  definitions/lead-to-delivery.ts
apps/web/app/api/process/**                          (routes per §3.7)
apps/web/app/api/cron/process-sla/route.ts
.github/workflows/process-sla.yml
apps/web/app/(dashboard)/processes/**               apps/web/src/components/process/**
apps/web/app/(dashboard)/layout.tsx                 (roleModuleAccess)   apps/web/middleware.ts (protectedRoutes)
apps/web/app/onehub/my-work/[id]/*                  (stage panel hook-in)
apps/native/app/onehub/processes/*  apps/native/app/onehub/my-work/[id].tsx  apps/native/app/leads/[id].tsx
apps/native/src/hooks/use-process.ts  apps/native/src/ui/NavDrawer.tsx
apps/api/src/agents/tools/process-tools.ts
apps/web/app/api/knowledge/ask/route.ts             (context enrichment)
docs/UNIT_ECONOMICS.md or docs/PROCESS_OS_CONTRACT.md (frozen views)
.claude/skills/maiyuri-architecture/SKILL.md        (new §3.16 Process OS)
```

## 8. Open questions for the owner (do not block M1–M2)

1. **Advance rule:** what counts as "advance verified" — a percentage of the SO total, a fixed amount, or an accountant's confirmation? Which Odoo document carries it (customer invoice paid / payment register)?
2. **Role defaults:** confirm Srinivasan = `SALES_ENGINEER`, Rajesh = `FACTORY_MANAGER`, and who is `FINANCE` today (accountant user?).
3. **SLA numbers** for each stage (PRD gives 15 min for New Lead only) — plan uses placeholders in the seed, editable per version.
4. **When does a lead's process start** — automatically on lead creation (every lead gets an instance) or manually from the lead screen? Plan defaults to *automatic for new leads once M3 ships*, manual "start at current stage" for existing leads.
5. **n8n:** is an n8n instance available? Nothing in the repo references one; the webhook hook is env-gated and inert until configured.
6. **QC:** ~~acceptable that V0.1 QC release is a supervisor confirmation with photo, not a lab record?~~ Resolved (V0.1.1): real QC record — see `20260913100000_process_qc_releases.sql`.

## 9. Definition of done for V0.1

All 16 PRD §37 criteria mapped in §4 are demonstrably met on the Vercel preview and on a real Android device via OTA, golden scenarios A–E pass in CI, the migration has been applied to prod with consent, and `.claude/skills/maiyuri-architecture/SKILL.md` documents the Process OS.

## 10. Implementation notes (what shipped in V0.1)

| Area | Where | Notes |
|---|---|---|
| Schema + engine functions | `supabase/migrations/20260912100000_process_os.sql` | Additive; commented ROLLBACK block at the end. **Applied to prod (`pailepomvvwjkrhkwdqt`) on 2026-09-12** as three Supabase migrations `process_os_part1_schema`, `process_os_part2_engine`, `process_os_part3_views_and_lead_trigger` (same content, BEGIN/COMMIT stripped); all 29 function bodies verified identical to this file. |
| Shared contract | `packages/shared/src/process.ts` | Definition input schema, row types, view models, request bodies, labels. `work_items.activity_type` gains `process`. |
| Definition validator | `apps/web/src/lib/process/validate-definition.ts` | Every PRD §33 definition rule, tested. |
| Reference process | `apps/web/src/lib/process/definitions/lead-to-delivery.ts` | 17 stages (PRD's 14 + `HANDOVER_PACKAGE` so **sales** sends/receives the handover + two END stages). Seed: `POST /api/process/definitions/seed`. |
| Engine, gates, facts | `apps/web/src/lib/process/{engine,gates,facts,permissions,errors,repository}.ts` | Gates fail closed; overrides partner-only and audited. |
| Handovers, queue, notifications, SLA | `handovers.ts`, `work-queue.ts`, `events.ts`, `notify.ts`, `sla.ts`, `/api/cron/process-sla`, `.github/workflows/process-sla.yml` | Push respects `push_ops`; Telegram for handovers / breaches / overrides; webhook env-gated (`PROCESS_EVENT_WEBHOOK_URL`, `PROCESS_EVENT_WEBHOOK_SECRET`). |
| API | `apps/web/app/api/process/**` (22 routes) | Standard envelope, `requireAuth`, ProcessError → HTTP status. |
| AI | `ai-tools.ts`, `/api/process/ai/tools` (`PROCESS_AI_TOKEN` for service callers), `/api/knowledge/ask` enrichment, `apps/api/src/agents/tools/process-tools.ts` | `explain_next_action` never invents — composed from definition + gates. |
| Tests | vitest (validator, gates, engine, events, routes, tools) + SQL suites `supabase/tests/process_os/` (smoke, negative, **golden A–E**, versioning) via `process-os-sql.yml` / `run-local.sh` | |
| UI | web `/processes/**`, journey on lead detail, stage panel in My Work; native `onehub/processes/*`, panel in `onehub/my-work/[id]`, strip on lead detail | See the M4/M5 commits. |

**Deployment checklist:** apply the migration (Supabase branch first); set
`PROCESS_AI_TOKEN` (and optionally the webhook env vars) in Vercel; seed the
definition; set role defaults (`/processes` → role defaults); add
`process-sla.yml` secrets are the existing `CRON_SECRET` / Telegram ones.
Open questions in §8 still stand; defaults chosen: advance gate =
finance-attached payment reference (`auto_from_odoo: false`), QC = factory
`qc_release` evidence, leads start a case manually from the lead screen.
