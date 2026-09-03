-- ============================================================================
-- My Work module (OneHub) — operational work items, checklist engine,
-- photo evidence, audit trail, recurring-template foundation.
-- PRD: docs/PRD_MY_WORK.md · Plan: docs/MY_WORK_IMPLEMENTATION_PLAN.md
--
-- Writes go through service-role API routes with in-route role checks;
-- RLS below is defense in depth (employee sees own work, supervisors all).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Role helper (SECURITY DEFINER avoids users-table RLS recursion — see
-- 20260122100000_fix_users_rls_recursion.sql for the precedent)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_work_supervisor(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id
      AND role IN ('founder', 'owner', 'production_supervisor')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.is_work_supervisor(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_work_supervisor(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_work_supervisor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_work_supervisor(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- Operational checklist engine (richer than onehub_checklist_* JSONB lists:
-- per-item response types, photo evidence, corrective actions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.work_checklist_templates(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- status: Completed / Not Completed / N-A radios; text/number add an input
  input_type TEXT NOT NULL DEFAULT 'status'
    CHECK (input_type IN ('status', 'text', 'number')),
  mandatory BOOLEAN NOT NULL DEFAULT true,
  allow_na BOOLEAN NOT NULL DEFAULT true,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  requires_photo_on_fail BOOLEAN NOT NULL DEFAULT false,
  requires_corrective_action_on_fail BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_cl_items_template
  ON public.work_checklist_template_items(template_id, sort_order);

CREATE TABLE IF NOT EXISTS public.work_checklist_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.work_checklist_templates(id),
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_checklist_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.work_checklist_instances(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES public.work_checklist_template_items(id),
  status TEXT CHECK (status IN ('completed', 'not_completed', 'not_applicable')),
  text_value TEXT,
  number_value NUMERIC,
  note TEXT,
  fail_reason TEXT,          -- required when status = not_completed
  corrective_action TEXT,    -- required on fail when the item is configured so
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, template_item_id)
);
CREATE INDEX IF NOT EXISTS idx_work_cl_responses_instance
  ON public.work_checklist_responses(instance_id);

-- ----------------------------------------------------------------------------
-- Recurring work templates (schema now; the generating cron is a later phase)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_item_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'simple'
    CHECK (activity_type IN ('simple', 'checklist', 'inspection', 'report', 'approval')),
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  default_assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  default_role TEXT,
  checklist_template_id UUID REFERENCES public.work_checklist_templates(id) ON DELETE SET NULL,
  -- 'daily' | 'weekly:<1-7>' (ISO dow) | 'monthly:<1-28>'
  recurrence_rule TEXT,
  due_time TIME,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  requires_note BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  related_label TEXT,
  related_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  linked_sop_slug TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Work items — one row per assigned occurrence (never reused day to day)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  activity_type TEXT NOT NULL DEFAULT 'simple'
    CHECK (activity_type IN ('simple', 'checklist', 'inspection', 'report', 'approval')),
  -- Overdue is DERIVED (due_at < now AND status open) — never stored
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'submitted', 'completed', 'returned', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_user_id UUID NOT NULL REFERENCES public.users(id),
  assigned_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  available_from TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  return_reason TEXT,
  -- The employee's general note; doubles as the draft (saved any time pre-submit)
  note TEXT,
  source_module TEXT,
  source_record_id TEXT,
  related_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  related_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  -- Free-text relation for entities without tables (machine, vehicle, dept)
  related_label TEXT,
  checklist_instance_id UUID REFERENCES public.work_checklist_instances(id) ON DELETE SET NULL,
  linked_sop_slug TEXT,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  requires_note BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  -- Recurrence provenance + scheduler idempotency
  template_id UUID REFERENCES public.work_item_templates(id) ON DELETE SET NULL,
  scheduled_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_items_assignee_status
  ON public.work_items(assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_work_items_due_at ON public.work_items(due_at);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON public.work_items(status);
-- Scheduler idempotency: one occurrence per template+assignee+date
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_items_template_occurrence
  ON public.work_items(template_id, assigned_user_id, scheduled_date)
  WHERE template_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Photo/attachment metadata (files live in private bucket work-item-photos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  checklist_response_id UUID REFERENCES public.work_checklist_responses(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_attachments_item
  ON public.work_item_attachments(work_item_id);

-- ----------------------------------------------------------------------------
-- Audit trail (modeled on ticket_history)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'assigned', 'reassigned', 'opened', 'started', 'draft_saved',
    'submitted', 'completed', 'returned', 'reopened', 'cancelled',
    'photo_added', 'photo_removed', 'due_date_changed'
  )),
  old_status TEXT,
  new_status TEXT,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  comment TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_events_item
  ON public.work_item_events(work_item_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- updated_at triggers (reuses public.update_updated_at from create_leads)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_work_items_updated_at ON public.work_items;
CREATE TRIGGER trg_work_items_updated_at
  BEFORE UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_work_item_templates_updated_at ON public.work_item_templates;
CREATE TRIGGER trg_work_item_templates_updated_at
  BEFORE UPDATE ON public.work_item_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_work_cl_templates_updated_at ON public.work_checklist_templates;
CREATE TRIGGER trg_work_cl_templates_updated_at
  BEFORE UPDATE ON public.work_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_work_cl_responses_updated_at ON public.work_checklist_responses;
CREATE TRIGGER trg_work_cl_responses_updated_at
  BEFORE UPDATE ON public.work_checklist_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_checklist_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_checklist_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_item_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_item_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_item_events ENABLE ROW LEVEL SECURITY;

-- Checklist template definitions: readable by all signed-in staff
CREATE POLICY "auth read work cl templates" ON public.work_checklist_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read work cl template items" ON public.work_checklist_template_items
  FOR SELECT TO authenticated USING (true);

-- Work items: assignee or supervisor can read
CREATE POLICY "read own or supervised work items" ON public.work_items
  FOR SELECT TO authenticated
  USING (
    assigned_user_id = auth.uid()
    OR public.is_work_supervisor(auth.uid())
  );

-- Assignee may update ONLY while the item is actionable (pre-lock).
-- Config fields (assignee/due/priority) are protected in the API layer;
-- submitted/completed/cancelled rows are immutable to employees here.
CREATE POLICY "assignee updates open work items" ON public.work_items
  FOR UPDATE TO authenticated
  USING (
    assigned_user_id = auth.uid()
    AND status IN ('pending', 'in_progress', 'returned')
  );

-- Supervisors update any (return/reopen flows; service-role routes enforce rules)
CREATE POLICY "supervisor updates work items" ON public.work_items
  FOR UPDATE TO authenticated
  USING (public.is_work_supervisor(auth.uid()));

-- Instances/responses follow the owning work item
CREATE POLICY "read checklist instances via work item" ON public.work_checklist_instances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.checklist_instance_id = work_checklist_instances.id
        AND (wi.assigned_user_id = auth.uid() OR public.is_work_supervisor(auth.uid()))
    )
  );

CREATE POLICY "read checklist responses via work item" ON public.work_checklist_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.checklist_instance_id = work_checklist_responses.instance_id
        AND (wi.assigned_user_id = auth.uid() OR public.is_work_supervisor(auth.uid()))
    )
  );

CREATE POLICY "assignee writes checklist responses" ON public.work_checklist_responses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.checklist_instance_id = work_checklist_responses.instance_id
        AND wi.assigned_user_id = auth.uid()
        AND wi.status IN ('pending', 'in_progress', 'returned')
    )
  );

-- Attachments follow the owning work item; only assignee adds, pre-lock
CREATE POLICY "read attachments via work item" ON public.work_item_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.id = work_item_attachments.work_item_id
        AND (wi.assigned_user_id = auth.uid() OR public.is_work_supervisor(auth.uid()))
    )
  );

CREATE POLICY "assignee manages own attachments" ON public.work_item_attachments
  FOR ALL TO authenticated
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.id = work_item_attachments.work_item_id
        AND wi.assigned_user_id = auth.uid()
        AND wi.status IN ('pending', 'in_progress', 'returned')
    )
  );

-- Audit: visible with the work item; INSERT via service role only
CREATE POLICY "read events via work item" ON public.work_item_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.id = work_item_events.work_item_id
        AND (wi.assigned_user_id = auth.uid() OR public.is_work_supervisor(auth.uid()))
    )
  );

-- Recurring templates: supervisors only
CREATE POLICY "supervisor read work templates" ON public.work_item_templates
  FOR SELECT TO authenticated USING (public.is_work_supervisor(auth.uid()));

-- ----------------------------------------------------------------------------
-- Storage: private evidence bucket
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-item-photos', 'work-item-photos', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- No storage.objects policy for this bucket on purpose: RLS denies by
-- default, so clients cannot touch files directly. All reads go through
-- short-lived signed URLs and all writes through service-role API routes,
-- which enforce assignee/lock rules per work item.

-- ----------------------------------------------------------------------------
-- SEED: one operational checklist so the module is usable immediately
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  tpl_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.work_checklist_templates
    WHERE name = 'Production Opening Checklist'
  ) THEN
    INSERT INTO public.work_checklist_templates (name, description)
    VALUES (
      'Production Opening Checklist',
      'Run every production morning before the first batch.'
    )
    RETURNING id INTO tpl_id;

    INSERT INTO public.work_checklist_template_items
      (template_id, prompt, sort_order, input_type, requires_photo, requires_photo_on_fail)
    VALUES
      (tpl_id, 'Pan mixer cleaned and free of yesterday''s residue', 1, 'status', false, true),
      (tpl_id, 'Hydraulic oil level checked', 2, 'status', false, true),
      (tpl_id, 'Moulds inspected for damage', 3, 'status', false, true),
      (tpl_id, 'Red soil stock sufficient for today''s plan', 4, 'status', false, false),
      (tpl_id, 'Curing area water level (record %)', 5, 'number', false, false),
      (tpl_id, 'Safety guards in place on all machines', 6, 'status', true, false);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.work_items IS
  'My Work: one auditable operational activity per user per occurrence';
COMMENT ON TABLE public.work_item_events IS
  'My Work audit trail (modeled on ticket_history)';
COMMENT ON TABLE public.work_checklist_templates IS
  'Operational checklist definitions (richer than onehub_checklist_templates)';
