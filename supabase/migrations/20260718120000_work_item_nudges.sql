-- Accountability nudges for My Work (SR2/SR3):
-- track when an open item was last nagged and whether it was escalated to
-- management, so the cron can re-notify on a schedule without spamming.
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- The nag cron scans open, due items every run.
CREATE INDEX IF NOT EXISTS idx_work_items_open_due
  ON public.work_items (due_at)
  WHERE status IN ('pending', 'in_progress', 'returned');
