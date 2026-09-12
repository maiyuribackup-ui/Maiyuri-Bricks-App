# My Work — Implementation Plan (MVP: PRD Phases 1–3)

> PRD: [PRD_MY_WORK.md](PRD_MY_WORK.md) · Decided with owner: build in this repo,
> inside the existing OneHub shell; MVP covers Phases 1–3 (foundation, employee
> queue, checklist engine + photos). Supervisor Team Status, recurrence
> scheduler, and notifications land in follow-up PRs.

## Context

Employees currently navigate module → checklist → date → machine to find work.
My Work gives each employee a single queue at `/onehub/my-work`: open the
assigned activity, complete it, attach photo evidence, submit — one auditable
record per occurrence.

## Codebase facts this plan is grounded on

| PRD assumption | Reality here |
|---|---|
| OneHub exists | ✅ `apps/web/app/onehub/` (layout + theme.ts maroon/cream), APIs at `app/api/onehub/*` |
| Existing checklists | `onehub_checklist_templates/_runs` are JSONB new-joiner lists — too thin for per-item photos/corrective actions. Operational checklist engine is net-new (`work_checklist_*`). |
| Route `/onehub/my-work` | ✅ matches; OneHub NAV array in `app/onehub/layout.tsx` (add below "Start Here") |
| Auth | `requireAuth(request)` from `src/lib/api-helpers.ts` (cookie or Bearer → id/email/role) |
| RLS pattern | SECURITY DEFINER helper (`is_founder` in `20260122100000`) to avoid users-table recursion |
| Uploads | Server-side multipart → Supabase Storage (model: `api/smart-quotes/images`); new private `work-item-photos` bucket |
| Audit | Model on `ticket_history` (`20260119000002`) |
| Scheduler (later) | Vercel Cron + `CRON_SECRET` (model: `api/deliveries/cron`) |
| Query/UI conventions | TanStack hooks like `useProduction.ts`; `api-utils` envelope; OneHub `theme.ts` tokens; lucide-react |

## Database (one migration: `supabase/migrations/20260711000001_my_work.sql`)

New tables (all RLS-enabled, `updated_at` triggers, indexed):
- `work_checklist_templates` / `work_checklist_template_items` — operational
  checklists; per-item: `input_type(status|text|number)`, `mandatory`,
  `allow_na`, `requires_photo`, `requires_photo_on_fail`,
  `requires_corrective_action_on_fail`.
- `work_checklist_instances` / `work_checklist_responses` — dated instance per
  work item; one response row per item (`UNIQUE(instance_id, template_item_id)`),
  with `status(completed|not_completed|not_applicable)`, `text_value`,
  `number_value`, `note`, `fail_reason`, `corrective_action`.
- `work_items` — per PRD §16A. Statuses `pending|in_progress|submitted|
  completed|returned|cancelled` (overdue is derived). `activity_type(simple|
  checklist|inspection|report|approval)` — MVP implements simple + checklist.
  Relations: `related_project_id→projects`, `related_lead_id→leads`,
  `related_label` TEXT (machines/vehicles have no tables), `linked_sop_slug→
  onehub_sops.slug` (loose), `checklist_instance_id`. Recurrence-ready:
  `template_id`, `scheduled_date` + partial unique index
  `(template_id, assigned_user_id, scheduled_date)` for scheduler idempotency.
- `work_item_templates` — schema now (recurrence_rule TEXT, due_time TIME);
  scheduler cron is a later PR.
- `work_item_attachments` — metadata (`storage_path`, `checklist_response_id?`,
  caption); files in new private bucket `work-item-photos` at
  `{work_item_id}/{user_id}/{ts}-{filename}`.
- `work_item_events` — audit (event_type, old/new status, performed_by,
  comment, metadata JSONB).
- Helper `is_work_supervisor(uuid)` SECURITY DEFINER (founder/owner/
  production_supervisor) reused by all policies.
- RLS: employees SELECT/UPDATE own items (update only in
  pending/in_progress/returned); supervisors read all; writes otherwise via
  service-role routes with in-route role checks (defense in depth).
- Seeds: one "Production Opening Checklist" template (usable demo/test data).

## API routes (`apps/web/app/api/my-work/…`, all `requireAuth`)

- `GET /api/my-work` — the queue: overdue + today + limited upcoming +
  today-completed, plus summary counts. Assignee-scoped.
- `POST /api/my-work` — admin create (+ auto-creates checklist instance from
  template when type=checklist). Roles: founder/owner/production_supervisor.
- `GET /api/my-work/[id]` — detail: item + checklist (items merged with
  responses) + attachments (signed URLs) + sanitized history.
- `POST .../start` · `PUT .../draft` (note + partial responses upsert) ·
  `POST .../complete` (simple; validates requires_note/photo) ·
  `POST .../submit` (checklist; validates mandatory items, fail-reasons,
  fail-photos, corrective actions) · `POST .../cancel` (admin).
- `POST/DELETE .../attachments` — multipart upload (images, 10MB) + remove
  before submission; blocked once locked (submitted/completed/cancelled).
- `GET/POST /api/my-work/checklist-templates` — list + admin create-with-items.
- Every transition writes a `work_item_events` row via `src/lib/work-item-events.ts`.

## Frontend

- **Nav**: "My Work" in OneHub NAV directly below "Start Here"
  (`ClipboardCheck` icon), pathname-aware active state, badge = overdue+due-today.
- **`app/onehub/my-work/page.tsx`** — greeting ("Good Morning, {first name}"),
  4 summary cards, filter chips (All/Overdue/Today/Upcoming/Completed),
  sections: Attention Required / Today / Upcoming / Completed (collapsed).
  Sorting: overdue → returned → priority → due time → date. Skeletons + PRD
  empty states.
- **`app/onehub/my-work/[id]/page.tsx`** — detail: instructions, evidence
  requirements, notes with debounced autosave ("Last saved 9:12 AM"),
  photos (camera capture per `deliveries/PhotoUpload.tsx` pattern, immediate
  upload w/ progress), ChecklistRunner (per-item ✓/✗/NA + text/number + note +
  corrective action + photo, fail highlighting), action bar per type/status,
  history timeline, unsaved-changes guard.
- Components in `src/components/my-work/`; hooks in `src/hooks/useMyWork.ts`;
  pure logic in `src/lib/my-work-utils.ts` (isOverdue, sort, group, validate).
- Shared types/zod in `packages/shared` (`work.ts` → schemas + types).
- Styling: OneHub `theme.ts` tokens exclusively (maroon/cream), mobile-first,
  large tap targets.

## Tests

- `my-work-utils.test.ts` — overdue derivation, sort order, grouping,
  completion/submission validation matrix (PRD tests 4–9).
- Route tests (mock supabaseAdmin, follow `api/push/__tests__` pattern):
  non-assignee 403, locked-after-submit, mandatory-evidence rejection.
- `WorkItemCard.test.tsx` render states.

## Verification

`bun run typecheck && bunx eslint <new files> && bunx vitest run` in apps/web;
manual flow on preview: create item (admin) → appears in employee queue →
start → checklist → photo → submit → locked + audit trail visible.

## Explicit non-goals this PR (next phases)

Supervisor Team Status + return/reopen UI · recurrence scheduler cron ·
in-app/push notifications & escalations · native (Expo) screens — API is
Bearer-ready for `apps/native`; document as extension point.
