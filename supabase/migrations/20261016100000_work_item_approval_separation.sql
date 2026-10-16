-- My Work: record who approved a submission and forbid self-approval.
--
-- 1. work_item_events.event_type CHECK never listed 'approved', so every
--    approval audit row written by POST /api/my-work/[id]/approve failed the
--    constraint and was silently dropped by the best-effort logger.
-- 2. A supervisor could approve their own submission (no maker-checker).
--    approved_by/approved_at now record the approver, and a CHECK makes
--    "approver is the assignee" impossible for every writer, not just the
--    route. Submissions are assignee-only, so assignee = maker.
--
-- Additive: existing rows have approved_by NULL and satisfy the CHECK.

BEGIN;

ALTER TABLE public.work_item_events
  DROP CONSTRAINT IF EXISTS work_item_events_event_type_check;
ALTER TABLE public.work_item_events
  ADD CONSTRAINT work_item_events_event_type_check CHECK (event_type IN (
    'created', 'assigned', 'reassigned', 'opened', 'started', 'draft_saved',
    'submitted', 'completed', 'returned', 'reopened', 'cancelled',
    'photo_added', 'photo_removed', 'due_date_changed',
    'approved'
  ));

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.work_items
  DROP CONSTRAINT IF EXISTS work_items_approver_not_assignee;
ALTER TABLE public.work_items
  ADD CONSTRAINT work_items_approver_not_assignee
  CHECK (approved_by IS NULL OR approved_by <> assigned_user_id);

COMMENT ON COLUMN public.work_items.approved_by IS
  'Supervisor who approved the submission; never the assignee (maker-checker)';

COMMIT;

-- ROLLBACK (manual):
-- ALTER TABLE public.work_items DROP CONSTRAINT work_items_approver_not_assignee;
-- ALTER TABLE public.work_items DROP COLUMN approved_at, DROP COLUMN approved_by;
-- ALTER TABLE public.work_item_events DROP CONSTRAINT work_item_events_event_type_check;
-- ALTER TABLE public.work_item_events ADD CONSTRAINT work_item_events_event_type_check
--   CHECK (event_type IN ('created','assigned','reassigned','opened','started','draft_saved',
--   'submitted','completed','returned','reopened','cancelled','photo_added','photo_removed',
--   'due_date_changed'));
