-- Harden lead-stage My Work automation against stale task mutations.
--
-- The original implementation refreshed an open work_items row in place. A
-- worker request authorized against the old stage/assignee could then race the
-- refresh and complete that same UUID after it represented a new stage. My Work
-- occurrences are immutable generations: supersede the old row and create a
-- fresh UUID while retaining the one-open-item invariant.

BEGIN;

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
  v_old_return_reason TEXT;
  v_new_item_id UUID;
BEGIN
  IF NEW.pipeline_stage IS NOT DISTINCT FROM OLD.pipeline_stage
     AND NEW.assigned_staff IS NOT DISTINCT FROM OLD.assigned_staff THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text, 0));

  -- Terminal/unassigned transitions close every open generated occurrence.
  IF NEW.pipeline_stage IN ('order_won', 'closed_lost')
     OR NEW.assigned_staff IS NULL THEN
    FOR v_item_id, v_old_status, v_old_return_reason IN
      SELECT id, status, return_reason
      FROM public.work_items
      WHERE related_lead_id = NEW.id
        AND source_module = 'lead_stage_progression'
        AND status IN ('pending', 'in_progress', 'returned')
      FOR UPDATE
    LOOP
      UPDATE public.work_items
      SET status = 'cancelled',
          cancelled_at = clock_timestamp(),
          return_reason = COALESCE(
            v_old_return_reason,
            CASE
              WHEN NEW.assigned_staff IS NULL
                THEN 'Cancelled automatically: lead has no assignee'
              ELSE 'Cancelled automatically: lead reached terminal stage'
            END
          ),
          updated_at = clock_timestamp()
      WHERE id = v_item_id;

      INSERT INTO public.work_item_events (
        work_item_id, event_type, old_status, new_status, performed_by,
        comment, metadata
      ) VALUES (
        v_item_id, 'cancelled', v_old_status, 'cancelled', NULL,
        'Lead stage progression automation cancelled this item',
        jsonb_build_object(
          'automation', 'lead_stage_progression',
          'pipeline_stage', NEW.pipeline_stage,
          'unassigned', NEW.assigned_staff IS NULL,
          'prior_return_reason', v_old_return_reason
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

  -- Supersede the prior occurrence before inserting the new generation. This
  -- makes stale status-guarded writes to the old UUID fail instead of mutating
  -- the new stage/owner task.
  SELECT id, status, return_reason
  INTO v_item_id, v_old_status, v_old_return_reason
  FROM public.work_items
  WHERE related_lead_id = NEW.id
    AND source_module = 'lead_stage_progression'
    AND status IN ('pending', 'in_progress', 'returned')
  LIMIT 1
  FOR UPDATE;

  IF v_item_id IS NOT NULL THEN
    UPDATE public.work_items
    SET status = 'cancelled',
        cancelled_at = clock_timestamp(),
        return_reason = COALESCE(
          v_old_return_reason,
          'Cancelled automatically: superseded by lead progression'
        ),
        updated_at = clock_timestamp()
    WHERE id = v_item_id;

    INSERT INTO public.work_item_events (
      work_item_id, event_type, old_status, new_status, performed_by,
      comment, metadata
    ) VALUES (
      v_item_id, 'cancelled', v_old_status, 'cancelled', NULL,
      'Superseded by a new lead stage or owner task generation',
      jsonb_build_object(
        'automation', 'lead_stage_progression',
        'old_pipeline_stage', OLD.pipeline_stage,
        'pipeline_stage', NEW.pipeline_stage,
        'old_assignee', OLD.assigned_staff,
        'assignee', NEW.assigned_staff,
        'prior_return_reason', v_old_return_reason
      )
    );
  END IF;

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
  RETURNING id INTO v_new_item_id;

  INSERT INTO public.work_item_events (
    work_item_id, event_type, old_status, new_status, performed_by,
    comment, metadata
  ) VALUES (
    v_new_item_id, 'created', NULL, 'pending', NULL,
    'Created automatically from lead stage progression',
    jsonb_build_object(
      'automation', 'lead_stage_progression',
      'pipeline_stage', NEW.pipeline_stage,
      'follow_up_date', v_due_date,
      'supersedes_work_item_id', v_item_id
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lead_stage_progression_work_item() FROM PUBLIC;

COMMENT ON FUNCTION public.sync_lead_stage_progression_work_item() IS
  'Creates immutable My Work task generations for lead stage/owner changes and cancels the superseded occurrence.';

COMMIT;
