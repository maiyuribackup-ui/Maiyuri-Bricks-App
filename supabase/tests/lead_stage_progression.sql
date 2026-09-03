\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS public;
SET TIME ZONE 'Asia/Kolkata';

CREATE TABLE public.users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  assigned_staff UUID REFERENCES public.users(id),
  pipeline_stage TEXT NOT NULL,
  next_action TEXT,
  follow_up_date DATE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  activity_type TEXT NOT NULL DEFAULT 'simple',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_user_id UUID NOT NULL REFERENCES public.users(id),
  assigned_by_user_id UUID REFERENCES public.users(id),
  due_at TIMESTAMPTZ,
  available_from TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  return_reason TEXT,
  note TEXT,
  source_module TEXT,
  source_record_id TEXT,
  related_lead_id UUID REFERENCES public.leads(id),
  related_label TEXT,
  last_nudged_at TIMESTAMPTZ,
  nudge_count INTEGER NOT NULL DEFAULT 0,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES public.work_items(id),
  event_type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  performed_by UUID REFERENCES public.users(id),
  comment TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

\ir ../migrations/20260903120000_lead_stage_progression_tasks.sql

INSERT INTO public.users (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Sales One'),
  ('00000000-0000-0000-0000-000000000002', 'Sales Two');

INSERT INTO public.leads (
  id, name, assigned_staff, pipeline_stage, next_action, follow_up_date
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Stage Automation Test',
  '00000000-0000-0000-0000-000000000001',
  'new_inquiry',
  'Old action',
  CURRENT_DATE - 60
);

-- 1. Stage progression must replace stale action/date and create one owned task.
UPDATE public.leads
SET pipeline_stage = 'qualified_lead'
WHERE id = '10000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  l public.leads%ROWTYPE;
  w public.work_items%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.leads
  WHERE id = '10000000-0000-0000-0000-000000000001';
  IF l.next_action <> 'Prepare and share the quotation' THEN
    RAISE EXCEPTION 'qualified action not set: %', l.next_action;
  END IF;
  IF l.follow_up_date <> CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'qualified due date not refreshed: %', l.follow_up_date;
  END IF;

  SELECT * INTO w FROM public.work_items
  WHERE related_lead_id = l.id AND source_module = 'lead_stage_progression';
  IF NOT FOUND THEN RAISE EXCEPTION 'progression task missing'; END IF;
  IF w.assigned_user_id <> l.assigned_staff THEN
    RAISE EXCEPTION 'task owner mismatch';
  END IF;
  IF w.source_record_id <> 'qualified_lead' OR w.status <> 'pending' THEN
    RAISE EXCEPTION 'wrong task stage/status: %/%', w.source_record_id, w.status;
  END IF;
  IF (w.due_at AT TIME ZONE 'Asia/Kolkata')::date <> l.follow_up_date THEN
    RAISE EXCEPTION 'task and lead due dates differ';
  END IF;
END $$;

-- 2. A subsequent progression refreshes the same task and respects explicit inputs.
CREATE TEMP TABLE first_task AS
SELECT id FROM public.work_items
WHERE related_lead_id = '10000000-0000-0000-0000-000000000001'
  AND source_module = 'lead_stage_progression';

UPDATE public.leads
SET pipeline_stage = 'quote_shared',
    next_action = 'Call after engineer review',
    follow_up_date = CURRENT_DATE + 5
WHERE id = '10000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  l public.leads%ROWTYPE;
  w public.work_items%ROWTYPE;
  original_id UUID;
BEGIN
  SELECT id INTO original_id FROM first_task;
  SELECT * INTO l FROM public.leads
  WHERE id = '10000000-0000-0000-0000-000000000001';
  SELECT * INTO w FROM public.work_items
  WHERE related_lead_id = l.id AND source_module = 'lead_stage_progression'
    AND status IN ('pending', 'in_progress', 'returned');

  IF w.id <> original_id THEN RAISE EXCEPTION 'task was duplicated, not refreshed'; END IF;
  IF l.next_action <> 'Call after engineer review' OR l.follow_up_date <> CURRENT_DATE + 5 THEN
    RAISE EXCEPTION 'explicit action/date were overwritten';
  END IF;
  IF w.title <> 'Call after engineer review' OR w.source_record_id <> 'quote_shared' THEN
    RAISE EXCEPTION 'task not refreshed from explicit action';
  END IF;
END $$;

-- 3. Non-stage edits must not duplicate or reschedule the progression task.
CREATE TEMP TABLE before_non_stage AS
SELECT id, due_at, updated_at FROM public.work_items
WHERE related_lead_id = '10000000-0000-0000-0000-000000000001'
  AND source_module = 'lead_stage_progression';

UPDATE public.leads SET notes = 'Unrelated edit'
WHERE id = '10000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.work_items
      WHERE related_lead_id = '10000000-0000-0000-0000-000000000001'
        AND source_module = 'lead_stage_progression') <> 1 THEN
    RAISE EXCEPTION 'non-stage edit created a duplicate';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.work_items w, before_non_stage b
    WHERE w.id = b.id AND w.due_at IS DISTINCT FROM b.due_at
  ) THEN RAISE EXCEPTION 'non-stage edit changed due date'; END IF;
END $$;

-- 4. Reassignment follows the lead owner without making another task.
UPDATE public.leads
SET assigned_staff = '00000000-0000-0000-0000-000000000002'
WHERE id = '10000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  l public.leads%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.leads
  WHERE id = '10000000-0000-0000-0000-000000000001';
  IF (SELECT assigned_user_id FROM public.work_items
      WHERE related_lead_id = l.id
        AND source_module = 'lead_stage_progression'
        AND status IN ('pending', 'in_progress', 'returned'))
      <> '00000000-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'task did not follow reassignment';
  END IF;
  IF l.next_action <> 'Call after engineer review'
     OR l.follow_up_date <> CURRENT_DATE + 5 THEN
    RAISE EXCEPTION 'reassignment overwrote valid action/date';
  END IF;
END $$;

-- 5. Terminal stages clear stale follow-up fields and cancel the open task.
UPDATE public.leads
SET pipeline_stage = 'order_won'
WHERE id = '10000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = '10000000-0000-0000-0000-000000000001'
      AND (next_action IS NOT NULL OR follow_up_date IS NOT NULL)
  ) THEN RAISE EXCEPTION 'terminal lead retained follow-up data'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_items
    WHERE related_lead_id = '10000000-0000-0000-0000-000000000001'
      AND source_module = 'lead_stage_progression'
      AND status = 'cancelled' AND cancelled_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'terminal stage did not cancel task'; END IF;
END $$;

-- 6. Reopening creates a new open task while preserving cancelled history.
UPDATE public.leads
SET pipeline_stage = 'decision_pending'
WHERE id = '10000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.work_items
      WHERE related_lead_id = '10000000-0000-0000-0000-000000000001'
        AND source_module = 'lead_stage_progression'
        AND status IN ('pending', 'in_progress', 'returned')) <> 1 THEN
    RAISE EXCEPTION 'reopened lead lacks exactly one open task';
  END IF;
  IF (SELECT count(*) FROM public.work_items
      WHERE related_lead_id = '10000000-0000-0000-0000-000000000001'
        AND source_module = 'lead_stage_progression') <> 2 THEN
    RAISE EXCEPTION 'cancelled task history was not preserved';
  END IF;
END $$;

-- 7. Unassigned leads get safe lead defaults but no guessed task owner.
INSERT INTO public.leads (
  id, name, assigned_staff, pipeline_stage, next_action, follow_up_date
) VALUES (
  '10000000-0000-0000-0000-000000000002',
  'Unassigned Test', NULL, 'new_inquiry', NULL, NULL
);
UPDATE public.leads SET pipeline_stage = 'factory_visit_proof'
WHERE id = '10000000-0000-0000-0000-000000000002';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = '10000000-0000-0000-0000-000000000002'
      AND next_action = 'Arrange factory visit / product proof'
      AND follow_up_date = CURRENT_DATE + 2
  ) THEN RAISE EXCEPTION 'unassigned lead defaults missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.work_items
    WHERE related_lead_id = '10000000-0000-0000-0000-000000000002'
      AND source_module = 'lead_stage_progression'
  ) THEN RAISE EXCEPTION 'task owner was guessed for unassigned lead'; END IF;
END $$;

-- 8. Database invariant: a second open progression task is rejected.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.work_items (
      title, status, assigned_user_id, related_lead_id, source_module
    ) VALUES (
      'Duplicate', 'pending',
      '00000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'lead_stage_progression'
    );
    RAISE EXCEPTION 'duplicate open progression task was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

SELECT 'lead stage progression automation: PASS' AS result;
