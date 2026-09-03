-- Lead stage progression -> one accountable My Work item.
--
-- Why this lives in PostgreSQL rather than the web UI:
-- stage changes can arrive from web, mobile, call-processing, or future
-- integrations. The database is the only path common to every writer.
--
-- Contract:
--   * a real active-stage/assignee transition refreshes lead next-action/date;
--   * exactly one open lead_stage_progression work item exists per lead;
--   * advancing stages refreshes that item instead of accumulating tasks;
--   * order_won / closed_lost (or unassignment) cancels the open item;
--   * explicit non-stale next-action/date supplied with a transition win;
--   * no assignee is guessed for unassigned leads.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_items_open_lead_stage_progression
  ON public.work_items (related_lead_id, source_module)
  WHERE source_module = 'lead_stage_progression'
    AND status IN ('pending', 'in_progress', 'returned');

CREATE OR REPLACE FUNCTION public.lead_stage_default_action(p_stage TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE p_stage
    WHEN 'new_inquiry' THEN 'Qualify requirement and make first contact'
    WHEN 'qualified_lead' THEN 'Prepare and share the quotation'
    WHEN 'quote_shared' THEN 'Confirm quotation receipt and resolve objections'
    WHEN 'factory_visit_proof' THEN 'Arrange factory visit / product proof'
    WHEN 'decision_pending' THEN 'Get customer decision and capture the blocker'
    WHEN 'finalisation' THEN 'Confirm quantity, delivery plan and advance'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.lead_stage_default_days(p_stage TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE p_stage
    WHEN 'new_inquiry' THEN 0
    WHEN 'qualified_lead' THEN 1
    WHEN 'quote_shared' THEN 1
    WHEN 'factory_visit_proof' THEN 2
    WHEN 'decision_pending' THEN 2
    WHEN 'finalisation' THEN 1
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.lead_stage_default_priority(p_stage TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE p_stage
    WHEN 'new_inquiry' THEN 'urgent'
    WHEN 'finalisation' THEN 'urgent'
    WHEN 'qualified_lead' THEN 'high'
    WHEN 'quote_shared' THEN 'high'
    WHEN 'factory_visit_proof' THEN 'high'
    WHEN 'decision_pending' THEN 'high'
    ELSE 'medium'
  END;
$$;

-- BEFORE UPDATE keeps the lead card and generated work item on the same action
-- and due date. It does not fire for ordinary edits.
CREATE OR REPLACE FUNCTION public.prepare_lead_stage_progression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today DATE := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_default_action TEXT;
  v_default_days INTEGER;
BEGIN
  IF NEW.pipeline_stage IS NOT DISTINCT FROM OLD.pipeline_stage
     AND NEW.assigned_staff IS NOT DISTINCT FROM OLD.assigned_staff THEN
    RETURN NEW;
  END IF;

  -- Terminal stages never carry stale follow-up commitments.
  IF NEW.pipeline_stage IN ('order_won', 'closed_lost') THEN
    IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
      NEW.next_action := NULL;
      NEW.follow_up_date := NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_default_action := public.lead_stage_default_action(NEW.pipeline_stage);
  v_default_days := public.lead_stage_default_days(NEW.pipeline_stage);

  IF v_default_action IS NULL OR v_default_days IS NULL THEN
    RETURN NEW;
  END IF;

  -- A stage move supersedes an unchanged action/date. A pure reassignment must
  -- preserve valid customer-specific commitments and only repair blank/stale
  -- values.
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    IF NEW.next_action IS NOT DISTINCT FROM OLD.next_action
       OR NULLIF(btrim(NEW.next_action), '') IS NULL THEN
      NEW.next_action := v_default_action;
    END IF;

    IF NEW.follow_up_date IS NOT DISTINCT FROM OLD.follow_up_date
       OR NEW.follow_up_date IS NULL
       OR NEW.follow_up_date < v_today THEN
      NEW.follow_up_date := v_today + v_default_days;
    END IF;
  ELSE
    IF NULLIF(btrim(NEW.next_action), '') IS NULL THEN
      NEW.next_action := v_default_action;
    END IF;

    IF NEW.follow_up_date IS NULL OR NEW.follow_up_date < v_today THEN
      NEW.follow_up_date := v_today + v_default_days;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- AFTER UPDATE owns the My Work lifecycle. An advisory transaction lock closes
-- the select/insert race for two concurrent updates of the same lead.
CREATE OR REPLACE FUNCTION public.sync_lead_stage_progression_work_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today DATE := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_default_days INTEGER;
  v_due_date DATE;
  v_due_at TIMESTAMPTZ;
  v_action TEXT;
  v_priority TEXT;
  v_item_id UUID;
  v_old_status TEXT;
BEGIN
  IF NEW.pipeline_stage IS NOT DISTINCT FROM OLD.pipeline_stage
     AND NEW.assigned_staff IS NOT DISTINCT FROM OLD.assigned_staff THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text, 0));

  -- Closed leads and unassigned leads cannot have an actionable owned item.
  IF NEW.pipeline_stage IN ('order_won', 'closed_lost')
     OR NEW.assigned_staff IS NULL THEN
    FOR v_item_id IN
      UPDATE public.work_items
      SET status = 'cancelled',
          cancelled_at = clock_timestamp(),
          return_reason = CASE
            WHEN NEW.assigned_staff IS NULL
              THEN 'Cancelled automatically: lead has no assignee'
            ELSE 'Cancelled automatically: lead reached terminal stage'
          END,
          updated_at = clock_timestamp()
      WHERE related_lead_id = NEW.id
        AND source_module = 'lead_stage_progression'
        AND status IN ('pending', 'in_progress', 'returned')
      RETURNING id
    LOOP
      INSERT INTO public.work_item_events (
        work_item_id, event_type, old_status, new_status, performed_by,
        comment, metadata
      ) VALUES (
        v_item_id, 'cancelled', NULL, 'cancelled', NULL,
        'Lead stage progression automation cancelled this item',
        jsonb_build_object(
          'automation', 'lead_stage_progression',
          'pipeline_stage', NEW.pipeline_stage,
          'unassigned', NEW.assigned_staff IS NULL
        )
      );
    END LOOP;
    RETURN NEW;
  END IF;

  v_default_days := public.lead_stage_default_days(NEW.pipeline_stage);
  v_action := COALESCE(
    NULLIF(btrim(NEW.next_action), ''),
    public.lead_stage_default_action(NEW.pipeline_stage)
  );

  -- Unknown/non-actionable stages fail closed instead of inventing work.
  IF v_default_days IS NULL OR v_action IS NULL THEN
    RETURN NEW;
  END IF;

  v_due_date := CASE
    WHEN NEW.follow_up_date IS NULL OR NEW.follow_up_date < v_today
      THEN v_today + v_default_days
    ELSE NEW.follow_up_date
  END;
  v_due_at := (v_due_date + TIME '17:30:00') AT TIME ZONE 'Asia/Kolkata';
  v_priority := public.lead_stage_default_priority(NEW.pipeline_stage);

  SELECT id, status
  INTO v_item_id, v_old_status
  FROM public.work_items
  WHERE related_lead_id = NEW.id
    AND source_module = 'lead_stage_progression'
    AND status IN ('pending', 'in_progress', 'returned')
  LIMIT 1
  FOR UPDATE;

  IF v_item_id IS NULL THEN
    INSERT INTO public.work_items (
      title,
      description,
      instructions,
      activity_type,
      status,
      priority,
      assigned_user_id,
      assigned_by_user_id,
      due_at,
      related_lead_id,
      related_label,
      source_module,
      source_record_id
    ) VALUES (
      v_action,
      'Automatic next action for ' || NEW.name || ' after stage moved to '
        || replace(NEW.pipeline_stage, '_', ' '),
      'Complete the action, record the customer outcome, and update the lead stage or follow-up date.',
      'simple',
      'pending',
      v_priority,
      NEW.assigned_staff,
      NULL,
      v_due_at,
      NEW.id,
      NEW.name,
      'lead_stage_progression',
      NEW.pipeline_stage
    )
    RETURNING id INTO v_item_id;

    INSERT INTO public.work_item_events (
      work_item_id, event_type, old_status, new_status, performed_by,
      comment, metadata
    ) VALUES (
      v_item_id, 'created', NULL, 'pending', NULL,
      'Created automatically from lead stage progression',
      jsonb_build_object(
        'automation', 'lead_stage_progression',
        'pipeline_stage', NEW.pipeline_stage,
        'follow_up_date', v_due_date
      )
    );
  ELSE
    UPDATE public.work_items
    SET title = v_action,
        description = 'Automatic next action for ' || NEW.name
          || ' after stage moved to ' || replace(NEW.pipeline_stage, '_', ' '),
        instructions = 'Complete the action, record the customer outcome, and update the lead stage or follow-up date.',
        status = 'pending',
        priority = v_priority,
        assigned_user_id = NEW.assigned_staff,
        due_at = v_due_at,
        started_at = NULL,
        returned_at = NULL,
        return_reason = NULL,
        cancelled_at = NULL,
        source_record_id = NEW.pipeline_stage,
        related_label = NEW.name,
        last_nudged_at = NULL,
        nudge_count = 0,
        escalated_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = v_item_id;

    INSERT INTO public.work_item_events (
      work_item_id, event_type, old_status, new_status, performed_by,
      comment, metadata
    ) VALUES (
      v_item_id, 'due_date_changed', v_old_status, 'pending', NULL,
      'Refreshed automatically from lead stage or owner progression',
      jsonb_build_object(
        'automation', 'lead_stage_progression',
        'old_pipeline_stage', OLD.pipeline_stage,
        'pipeline_stage', NEW.pipeline_stage,
        'old_assignee', OLD.assigned_staff,
        'assignee', NEW.assigned_staff,
        'follow_up_date', v_due_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_lead_stage_progression ON public.leads;
CREATE TRIGGER trg_prepare_lead_stage_progression
  BEFORE UPDATE OF pipeline_stage, assigned_staff ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_lead_stage_progression();

DROP TRIGGER IF EXISTS trg_sync_lead_stage_progression_work_item ON public.leads;
CREATE TRIGGER trg_sync_lead_stage_progression_work_item
  AFTER UPDATE OF pipeline_stage, assigned_staff ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_stage_progression_work_item();

REVOKE ALL ON FUNCTION public.prepare_lead_stage_progression() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_lead_stage_progression_work_item() FROM PUBLIC;

COMMENT ON FUNCTION public.prepare_lead_stage_progression() IS
  'Refreshes lead next_action/follow_up_date when stage or owner genuinely changes.';
COMMENT ON FUNCTION public.sync_lead_stage_progression_work_item() IS
  'Maintains one open My Work task per assigned active lead as stage or owner changes.';
COMMENT ON INDEX public.uq_work_items_open_lead_stage_progression IS
  'Prevents duplicate open stage-progression tasks for the same lead.';

COMMIT;
