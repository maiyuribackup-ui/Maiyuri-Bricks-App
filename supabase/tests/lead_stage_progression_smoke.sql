-- Production smoke test for lead-stage progression automation.
-- All fixture changes are rolled back. This file must never COMMIT.

BEGIN;

DO $$
DECLARE
  smoke_user uuid;
  smoke_lead uuid := gen_random_uuid();
  first_work_item uuid;
  current_work_item uuid;
  open_count integer;
  audit_count integer;
BEGIN
  SELECT id
    INTO smoke_user
    FROM public.users
   WHERE is_active IS TRUE
   ORDER BY created_at
   LIMIT 1;

  IF smoke_user IS NULL THEN
    RAISE EXCEPTION 'Smoke test requires one active user';
  END IF;

  INSERT INTO public.leads (
    id, name, contact, source, lead_type, assigned_staff,
    pipeline_stage, lead_status
  ) VALUES (
    smoke_lead,
    '__lead_stage_progression_smoke__',
    '0000000000',
    'System smoke test',
    'Commercial',
    smoke_user,
    'new_inquiry',
    'new_contact_pending'
  );

  UPDATE public.leads
     SET pipeline_stage = 'quote_shared'
   WHERE id = smoke_lead;

  SELECT id
    INTO first_work_item
    FROM public.work_items
   WHERE related_lead_id = smoke_lead
     AND source_module = 'lead_stage_progression'
     AND status IN ('pending', 'in_progress', 'blocked');

  IF first_work_item IS NULL THEN
    RAISE EXCEPTION 'Stage transition did not create an open work item';
  END IF;

  UPDATE public.leads
     SET pipeline_stage = 'finalisation'
   WHERE id = smoke_lead;

  SELECT count(*)
    INTO open_count
    FROM public.work_items
   WHERE related_lead_id = smoke_lead
     AND source_module = 'lead_stage_progression'
     AND status IN ('pending', 'in_progress', 'blocked');

  SELECT id
    INTO current_work_item
    FROM public.work_items
   WHERE related_lead_id = smoke_lead
     AND source_module = 'lead_stage_progression'
     AND status IN ('pending', 'in_progress', 'blocked')
   LIMIT 1;

  IF open_count <> 1 OR current_work_item <> first_work_item THEN
    RAISE EXCEPTION 'One-open-task invariant failed: count %, first %, current %',
      open_count, first_work_item, current_work_item;
  END IF;

  SELECT count(*)
    INTO audit_count
    FROM public.work_item_events
   WHERE work_item_id = first_work_item
     AND event_type IN ('created', 'due_date_changed');

  IF audit_count < 2 THEN
    RAISE EXCEPTION 'Expected created + due_date_changed audit events, found %', audit_count;
  END IF;

  UPDATE public.leads
     SET pipeline_stage = 'order_won'
   WHERE id = smoke_lead;

  SELECT count(*)
    INTO open_count
    FROM public.work_items
   WHERE related_lead_id = smoke_lead
     AND source_module = 'lead_stage_progression'
     AND status IN ('pending', 'in_progress', 'blocked');

  IF open_count <> 0 THEN
    RAISE EXCEPTION 'Terminal stage did not close the generated work item';
  END IF;

  RAISE NOTICE 'PASS: production rollback-only lead-stage smoke test';
END;
$$;

ROLLBACK;
