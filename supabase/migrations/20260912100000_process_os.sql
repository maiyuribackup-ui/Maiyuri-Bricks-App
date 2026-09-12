-- Process OS — versioned, executable process definitions + live cases.
--
-- PRD:  docs/PRD_PROCESS_OS.md
-- Plan: docs/PROCESS_OS_IMPLEMENTATION_PLAN.md
--
-- Why the state machine lives in PostgreSQL functions rather than TypeScript:
-- a stage transition touches the instance, two stage instances, their tasks,
-- the mirrored My Work item, a handover and the audit stream. The Supabase
-- client has no multi-statement transaction, so the only way "a gate failure
-- leaves the case in a valid state" (PRD §13) can be guaranteed is to do the
-- whole transition inside one function. Gates that need Odoo / ops-control
-- facts are evaluated in TypeScript first and handed in as p_gate_results;
-- the function re-checks every gate the database can see by itself so a
-- stale or malicious client cannot skip them.
--
-- Everything here is ADDITIVE. The only touches on existing objects are:
--   * work_items.activity_type CHECK gains 'process';
--   * sync_lead_stage_progression_work_item() gains one early return so a
--     lead owned by a live process instance does not get a second task.
-- A commented ROLLBACK block sits at the end of the file.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =============================================================================
-- 1. Definition side (immutable per version once ACTIVE)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.process_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('SALES', 'FACTORY', 'DELIVERY', 'FINANCE', 'PROJECTS', 'SAFETY')),
  description TEXT,
  entity_type TEXT NOT NULL DEFAULT 'generic' CHECK (entity_type IN
    ('lead', 'sales_order', 'delivery', 'project', 'generic')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  active_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.process_definitions IS
  'Logical identity of a business process (e.g. LEAD_TO_DELIVERY). Versions carry the content.';

CREATE TABLE IF NOT EXISTS public.process_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_definition_id UUID NOT NULL REFERENCES public.process_definitions(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  -- The authored JSON as imported; the normalised rows below are derived from it.
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (process_definition_id, version)
);
COMMENT ON TABLE public.process_versions IS
  'One immutable revision of a process. Running cases stay on the version they started with (PRD §20).';

ALTER TABLE public.process_definitions
  DROP CONSTRAINT IF EXISTS process_definitions_active_version_fk;
ALTER TABLE public.process_definitions
  ADD CONSTRAINT process_definitions_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.process_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.process_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_version_id UUID NOT NULL REFERENCES public.process_versions(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  stage_type TEXT NOT NULL DEFAULT 'ACTION' CHECK (stage_type IN
    ('ACTION', 'DECISION', 'HANDOVER', 'WAIT', 'AUTOMATION', 'END')),
  sequence INTEGER NOT NULL,
  owner_role TEXT NOT NULL CHECK (owner_role IN
    ('SALES_ENGINEER', 'FACTORY_MANAGER', 'FINANCE', 'MANAGING_PARTNER')),
  sla_minutes INTEGER CHECK (sla_minutes IS NULL OR sla_minutes > 0),
  is_start BOOLEAN NOT NULL DEFAULT false,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (process_version_id, stage_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_stages_one_start
  ON public.process_stages (process_version_id) WHERE is_start;
CREATE INDEX IF NOT EXISTS idx_process_stages_version_seq
  ON public.process_stages (process_version_id, sequence);

CREATE TABLE IF NOT EXISTS public.process_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_version_id UUID NOT NULL REFERENCES public.process_versions(id) ON DELETE CASCADE,
  from_stage_id UUID NOT NULL REFERENCES public.process_stages(id) ON DELETE CASCADE,
  to_stage_id UUID NOT NULL REFERENCES public.process_stages(id) ON DELETE CASCADE,
  transition_key TEXT NOT NULL,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 10,
  is_exception BOOLEAN NOT NULL DEFAULT false,
  label TEXT,
  UNIQUE (from_stage_id, transition_key)
);
CREATE INDEX IF NOT EXISTS idx_process_transitions_from
  ON public.process_transitions (from_stage_id, priority);

CREATE TABLE IF NOT EXISTS public.process_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.process_stages(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  sequence INTEGER NOT NULL,
  evidence_required BOOLEAN NOT NULL DEFAULT false,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (stage_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.process_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.process_stages(id) ON DELETE CASCADE,
  gate_key TEXT NOT NULL,
  gate_type TEXT NOT NULL CHECK (gate_type IN (
    'checklist_complete', 'entity_field', 'odoo_quote_linked', 'advance_verified',
    'handover_accepted', 'stock_feasible', 'manual_confirmation',
    'linked_record_status', 'decision_outcome')),
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_message TEXT,
  overridable BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (stage_id, gate_key)
);

CREATE TABLE IF NOT EXISTS public.process_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.process_stages(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'SEND_NOTIFICATION', 'CREATE_TASK', 'ASSIGN_USER', 'CREATE_HANDOVER',
    'UPDATE_STATUS', 'CALL_WEBHOOK')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true
);

-- Who is "the Factory Manager" today. Admin-set; instances resolve their
-- assignee from this when no explicit user is given.
CREATE TABLE IF NOT EXISTS public.process_role_defaults (
  role_key TEXT PRIMARY KEY CHECK (role_key IN
    ('SALES_ENGINEER', 'FACTORY_MANAGER', 'FINANCE', 'MANAGING_PARTNER')),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Runtime side (one live case)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.process_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_definition_id UUID NOT NULL REFERENCES public.process_definitions(id),
  process_version_id UUID NOT NULL REFERENCES public.process_versions(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN
    ('lead', 'sales_order', 'delivery', 'project', 'generic')),
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN
    ('active', 'blocked', 'completed', 'cancelled')),
  current_stage_id UUID REFERENCES public.process_stages(id),
  current_stage_instance_id UUID,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_existing_case BOOLEAN NOT NULL DEFAULT false,
  import_source TEXT,
  imported_at TIMESTAMPTZ,
  lock_version INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One live case per (process, entity).
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_instances_live_entity
  ON public.process_instances (process_definition_id, entity_type, entity_id)
  WHERE status IN ('active', 'blocked');
CREATE INDEX IF NOT EXISTS idx_process_instances_entity
  ON public.process_instances (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_status
  ON public.process_instances (status, current_stage_id);

CREATE TABLE IF NOT EXISTS public.process_stage_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  process_stage_id UUID NOT NULL REFERENCES public.process_stages(id),
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN
    ('upcoming', 'current', 'completed', 'blocked', 'failed', 'skipped', 'cancelled')),
  assigned_role TEXT NOT NULL,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  work_item_id UUID REFERENCES public.work_items(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  sla_warned_at TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  blocked_reason JSONB,
  linked_record JSONB,
  outcome TEXT,
  outcome_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_stage_instances_instance
  ON public.process_stage_instances (process_instance_id, started_at);
CREATE INDEX IF NOT EXISTS idx_process_stage_instances_open
  ON public.process_stage_instances (assigned_user_id, status)
  WHERE status IN ('current', 'blocked');
CREATE INDEX IF NOT EXISTS idx_process_stage_instances_due
  ON public.process_stage_instances (due_at)
  WHERE status IN ('current', 'blocked') AND due_at IS NOT NULL;

ALTER TABLE public.process_instances
  DROP CONSTRAINT IF EXISTS process_instances_current_stage_instance_fk;
ALTER TABLE public.process_instances
  ADD CONSTRAINT process_instances_current_stage_instance_fk
  FOREIGN KEY (current_stage_instance_id)
  REFERENCES public.process_stage_instances(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.process_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id UUID NOT NULL REFERENCES public.process_stage_instances(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.process_checklist_items(id) ON DELETE SET NULL,
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'na')),
  required BOOLEAN NOT NULL DEFAULT true,
  evidence_required BOOLEAN NOT NULL DEFAULT false,
  sequence INTEGER NOT NULL DEFAULT 0,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_instance_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.process_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  stage_instance_id UUID REFERENCES public.process_stage_instances(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.process_tasks(id) ON DELETE SET NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'quotation', 'payment_reference', 'photo', 'drawing', 'customer_confirmation',
    'lab_report', 'delivery_ack', 'qc_release', 'note', 'link')),
  source_type TEXT NOT NULL CHECK (source_type IN
    ('storage', 'odoo', 'url', 'work_item_attachment', 'text')),
  source_id TEXT,
  path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  added_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_evidence_instance
  ON public.process_evidence (process_instance_id, added_at);
CREATE INDEX IF NOT EXISTS idx_process_evidence_stage
  ON public.process_evidence (stage_instance_id, evidence_type);

CREATE TABLE IF NOT EXISTS public.process_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  stage_instance_id UUID NOT NULL REFERENCES public.process_stage_instances(id) ON DELETE CASCADE,
  from_role TEXT NOT NULL,
  from_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  to_role TEXT NOT NULL,
  to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN
    ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason_code TEXT CHECK (rejection_reason_code IS NULL OR rejection_reason_code IN (
    'INSUFFICIENT_STOCK', 'INSUFFICIENT_CURING_STOCK', 'CAPACITY', 'RAW_MATERIAL',
    'DATE_INFEASIBLE', 'INCOMPLETE_PACKAGE', 'OTHER')),
  rejection_comment TEXT,
  proposed_date DATE,
  acted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_handovers_one_pending
  ON public.process_handovers (stage_instance_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_process_handovers_to
  ON public.process_handovers (to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_process_handovers_to_role
  ON public.process_handovers (to_role, status);

-- Immutable audit stream (PRD §28). Insert-only: no UPDATE/DELETE policy exists
-- and the service role is the only writer.
CREATE TABLE IF NOT EXISTS public.process_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  stage_instance_id UUID REFERENCES public.process_stage_instances(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'ai')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_events_instance
  ON public.process_events (process_instance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_process_events_type
  ON public.process_events (event_type, created_at DESC);

-- =============================================================================
-- 3. Touches on existing objects (additive)
-- =============================================================================

ALTER TABLE public.work_items DROP CONSTRAINT IF EXISTS work_items_activity_type_check;
ALTER TABLE public.work_items ADD CONSTRAINT work_items_activity_type_check
  CHECK (activity_type IN ('simple', 'checklist', 'inspection', 'report', 'approval', 'process'));

-- =============================================================================
-- 4. updated_at triggers + RLS
-- =============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'process_definitions', 'process_versions', 'process_stages', 'process_transitions',
    'process_checklist_items', 'process_gates', 'process_automations',
    'process_role_defaults', 'process_instances', 'process_stage_instances',
    'process_tasks', 'process_evidence', 'process_handovers', 'process_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'process_definitions', 'process_versions', 'process_instances',
    'process_stage_instances', 'process_tasks', 'process_handovers'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- =============================================================================
-- 5. Role helpers
-- =============================================================================

-- Process roles → app roles (mirrors PROCESS_ROLE_MAP in permissions.ts).
CREATE OR REPLACE FUNCTION public.process_role_app_roles(p_role_key TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT CASE p_role_key
    WHEN 'SALES_ENGINEER'   THEN ARRAY['sales', 'engineer']
    WHEN 'FACTORY_MANAGER'  THEN ARRAY['production_supervisor']
    WHEN 'FINANCE'          THEN ARRAY['accountant']
    WHEN 'MANAGING_PARTNER' THEN ARRAY['founder', 'owner']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

-- founder/owner satisfy every process role.
CREATE OR REPLACE FUNCTION public.process_user_has_role(p_user UUID, p_role_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user
      AND (u.role = ANY (public.process_role_app_roles(p_role_key))
           OR u.role IN ('founder', 'owner'))
  );
$$;
REVOKE ALL ON FUNCTION public.process_user_has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_user_has_role(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_is_partner(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = p_user AND role IN ('founder', 'owner'));
$$;
REVOKE ALL ON FUNCTION public.process_is_partner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_is_partner(UUID) TO authenticated, service_role;

-- =============================================================================
-- 6. Internal helpers (service role only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_log_event(
  p_instance_id UUID,
  p_stage_instance_id UUID,
  p_event_type TEXT,
  p_actor UUID,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_reason TEXT DEFAULT NULL,
  p_before JSONB DEFAULT NULL,
  p_after JSONB DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'user'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.process_events (
    process_instance_id, stage_instance_id, event_type, actor_type, actor_id,
    before_value, after_value, reason, payload
  ) VALUES (
    p_instance_id, p_stage_instance_id, p_event_type,
    CASE WHEN p_actor IS NULL AND p_actor_type = 'user' THEN 'system' ELSE p_actor_type END,
    p_actor, p_before, p_after, p_reason, COALESCE(p_payload, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.process_log_event(UUID, UUID, TEXT, UUID, JSONB, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC;

-- Explicit assignee → role default → NULL (visible in the role queue).
CREATE OR REPLACE FUNCTION public.process_resolve_assignee(p_role_key TEXT, p_explicit UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(
    p_explicit,
    (SELECT user_id FROM public.process_role_defaults WHERE role_key = p_role_key)
  );
$$;
REVOKE ALL ON FUNCTION public.process_resolve_assignee(TEXT, UUID) FROM PUBLIC;

-- Title shown in My Work: "Factory Handover — Kumar (SO1042)".
CREATE OR REPLACE FUNCTION public.process_case_label(p_context JSONB, p_entity_type TEXT, p_entity_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_name TEXT := NULLIF(btrim(COALESCE(p_context->>'customer_name', '')), '');
  v_ref  TEXT := NULLIF(btrim(COALESCE(p_context->>'odoo_order_name', '')), '');
BEGIN
  IF v_name IS NULL AND p_entity_type = 'lead' THEN
    SELECT name INTO v_name FROM public.leads WHERE id::text = p_entity_id;
  END IF;
  IF v_name IS NULL THEN v_name := p_entity_type || ' ' || left(p_entity_id, 8); END IF;
  RETURN CASE WHEN v_ref IS NULL THEN v_name ELSE v_name || ' (' || v_ref || ')' END;
END $$;
REVOKE ALL ON FUNCTION public.process_case_label(JSONB, TEXT, TEXT) FROM PUBLIC;

-- Mirror one open stage instance into exactly one work_items row.
CREATE OR REPLACE FUNCTION public.process_mirror_work_item(p_stage_instance_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_si  public.process_stage_instances%ROWTYPE;
  v_st  public.process_stages%ROWTYPE;
  v_in  public.process_instances%ROWTYPE;
  v_def public.process_definitions%ROWTYPE;
  v_label TEXT;
  v_lead UUID;
  v_item UUID;
BEGIN
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = p_stage_instance_id;
  IF v_si.assigned_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_st  FROM public.process_stages WHERE id = v_si.process_stage_id;
  SELECT * INTO v_in  FROM public.process_instances WHERE id = v_si.process_instance_id;
  SELECT * INTO v_def FROM public.process_definitions WHERE id = v_in.process_definition_id;
  v_label := public.process_case_label(v_in.context, v_in.entity_type, v_in.entity_id);
  IF v_in.entity_type = 'lead' THEN
    BEGIN v_lead := v_in.entity_id::uuid; EXCEPTION WHEN others THEN v_lead := NULL; END;
  END IF;

  IF v_si.work_item_id IS NOT NULL THEN
    UPDATE public.work_items
    SET assigned_user_id = v_si.assigned_user_id,
        status = 'pending',
        due_at = v_si.due_at,
        cancelled_at = NULL,
        completed_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = v_si.work_item_id
    RETURNING id INTO v_item;
    IF v_item IS NOT NULL THEN RETURN v_item; END IF;
  END IF;

  INSERT INTO public.work_items (
    title, description, instructions, activity_type, status, priority,
    assigned_user_id, due_at, related_lead_id, related_label,
    source_module, source_record_id, linked_sop_slug
  ) VALUES (
    v_st.name || ' — ' || v_label,
    v_def.name || ' · stage ' || v_st.sequence || ' of the process',
    COALESCE(v_st.description, 'Open the stage, complete the checklist and move the case forward.'),
    'process',
    'pending',
    CASE WHEN v_st.sla_minutes IS NOT NULL AND v_st.sla_minutes <= 60 THEN 'urgent'
         WHEN v_st.sla_minutes IS NOT NULL AND v_st.sla_minutes <= 1440 THEN 'high'
         ELSE 'medium' END,
    v_si.assigned_user_id,
    v_si.due_at,
    v_lead,
    v_label,
    'process_os',
    v_si.id::text,
    v_st.configuration->>'sop_slug'
  ) RETURNING id INTO v_item;

  INSERT INTO public.work_item_events (work_item_id, event_type, old_status, new_status, performed_by, comment, metadata)
  VALUES (v_item, 'created', NULL, 'pending', NULL, 'Created by Process OS',
          jsonb_build_object('automation', 'process_os', 'stage_instance_id', v_si.id,
                             'process_instance_id', v_in.id, 'stage_key', v_st.stage_key));

  UPDATE public.process_stage_instances SET work_item_id = v_item WHERE id = p_stage_instance_id;
  RETURN v_item;
END $$;
REVOKE ALL ON FUNCTION public.process_mirror_work_item(UUID) FROM PUBLIC;

-- Close the mirrored work item together with its stage instance.
CREATE OR REPLACE FUNCTION public.process_close_work_item(p_stage_instance_id UUID, p_final TEXT, p_actor UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_item UUID; v_old TEXT;
BEGIN
  SELECT work_item_id INTO v_item FROM public.process_stage_instances WHERE id = p_stage_instance_id;
  IF v_item IS NULL THEN RETURN; END IF;
  SELECT status INTO v_old FROM public.work_items WHERE id = v_item;
  IF v_old IS NULL OR v_old IN ('completed', 'cancelled') THEN RETURN; END IF;

  UPDATE public.work_items
  SET status = p_final,
      completed_at = CASE WHEN p_final = 'completed' THEN clock_timestamp() ELSE completed_at END,
      cancelled_at = CASE WHEN p_final = 'cancelled' THEN clock_timestamp() ELSE cancelled_at END,
      return_reason = CASE WHEN p_final = 'cancelled' THEN p_reason ELSE return_reason END,
      updated_at = clock_timestamp()
  WHERE id = v_item;

  INSERT INTO public.work_item_events (work_item_id, event_type, old_status, new_status, performed_by, comment, metadata)
  VALUES (v_item, p_final, v_old, p_final, p_actor, COALESCE(p_reason, 'Closed by Process OS'),
          jsonb_build_object('automation', 'process_os', 'stage_instance_id', p_stage_instance_id));
END $$;
REVOKE ALL ON FUNCTION public.process_close_work_item(UUID, TEXT, UUID, TEXT) FROM PUBLIC;

-- Open a stage for an instance: stage instance + tasks + mirrored work item.
-- END stages complete immediately and complete the instance.
CREATE OR REPLACE FUNCTION public.process_open_stage(
  p_instance_id UUID, p_stage_id UUID, p_actor UUID, p_assignee UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_st public.process_stages%ROWTYPE;
  v_si_id UUID;
  v_assignee UUID;
  v_due TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_st FROM public.process_stages WHERE id = p_stage_id;
  IF v_st.id IS NULL THEN RAISE EXCEPTION 'STAGE_NOT_FOUND: %', p_stage_id; END IF;

  v_assignee := public.process_resolve_assignee(v_st.owner_role, p_assignee);
  v_due := CASE WHEN v_st.sla_minutes IS NULL THEN NULL
                ELSE clock_timestamp() + make_interval(mins => v_st.sla_minutes) END;

  INSERT INTO public.process_stage_instances (
    process_instance_id, process_stage_id, status, assigned_role, assigned_user_id, due_at
  ) VALUES (
    p_instance_id, p_stage_id,
    CASE WHEN v_st.stage_type = 'END' THEN 'completed' ELSE 'current' END,
    v_st.owner_role, v_assignee, v_due
  ) RETURNING id INTO v_si_id;

  INSERT INTO public.process_tasks (
    stage_instance_id, checklist_item_id, item_key, title, description, required,
    evidence_required, sequence, assigned_user_id
  )
  SELECT v_si_id, ci.id, ci.item_key, ci.title, ci.description, ci.required,
         ci.evidence_required, ci.sequence, v_assignee
  FROM public.process_checklist_items ci
  WHERE ci.stage_id = p_stage_id
  ORDER BY ci.sequence;

  UPDATE public.process_instances
  SET current_stage_id = p_stage_id,
      current_stage_instance_id = v_si_id,
      status = CASE WHEN v_st.stage_type = 'END' THEN 'completed' ELSE 'active' END,
      completed_at = CASE WHEN v_st.stage_type = 'END' THEN clock_timestamp() ELSE completed_at END,
      lock_version = lock_version + 1
  WHERE id = p_instance_id;

  PERFORM public.process_log_event(p_instance_id, v_si_id, 'process.stage_started', p_actor,
    jsonb_build_object('stage_key', v_st.stage_key, 'stage_name', v_st.name,
                       'owner_role', v_st.owner_role, 'assigned_user_id', v_assignee,
                       'due_at', v_due));

  IF v_st.stage_type = 'END' THEN
    UPDATE public.process_stage_instances
    SET completed_at = clock_timestamp(), completed_by = p_actor WHERE id = v_si_id;
    PERFORM public.process_log_event(p_instance_id, v_si_id, 'process.completed', p_actor,
      jsonb_build_object('stage_key', v_st.stage_key));
  ELSE
    PERFORM public.process_mirror_work_item(v_si_id);
  END IF;

  RETURN v_si_id;
END $$;
REVOKE ALL ON FUNCTION public.process_open_stage(UUID, UUID, UUID, UUID) FROM PUBLIC;

-- Close the current stage instance with a final status.
CREATE OR REPLACE FUNCTION public.process_close_stage(
  p_stage_instance_id UUID, p_status TEXT, p_actor UUID, p_reason TEXT,
  p_outcome TEXT DEFAULT NULL, p_outcome_reason TEXT DEFAULT NULL, p_linked JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.process_stage_instances
  SET status = p_status,
      completed_at = clock_timestamp(),
      completed_by = p_actor,
      outcome = COALESCE(p_outcome, outcome),
      outcome_reason = COALESCE(p_outcome_reason, outcome_reason),
      linked_record = COALESCE(p_linked, linked_record)
  WHERE id = p_stage_instance_id;
  PERFORM public.process_close_work_item(
    p_stage_instance_id,
    CASE WHEN p_status = 'completed' THEN 'completed' ELSE 'cancelled' END,
    p_actor, p_reason);
END $$;
REVOKE ALL ON FUNCTION public.process_close_stage(UUID, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

-- =============================================================================
-- 7. Public engine functions (called by the web service layer via service role)
--    Failures raise 'CODE: message' so the TypeScript layer can map them.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_start(
  p_process_key TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_actor UUID,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_start_stage_key TEXT DEFAULT NULL,
  p_imported BOOLEAN DEFAULT false,
  p_import_source TEXT DEFAULT NULL,
  p_assignee UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_def public.process_definitions%ROWTYPE;
  v_ver public.process_versions%ROWTYPE;
  v_stage_id UUID;
  v_instance_id UUID;
  v_si_id UUID;
BEGIN
  SELECT * INTO v_def FROM public.process_definitions WHERE process_key = p_process_key AND status = 'active';
  IF v_def.id IS NULL THEN RAISE EXCEPTION 'PROCESS_NOT_FOUND: %', p_process_key; END IF;
  IF v_def.active_version_id IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_VERSION: %', p_process_key; END IF;
  SELECT * INTO v_ver FROM public.process_versions WHERE id = v_def.active_version_id;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_process_key || ':' || p_entity_type || ':' || p_entity_id, 0));
  IF EXISTS (SELECT 1 FROM public.process_instances
             WHERE process_definition_id = v_def.id AND entity_type = p_entity_type
               AND entity_id = p_entity_id AND status IN ('active', 'blocked')) THEN
    RAISE EXCEPTION 'INSTANCE_EXISTS: a live case already exists for this %', p_entity_type;
  END IF;

  IF p_start_stage_key IS NULL THEN
    SELECT id INTO v_stage_id FROM public.process_stages
    WHERE process_version_id = v_ver.id AND is_start;
  ELSE
    IF NOT p_imported THEN
      RAISE EXCEPTION 'START_STAGE_REQUIRES_IMPORT: only imported cases may start mid-process';
    END IF;
    SELECT id INTO v_stage_id FROM public.process_stages
    WHERE process_version_id = v_ver.id AND stage_key = p_start_stage_key;
  END IF;
  IF v_stage_id IS NULL THEN RAISE EXCEPTION 'START_STAGE_NOT_FOUND: %', COALESCE(p_start_stage_key, '(is_start)'); END IF;

  INSERT INTO public.process_instances (
    process_definition_id, process_version_id, entity_type, entity_id, status,
    context, imported_existing_case, import_source, imported_at, created_by
  ) VALUES (
    v_def.id, v_ver.id, p_entity_type, p_entity_id, 'active',
    COALESCE(p_context, '{}'::jsonb), p_imported, p_import_source,
    CASE WHEN p_imported THEN clock_timestamp() END, p_actor
  ) RETURNING id INTO v_instance_id;

  PERFORM public.process_log_event(v_instance_id, NULL, 'process.started', p_actor,
    jsonb_build_object('process_key', p_process_key, 'version', v_ver.version,
                       'entity_type', p_entity_type, 'entity_id', p_entity_id,
                       'imported', p_imported, 'start_stage_key', p_start_stage_key));

  v_si_id := public.process_open_stage(v_instance_id, v_stage_id, p_actor, p_assignee);

  RETURN (SELECT to_jsonb(i) FROM public.process_instances i WHERE i.id = v_instance_id);
END $$;
REVOKE ALL ON FUNCTION public.process_start(TEXT, TEXT, TEXT, UUID, JSONB, TEXT, BOOLEAN, TEXT, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_complete_task(
  p_task_id UUID, p_actor UUID, p_status TEXT DEFAULT 'done', p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_task public.process_tasks%ROWTYPE;
  v_si public.process_stage_instances%ROWTYPE;
  v_in public.process_instances%ROWTYPE;
BEGIN
  IF p_status NOT IN ('done', 'na', 'open') THEN RAISE EXCEPTION 'INVALID_TASK_STATUS: %', p_status; END IF;
  SELECT * INTO v_task FROM public.process_tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND: %', p_task_id; END IF;
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = v_task.stage_instance_id;
  SELECT * INTO v_in FROM public.process_instances WHERE id = v_si.process_instance_id;
  IF v_in.status NOT IN ('active', 'blocked') OR v_si.status NOT IN ('current', 'blocked') THEN
    RAISE EXCEPTION 'STAGE_NOT_OPEN: this stage is no longer active';
  END IF;
  IF NOT (v_si.assigned_user_id = p_actor OR public.process_user_has_role(p_actor, v_si.assigned_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the % may work this stage', v_si.assigned_role;
  END IF;
  IF v_task.evidence_required AND p_status = 'done'
     AND NOT EXISTS (SELECT 1 FROM public.process_evidence WHERE task_id = p_task_id) THEN
    RAISE EXCEPTION 'EVIDENCE_REQUIRED: attach evidence before completing "%"', v_task.title;
  END IF;

  UPDATE public.process_tasks
  SET status = p_status,
      note = COALESCE(p_note, note),
      completed_at = CASE WHEN p_status = 'open' THEN NULL ELSE clock_timestamp() END,
      completed_by = CASE WHEN p_status = 'open' THEN NULL ELSE p_actor END
  WHERE id = p_task_id;

  -- A user who works an unassigned role-queue stage claims it.
  IF v_si.assigned_user_id IS NULL THEN
    UPDATE public.process_stage_instances SET assigned_user_id = p_actor WHERE id = v_si.id;
    PERFORM public.process_mirror_work_item(v_si.id);
  END IF;

  PERFORM public.process_log_event(v_in.id, v_si.id, 'process.task_completed', p_actor,
    jsonb_build_object('task_id', p_task_id, 'item_key', v_task.item_key, 'title', v_task.title,
                       'status', p_status), p_note,
    jsonb_build_object('status', v_task.status), jsonb_build_object('status', p_status));

  RETURN (SELECT to_jsonb(t) FROM public.process_tasks t WHERE t.id = p_task_id);
END $$;
REVOKE ALL ON FUNCTION public.process_complete_task(UUID, UUID, TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_add_evidence(
  p_instance_id UUID, p_stage_instance_id UUID, p_task_id UUID, p_actor UUID,
  p_evidence_type TEXT, p_source_type TEXT, p_source_id TEXT, p_path TEXT, p_metadata JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id UUID; v_in public.process_instances%ROWTYPE;
BEGIN
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.status NOT IN ('active', 'blocked') THEN RAISE EXCEPTION 'INSTANCE_NOT_ACTIVE: case is %', v_in.status; END IF;
  INSERT INTO public.process_evidence (
    process_instance_id, stage_instance_id, task_id, evidence_type, source_type, source_id, path, metadata, added_by
  ) VALUES (
    p_instance_id, p_stage_instance_id, p_task_id, p_evidence_type, p_source_type, p_source_id, p_path,
    COALESCE(p_metadata, '{}'::jsonb), p_actor
  ) RETURNING id INTO v_id;
  PERFORM public.process_log_event(p_instance_id, p_stage_instance_id, 'process.evidence_added', p_actor,
    jsonb_build_object('evidence_id', v_id, 'evidence_type', p_evidence_type, 'source_type', p_source_type,
                       'task_id', p_task_id));
  RETURN (SELECT to_jsonb(e) FROM public.process_evidence e WHERE e.id = v_id);
END $$;
REVOKE ALL ON FUNCTION public.process_add_evidence(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

-- Does the database-visible part of one gate pass?  NULL = not decidable here.
CREATE OR REPLACE FUNCTION public.process_db_gate_ok(
  p_gate public.process_gates, p_stage_instance_id UUID, p_outcome TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_role TEXT; v_etype TEXT;
BEGIN
  CASE p_gate.gate_type
    WHEN 'checklist_complete' THEN
      RETURN NOT EXISTS (SELECT 1 FROM public.process_tasks
                         WHERE stage_instance_id = p_stage_instance_id AND required AND status = 'open');
    WHEN 'handover_accepted' THEN
      RETURN EXISTS (SELECT 1 FROM public.process_handovers
                     WHERE stage_instance_id = p_stage_instance_id AND status = 'ACCEPTED');
    WHEN 'decision_outcome' THEN
      RETURN p_outcome IS NOT NULL AND (
        p_gate.condition->'in' IS NULL
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_gate.condition->'in') o WHERE o = p_outcome));
    WHEN 'manual_confirmation' THEN
      v_role := p_gate.condition->>'role';
      v_etype := COALESCE(p_gate.condition->>'evidence_type', 'note');
      RETURN EXISTS (
        SELECT 1 FROM public.process_evidence e
        WHERE e.stage_instance_id = p_stage_instance_id
          AND e.evidence_type = v_etype
          AND (v_role IS NULL OR public.process_user_has_role(e.added_by, v_role)));
    ELSE
      RETURN NULL;
  END CASE;
END $$;
REVOKE ALL ON FUNCTION public.process_db_gate_ok(public.process_gates, UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_advance(
  p_instance_id UUID,
  p_expected_stage_instance_id UUID,
  p_actor UUID,
  p_transition_key TEXT DEFAULT NULL,
  p_gate_results JSONB DEFAULT '{}'::jsonb,
  p_outcome TEXT DEFAULT NULL,
  p_outcome_reason TEXT DEFAULT NULL,
  p_handover JSONB DEFAULT NULL,
  p_linked_record JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_in public.process_instances%ROWTYPE;
  v_si public.process_stage_instances%ROWTYPE;
  v_st public.process_stages%ROWTYPE;
  v_next public.process_stages%ROWTYPE;
  v_tr public.process_transitions%ROWTYPE;
  v_gate public.process_gates%ROWTYPE;
  v_ok BOOLEAN;
  v_overridden BOOLEAN;
  v_candidates INTEGER;
  v_next_assignee UUID;
  v_next_si UUID;
  v_handover_id UUID;
  v_required_outcomes JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::text, 0));
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.status NOT IN ('active', 'blocked') THEN RAISE EXCEPTION 'INSTANCE_NOT_ACTIVE: case is %', v_in.status; END IF;
  IF v_in.current_stage_instance_id IS DISTINCT FROM p_expected_stage_instance_id THEN
    RAISE EXCEPTION 'STALE_STAGE: the case has moved on since you loaded it';
  END IF;

  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = p_expected_stage_instance_id;
  SELECT * INTO v_st FROM public.process_stages WHERE id = v_si.process_stage_id;

  IF NOT (v_si.assigned_user_id = p_actor OR public.process_user_has_role(p_actor, v_st.owner_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the % may complete "%"', v_st.owner_role, v_st.name;
  END IF;

  IF EXISTS (SELECT 1 FROM public.process_tasks
             WHERE stage_instance_id = v_si.id AND required AND status = 'open') THEN
    RAISE EXCEPTION 'TASKS_INCOMPLETE: finish the required checklist first';
  END IF;

  -- DECISION stages need an outcome, and some outcomes need a reason.
  IF v_st.stage_type = 'DECISION' THEN
    IF p_outcome IS NULL THEN RAISE EXCEPTION 'OUTCOME_REQUIRED: choose an outcome for "%"', v_st.name; END IF;
    IF v_st.configuration->'outcomes' IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(v_st.configuration->'outcomes') o WHERE o = p_outcome) THEN
      RAISE EXCEPTION 'OUTCOME_INVALID: % is not an outcome of "%"', p_outcome, v_st.name;
    END IF;
    v_required_outcomes := v_st.configuration->'outcomes_requiring_reason';
    IF v_required_outcomes IS NOT NULL
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_required_outcomes) o WHERE o = p_outcome)
       AND NULLIF(btrim(COALESCE(p_outcome_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'OUTCOME_REASON_REQUIRED: % needs a reason', p_outcome;
    END IF;
  END IF;

  -- Pick the transition.
  IF p_transition_key IS NOT NULL THEN
    SELECT * INTO v_tr FROM public.process_transitions
    WHERE from_stage_id = v_st.id AND transition_key = p_transition_key;
    IF v_tr.id IS NULL THEN RAISE EXCEPTION 'TRANSITION_NOT_FOUND: % from %', p_transition_key, v_st.stage_key; END IF;
  ELSIF v_st.stage_type = 'DECISION' THEN
    SELECT * INTO v_tr FROM public.process_transitions
    WHERE from_stage_id = v_st.id AND condition->>'outcome' = p_outcome
    ORDER BY priority LIMIT 1;
    IF v_tr.id IS NULL THEN RAISE EXCEPTION 'TRANSITION_NOT_FOUND: no path for outcome %', p_outcome; END IF;
  ELSE
    SELECT count(*) INTO v_candidates FROM public.process_transitions
    WHERE from_stage_id = v_st.id AND NOT is_exception;
    IF v_candidates = 0 THEN RAISE EXCEPTION 'TRANSITION_NOT_FOUND: "%" has no next stage', v_st.name; END IF;
    IF v_candidates > 1 THEN RAISE EXCEPTION 'TRANSITION_AMBIGUOUS: choose where "%" goes next', v_st.name; END IF;
    SELECT * INTO v_tr FROM public.process_transitions WHERE from_stage_id = v_st.id AND NOT is_exception;
  END IF;

  -- Exit gates: every gate of the stage applies (exception edges skip them —
  -- an exception is by definition "the gate did not pass").
  IF NOT v_tr.is_exception THEN
    FOR v_gate IN SELECT * FROM public.process_gates WHERE stage_id = v_st.id ORDER BY gate_key LOOP
      v_overridden := EXISTS (
        SELECT 1 FROM public.process_events
        WHERE stage_instance_id = v_si.id AND event_type = 'process.gate_overridden'
          AND payload->>'gate_key' = v_gate.gate_key);
      IF v_overridden THEN CONTINUE; END IF;

      v_ok := public.process_db_gate_ok(v_gate, v_si.id, p_outcome);
      IF v_ok IS NULL THEN
        v_ok := COALESCE(p_gate_results->>v_gate.gate_key, 'unknown') = 'ok';
      END IF;
      IF NOT v_ok THEN
        RAISE EXCEPTION 'GATE_FAILED:%: %', v_gate.gate_key,
          COALESCE(v_gate.failure_message, 'Condition "' || v_gate.gate_key || '" is not met');
      END IF;
    END LOOP;
  END IF;

  SELECT * INTO v_next FROM public.process_stages WHERE id = v_tr.to_stage_id;

  -- Entering a HANDOVER stage needs the package the receiver will judge.
  IF v_next.stage_type = 'HANDOVER' THEN
    IF p_handover IS NULL OR p_handover->'payload' IS NULL THEN
      RAISE EXCEPTION 'HANDOVER_PAYLOAD_REQUIRED: fill the handover package for "%"', v_next.name;
    END IF;
  END IF;

  PERFORM public.process_close_stage(v_si.id, 'completed', p_actor, 'Stage completed',
                                     p_outcome, p_outcome_reason, p_linked_record);
  PERFORM public.process_log_event(p_instance_id, v_si.id, 'process.stage_completed', p_actor,
    jsonb_build_object('stage_key', v_st.stage_key, 'transition_key', v_tr.transition_key,
                       'to_stage_key', v_next.stage_key, 'outcome', p_outcome,
                       'is_exception', v_tr.is_exception),
    p_outcome_reason);

  -- Same owner role keeps the same person; a handover names its receiver.
  v_next_assignee := CASE
    WHEN p_handover IS NOT NULL AND (p_handover->>'to_user_id') IS NOT NULL THEN (p_handover->>'to_user_id')::uuid
    WHEN v_next.owner_role = v_st.owner_role THEN v_si.assigned_user_id
    ELSE NULL END;

  v_next_si := public.process_open_stage(p_instance_id, v_next.id, p_actor, v_next_assignee);

  IF v_next.stage_type = 'HANDOVER' THEN
    SELECT assigned_user_id INTO v_next_assignee FROM public.process_stage_instances WHERE id = v_next_si;
    INSERT INTO public.process_handovers (
      process_instance_id, stage_instance_id, from_role, from_user_id, to_role, to_user_id, payload
    ) VALUES (
      p_instance_id, v_next_si, v_st.owner_role, p_actor, v_next.owner_role, v_next_assignee,
      p_handover->'payload'
    ) RETURNING id INTO v_handover_id;
    PERFORM public.process_log_event(p_instance_id, v_next_si, 'process.handover_requested', p_actor,
      jsonb_build_object('handover_id', v_handover_id, 'from_role', v_st.owner_role,
                         'to_role', v_next.owner_role, 'to_user_id', v_next_assignee));
  END IF;

  RETURN jsonb_build_object(
    'instance', (SELECT to_jsonb(i) FROM public.process_instances i WHERE i.id = p_instance_id),
    'closed_stage_instance_id', v_si.id,
    'next_stage_instance_id', v_next_si,
    'handover_id', v_handover_id);
END $$;
REVOKE ALL ON FUNCTION public.process_advance(UUID, UUID, UUID, TEXT, JSONB, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_block(
  p_instance_id UUID, p_expected_stage_instance_id UUID, p_actor UUID, p_reason JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_in public.process_instances%ROWTYPE; v_si public.process_stage_instances%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::text, 0));
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.status <> 'active' THEN RAISE EXCEPTION 'INSTANCE_NOT_ACTIVE: case is %', v_in.status; END IF;
  IF v_in.current_stage_instance_id IS DISTINCT FROM p_expected_stage_instance_id THEN
    RAISE EXCEPTION 'STALE_STAGE: the case has moved on since you loaded it';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason->>'code', '')), '') IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: every exception needs a structured reason';
  END IF;
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = p_expected_stage_instance_id;
  IF NOT (v_si.assigned_user_id = p_actor OR public.process_user_has_role(p_actor, v_si.assigned_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the % may raise an exception here', v_si.assigned_role;
  END IF;

  UPDATE public.process_stage_instances SET status = 'blocked', blocked_reason = p_reason WHERE id = v_si.id;
  UPDATE public.process_instances SET status = 'blocked', lock_version = lock_version + 1 WHERE id = p_instance_id;
  PERFORM public.process_log_event(p_instance_id, v_si.id, 'process.blocked', p_actor, p_reason,
    p_reason->>'message');
  RETURN (SELECT to_jsonb(i) FROM public.process_instances i WHERE i.id = p_instance_id);
END $$;
REVOKE ALL ON FUNCTION public.process_block(UUID, UUID, UUID, JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_unblock(
  p_instance_id UUID, p_expected_stage_instance_id UUID, p_actor UUID, p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_in public.process_instances%ROWTYPE; v_si public.process_stage_instances%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::text, 0));
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.status <> 'blocked' THEN RAISE EXCEPTION 'INSTANCE_NOT_BLOCKED: case is %', v_in.status; END IF;
  IF v_in.current_stage_instance_id IS DISTINCT FROM p_expected_stage_instance_id THEN
    RAISE EXCEPTION 'STALE_STAGE: the case has moved on since you loaded it';
  END IF;
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = p_expected_stage_instance_id;
  IF NOT (v_si.assigned_user_id = p_actor OR public.process_user_has_role(p_actor, v_si.assigned_role)
          OR public.process_is_partner(p_actor)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the % may clear this exception', v_si.assigned_role;
  END IF;
  UPDATE public.process_stage_instances SET status = 'current' WHERE id = v_si.id;
  UPDATE public.process_instances SET status = 'active', lock_version = lock_version + 1 WHERE id = p_instance_id;
  PERFORM public.process_log_event(p_instance_id, v_si.id, 'process.unblocked', p_actor,
    jsonb_build_object('previous_reason', v_si.blocked_reason), p_note);
  RETURN (SELECT to_jsonb(i) FROM public.process_instances i WHERE i.id = p_instance_id);
END $$;
REVOKE ALL ON FUNCTION public.process_unblock(UUID, UUID, UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_cancel(p_instance_id UUID, p_actor UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_in public.process_instances%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::text, 0));
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.status NOT IN ('active', 'blocked') THEN RAISE EXCEPTION 'INSTANCE_NOT_ACTIVE: case is %', v_in.status; END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED: cancellation needs a reason'; END IF;
  IF NOT (v_in.created_by = p_actor OR public.process_is_partner(p_actor)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the case creator or a Managing Partner may cancel';
  END IF;

  IF v_in.current_stage_instance_id IS NOT NULL THEN
    PERFORM public.process_close_stage(v_in.current_stage_instance_id, 'cancelled', p_actor, p_reason);
  END IF;
  UPDATE public.process_handovers SET status = 'CANCELLED', acted_by = p_actor
  WHERE process_instance_id = p_instance_id AND status = 'PENDING';
  UPDATE public.process_instances
  SET status = 'cancelled', cancelled_at = clock_timestamp(), cancel_reason = p_reason,
      lock_version = lock_version + 1
  WHERE id = p_instance_id;
  PERFORM public.process_log_event(p_instance_id, v_in.current_stage_instance_id, 'process.cancelled', p_actor,
    '{}'::jsonb, p_reason);
  RETURN (SELECT to_jsonb(i) FROM public.process_instances i WHERE i.id = p_instance_id);
END $$;
REVOKE ALL ON FUNCTION public.process_cancel(UUID, UUID, TEXT) FROM PUBLIC;

-- Managing Partner override of one gate for one stage instance (PRD §23).
CREATE OR REPLACE FUNCTION public.process_override_gate(
  p_instance_id UUID, p_stage_instance_id UUID, p_gate_key TEXT, p_actor UUID, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_in public.process_instances%ROWTYPE; v_si public.process_stage_instances%ROWTYPE; v_gate public.process_gates%ROWTYPE;
BEGIN
  IF NOT public.process_is_partner(p_actor) THEN
    RAISE EXCEPTION 'FORBIDDEN: only a Managing Partner may override a gate';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED: an override needs a reason'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::text, 0));
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.current_stage_instance_id IS DISTINCT FROM p_stage_instance_id THEN
    RAISE EXCEPTION 'STALE_STAGE: the case has moved on since you loaded it';
  END IF;
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = p_stage_instance_id;
  SELECT * INTO v_gate FROM public.process_gates WHERE stage_id = v_si.process_stage_id AND gate_key = p_gate_key;
  IF v_gate.id IS NULL THEN RAISE EXCEPTION 'GATE_NOT_FOUND: % on this stage', p_gate_key; END IF;
  IF NOT v_gate.overridable THEN RAISE EXCEPTION 'GATE_NOT_OVERRIDABLE: % cannot be overridden', p_gate_key; END IF;

  PERFORM public.process_log_event(p_instance_id, p_stage_instance_id, 'process.gate_overridden', p_actor,
    jsonb_build_object('gate_key', p_gate_key, 'gate_type', v_gate.gate_type), p_reason);
  RETURN jsonb_build_object('gate_key', p_gate_key, 'overridden', true);
END $$;
REVOKE ALL ON FUNCTION public.process_override_gate(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC;

-- Handover: (re)create a pending package on the current HANDOVER stage.
CREATE OR REPLACE FUNCTION public.process_handover_create(
  p_instance_id UUID, p_actor UUID, p_to_user UUID, p_payload JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_in public.process_instances%ROWTYPE; v_si public.process_stage_instances%ROWTYPE; v_st public.process_stages%ROWTYPE;
        v_prev public.process_stages%ROWTYPE; v_id UUID; v_to UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::text, 0));
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.status <> 'active' THEN RAISE EXCEPTION 'INSTANCE_NOT_ACTIVE: case is %', v_in.status; END IF;
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = v_in.current_stage_instance_id;
  SELECT * INTO v_st FROM public.process_stages WHERE id = v_si.process_stage_id;
  IF v_st.stage_type <> 'HANDOVER' THEN RAISE EXCEPTION 'NOT_A_HANDOVER_STAGE: "%" is not a handover', v_st.name; END IF;
  IF EXISTS (SELECT 1 FROM public.process_handovers WHERE stage_instance_id = v_si.id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'HANDOVER_PENDING: a handover is already waiting for acceptance';
  END IF;
  -- The sender is whoever owns the stage that feeds this handover.
  SELECT s.* INTO v_prev FROM public.process_transitions t JOIN public.process_stages s ON s.id = t.from_stage_id
  WHERE t.to_stage_id = v_st.id AND NOT t.is_exception ORDER BY s.sequence DESC LIMIT 1;
  IF NOT (public.process_user_has_role(p_actor, COALESCE(v_prev.owner_role, v_st.owner_role))) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the % may send this handover', COALESCE(v_prev.owner_role, v_st.owner_role);
  END IF;

  v_to := public.process_resolve_assignee(v_st.owner_role, p_to_user);
  IF v_to IS DISTINCT FROM v_si.assigned_user_id THEN
    UPDATE public.process_stage_instances SET assigned_user_id = v_to WHERE id = v_si.id;
    PERFORM public.process_mirror_work_item(v_si.id);
  END IF;
  INSERT INTO public.process_handovers (process_instance_id, stage_instance_id, from_role, from_user_id, to_role, to_user_id, payload)
  VALUES (p_instance_id, v_si.id, COALESCE(v_prev.owner_role, v_st.owner_role), p_actor, v_st.owner_role, v_to, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  PERFORM public.process_log_event(p_instance_id, v_si.id, 'process.handover_requested', p_actor,
    jsonb_build_object('handover_id', v_id, 'from_role', COALESCE(v_prev.owner_role, v_st.owner_role),
                       'to_role', v_st.owner_role, 'to_user_id', v_to));
  RETURN (SELECT to_jsonb(h) FROM public.process_handovers h WHERE h.id = v_id);
END $$;
REVOKE ALL ON FUNCTION public.process_handover_create(UUID, UUID, UUID, JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_handover_accept(p_handover_id UUID, p_actor UUID, p_comment TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_h public.process_handovers%ROWTYPE; v_si public.process_stage_instances%ROWTYPE;
BEGIN
  SELECT * INTO v_h FROM public.process_handovers WHERE id = p_handover_id FOR UPDATE;
  IF v_h.id IS NULL THEN RAISE EXCEPTION 'HANDOVER_NOT_FOUND: %', p_handover_id; END IF;
  IF v_h.status <> 'PENDING' THEN RAISE EXCEPTION 'HANDOVER_NOT_PENDING: handover is %', v_h.status; END IF;
  IF NOT (v_h.to_user_id = p_actor OR public.process_user_has_role(p_actor, v_h.to_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the % may accept this handover', v_h.to_role;
  END IF;
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = v_h.stage_instance_id;

  UPDATE public.process_handovers
  SET status = 'ACCEPTED', accepted_at = clock_timestamp(), acted_by = p_actor,
      rejection_comment = p_comment, to_user_id = COALESCE(to_user_id, p_actor)
  WHERE id = p_handover_id;
  IF v_si.assigned_user_id IS NULL THEN
    UPDATE public.process_stage_instances SET assigned_user_id = p_actor WHERE id = v_si.id;
    PERFORM public.process_mirror_work_item(v_si.id);
  END IF;
  PERFORM public.process_log_event(v_h.process_instance_id, v_h.stage_instance_id, 'process.handover_accepted', p_actor,
    jsonb_build_object('handover_id', p_handover_id, 'from_user_id', v_h.from_user_id), p_comment);
  RETURN (SELECT to_jsonb(h) FROM public.process_handovers h WHERE h.id = p_handover_id);
END $$;
REVOKE ALL ON FUNCTION public.process_handover_accept(UUID, UUID, TEXT) FROM PUBLIC;

-- Rejecting sends the case back along the stage's exception transition to the
-- sender, carrying the structured reason (PRD §11).
CREATE OR REPLACE FUNCTION public.process_handover_reject(
  p_handover_id UUID, p_actor UUID, p_reason_code TEXT, p_comment TEXT,
  p_proposed_date DATE DEFAULT NULL, p_transition_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_h public.process_handovers%ROWTYPE; v_in public.process_instances%ROWTYPE;
  v_si public.process_stage_instances%ROWTYPE; v_st public.process_stages%ROWTYPE;
  v_tr public.process_transitions%ROWTYPE; v_reason JSONB; v_next_si UUID;
BEGIN
  SELECT * INTO v_h FROM public.process_handovers WHERE id = p_handover_id FOR UPDATE;
  IF v_h.id IS NULL THEN RAISE EXCEPTION 'HANDOVER_NOT_FOUND: %', p_handover_id; END IF;
  IF v_h.status <> 'PENDING' THEN RAISE EXCEPTION 'HANDOVER_NOT_PENDING: handover is %', v_h.status; END IF;
  IF NOT (v_h.to_user_id = p_actor OR public.process_user_has_role(p_actor, v_h.to_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the % may reject this handover', v_h.to_role;
  END IF;
  IF NULLIF(btrim(COALESCE(p_comment, '')), '') IS NULL OR p_reason_code IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a rejection needs a reason code and comment';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_h.process_instance_id::text, 0));
  SELECT * INTO v_in FROM public.process_instances WHERE id = v_h.process_instance_id FOR UPDATE;
  IF v_in.current_stage_instance_id IS DISTINCT FROM v_h.stage_instance_id THEN
    RAISE EXCEPTION 'STALE_STAGE: the case has moved on since you loaded it';
  END IF;
  SELECT * INTO v_si FROM public.process_stage_instances WHERE id = v_h.stage_instance_id;
  SELECT * INTO v_st FROM public.process_stages WHERE id = v_si.process_stage_id;

  IF p_transition_key IS NOT NULL THEN
    SELECT * INTO v_tr FROM public.process_transitions WHERE from_stage_id = v_st.id AND transition_key = p_transition_key AND is_exception;
  ELSE
    SELECT * INTO v_tr FROM public.process_transitions WHERE from_stage_id = v_st.id AND is_exception ORDER BY priority LIMIT 1;
  END IF;
  IF v_tr.id IS NULL THEN RAISE EXCEPTION 'HANDOVER_NO_RETURN_PATH: "%" has no exception transition', v_st.name; END IF;

  v_reason := jsonb_build_object('code', p_reason_code, 'message', p_comment,
                                 'proposed_date', p_proposed_date, 'handover_id', p_handover_id);
  UPDATE public.process_handovers
  SET status = 'REJECTED', rejected_at = clock_timestamp(), acted_by = p_actor,
      rejection_reason_code = p_reason_code, rejection_comment = p_comment, proposed_date = p_proposed_date
  WHERE id = p_handover_id;

  UPDATE public.process_stage_instances SET blocked_reason = v_reason WHERE id = v_si.id;
  PERFORM public.process_close_stage(v_si.id, 'failed', p_actor, 'Handover rejected: ' || p_reason_code);
  PERFORM public.process_log_event(v_in.id, v_si.id, 'process.handover_rejected', p_actor, v_reason, p_comment);
  PERFORM public.process_log_event(v_in.id, v_si.id, 'process.stage_completed', p_actor,
    jsonb_build_object('stage_key', v_st.stage_key, 'transition_key', v_tr.transition_key,
                       'is_exception', true, 'status', 'failed'), p_comment);

  v_next_si := public.process_open_stage(v_in.id, v_tr.to_stage_id, p_actor, v_h.from_user_id);
  UPDATE public.process_stage_instances SET blocked_reason = v_reason WHERE id = v_next_si;

  RETURN jsonb_build_object(
    'handover', (SELECT to_jsonb(h) FROM public.process_handovers h WHERE h.id = p_handover_id),
    'instance', (SELECT to_jsonb(i) FROM public.process_instances i WHERE i.id = v_in.id),
    'next_stage_instance_id', v_next_si);
END $$;
REVOKE ALL ON FUNCTION public.process_handover_reject(UUID, UUID, TEXT, TEXT, DATE, TEXT) FROM PUBLIC;

-- SLA sweep: idempotent via sla_warned_at / sla_breached_at. Returns what fired.
CREATE OR REPLACE FUNCTION public.process_sla_sweep(p_now TIMESTAMPTZ DEFAULT clock_timestamp())
RETURNS TABLE (stage_instance_id UUID, process_instance_id UUID, assigned_user_id UUID,
               assigned_role TEXT, kind TEXT, stage_name TEXT, due_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r RECORD; v_warn_pct INTEGER; v_warn_at TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT si.*, st.name AS st_name, st.sla_minutes, st.configuration
    FROM public.process_stage_instances si
    JOIN public.process_stages st ON st.id = si.process_stage_id
    WHERE si.status IN ('current', 'blocked') AND si.due_at IS NOT NULL
      AND (si.sla_breached_at IS NULL OR si.sla_warned_at IS NULL)
    FOR UPDATE OF si SKIP LOCKED
  LOOP
    IF r.sla_breached_at IS NULL AND r.due_at <= p_now THEN
      UPDATE public.process_stage_instances SET sla_breached_at = p_now,
        sla_warned_at = COALESCE(sla_warned_at, p_now) WHERE id = r.id;
      PERFORM public.process_log_event(r.process_instance_id, r.id, 'process.sla_breached', NULL,
        jsonb_build_object('due_at', r.due_at, 'assigned_user_id', r.assigned_user_id), NULL, NULL, NULL, 'system');
      stage_instance_id := r.id; process_instance_id := r.process_instance_id;
      assigned_user_id := r.assigned_user_id; assigned_role := r.assigned_role;
      kind := 'breached'; stage_name := r.st_name; due_at := r.due_at;
      RETURN NEXT;
    ELSIF r.sla_warned_at IS NULL THEN
      v_warn_pct := COALESCE((r.configuration->>'sla_warning_percent')::int, 80);
      v_warn_at := r.due_at - make_interval(mins => r.sla_minutes) * (100 - v_warn_pct) / 100.0;
      IF v_warn_at <= p_now THEN
        UPDATE public.process_stage_instances SET sla_warned_at = p_now WHERE id = r.id;
        PERFORM public.process_log_event(r.process_instance_id, r.id, 'process.sla_warning', NULL,
          jsonb_build_object('due_at', r.due_at, 'assigned_user_id', r.assigned_user_id), NULL, NULL, NULL, 'system');
        stage_instance_id := r.id; process_instance_id := r.process_instance_id;
        assigned_user_id := r.assigned_user_id; assigned_role := r.assigned_role;
        kind := 'warning'; stage_name := r.st_name; due_at := r.due_at;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.process_sla_sweep(TIMESTAMPTZ) FROM PUBLIC;

-- =============================================================================
-- 8. Definition import / publish (atomic normalisation of the authored JSON)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_import_definition(p_def JSONB, p_actor UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_def_id UUID; v_ver_id UUID; v_stage JSONB; v_item JSONB; v_stage_id UUID; v_to UUID;
  v_seq INTEGER := 0; v_iseq INTEGER;
BEGIN
  IF p_def->>'process_key' IS NULL OR p_def->>'version' IS NULL OR jsonb_typeof(p_def->'stages') <> 'array' THEN
    RAISE EXCEPTION 'DEFINITION_INVALID: process_key, version and stages are required';
  END IF;

  INSERT INTO public.process_definitions (process_key, name, category, description, entity_type)
  VALUES (p_def->>'process_key', p_def->>'name', p_def->>'category', p_def->>'description',
          COALESCE(p_def->>'entity_type', 'generic'))
  ON CONFLICT (process_key) DO UPDATE
    SET name = EXCLUDED.name, category = EXCLUDED.category,
        description = EXCLUDED.description, entity_type = EXCLUDED.entity_type
  RETURNING id INTO v_def_id;

  IF EXISTS (SELECT 1 FROM public.process_versions WHERE process_definition_id = v_def_id AND version = p_def->>'version') THEN
    RAISE EXCEPTION 'VERSION_EXISTS: % v% already exists', p_def->>'process_key', p_def->>'version';
  END IF;

  INSERT INTO public.process_versions (process_definition_id, version, status, definition, created_by)
  VALUES (v_def_id, p_def->>'version', 'DRAFT', p_def, p_actor)
  RETURNING id INTO v_ver_id;

  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_def->'stages') LOOP
    v_seq := v_seq + 1;
    INSERT INTO public.process_stages (process_version_id, stage_key, name, description, stage_type, sequence,
                                       owner_role, sla_minutes, is_start, configuration)
    VALUES (v_ver_id, v_stage->>'key', v_stage->>'name', v_stage->>'description',
            COALESCE(v_stage->>'type', 'ACTION'), v_seq, v_stage->>'owner_role',
            NULLIF(v_stage->>'sla_minutes', '')::int,
            COALESCE((v_stage->>'is_start')::boolean, false),
            COALESCE(v_stage->'config', '{}'::jsonb))
    RETURNING id INTO v_stage_id;

    v_iseq := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'checklist', '[]'::jsonb)) LOOP
      v_iseq := v_iseq + 1;
      INSERT INTO public.process_checklist_items (stage_id, item_key, title, description, required, sequence,
                                                  evidence_required, configuration)
      VALUES (v_stage_id, v_item->>'key', v_item->>'title', v_item->>'description',
              COALESCE((v_item->>'required')::boolean, true), v_iseq,
              COALESCE((v_item->>'evidence_required')::boolean, false),
              CASE WHEN v_item->>'evidence_type' IS NULL THEN '{}'::jsonb
                   ELSE jsonb_build_object('evidence_type', v_item->>'evidence_type') END);
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'gates', '[]'::jsonb)) LOOP
      INSERT INTO public.process_gates (stage_id, gate_key, gate_type, condition, failure_message, overridable)
      VALUES (v_stage_id, v_item->>'key', v_item->>'type', COALESCE(v_item->'condition', '{}'::jsonb),
              v_item->>'failure_message', COALESCE((v_item->>'overridable')::boolean, true));
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'automations', '[]'::jsonb)) LOOP
      INSERT INTO public.process_automations (stage_id, event, action_type, configuration, enabled)
      VALUES (v_stage_id, v_item->>'event', v_item->>'action', COALESCE(v_item->'configuration', '{}'::jsonb),
              COALESCE((v_item->>'enabled')::boolean, true));
    END LOOP;
  END LOOP;

  -- Second pass: transitions need every stage id.
  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_def->'stages') LOOP
    SELECT id INTO v_stage_id FROM public.process_stages WHERE process_version_id = v_ver_id AND stage_key = v_stage->>'key';
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'transitions', '[]'::jsonb)) LOOP
      SELECT id INTO v_to FROM public.process_stages WHERE process_version_id = v_ver_id AND stage_key = v_item->>'to';
      IF v_to IS NULL THEN
        RAISE EXCEPTION 'TRANSITION_TARGET_MISSING: % -> %', v_stage->>'key', v_item->>'to';
      END IF;
      INSERT INTO public.process_transitions (process_version_id, from_stage_id, to_stage_id, transition_key,
                                              condition, priority, is_exception, label)
      VALUES (v_ver_id, v_stage_id, v_to, v_item->>'key', COALESCE(v_item->'condition', '{}'::jsonb),
              COALESCE((v_item->>'priority')::int, 10), COALESCE((v_item->>'is_exception')::boolean, false),
              v_item->>'label');
    END LOOP;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.process_stages WHERE process_version_id = v_ver_id AND is_start) THEN
    RAISE EXCEPTION 'NO_START_STAGE: mark exactly one stage is_start';
  END IF;

  RETURN v_ver_id;
END $$;
REVOKE ALL ON FUNCTION public.process_import_definition(JSONB, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_publish_version(p_version_id UUID, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_ver public.process_versions%ROWTYPE; v_prev UUID;
BEGIN
  IF NOT public.process_is_partner(p_actor) THEN RAISE EXCEPTION 'FORBIDDEN: only a Managing Partner may publish'; END IF;
  SELECT * INTO v_ver FROM public.process_versions WHERE id = p_version_id FOR UPDATE;
  IF v_ver.id IS NULL THEN RAISE EXCEPTION 'VERSION_NOT_FOUND: %', p_version_id; END IF;
  IF v_ver.status <> 'DRAFT' THEN RAISE EXCEPTION 'VERSION_NOT_DRAFT: version is %', v_ver.status; END IF;

  SELECT active_version_id INTO v_prev FROM public.process_definitions WHERE id = v_ver.process_definition_id FOR UPDATE;
  IF v_prev IS NOT NULL THEN
    UPDATE public.process_versions SET status = 'RETIRED', effective_to = clock_timestamp() WHERE id = v_prev;
  END IF;
  UPDATE public.process_versions
  SET status = 'ACTIVE', published_at = clock_timestamp(), effective_from = clock_timestamp(), effective_to = NULL
  WHERE id = p_version_id;
  UPDATE public.process_definitions SET active_version_id = p_version_id WHERE id = v_ver.process_definition_id;
  RETURN (SELECT to_jsonb(v) FROM public.process_versions v WHERE v.id = p_version_id);
END $$;
REVOKE ALL ON FUNCTION public.process_publish_version(UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.process_retire_version(p_version_id UUID, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_ver public.process_versions%ROWTYPE;
BEGIN
  IF NOT public.process_is_partner(p_actor) THEN RAISE EXCEPTION 'FORBIDDEN: only a Managing Partner may retire'; END IF;
  SELECT * INTO v_ver FROM public.process_versions WHERE id = p_version_id FOR UPDATE;
  IF v_ver.id IS NULL THEN RAISE EXCEPTION 'VERSION_NOT_FOUND: %', p_version_id; END IF;
  UPDATE public.process_versions SET status = 'RETIRED', effective_to = clock_timestamp() WHERE id = p_version_id;
  UPDATE public.process_definitions SET active_version_id = NULL
  WHERE id = v_ver.process_definition_id AND active_version_id = p_version_id;
  RETURN (SELECT to_jsonb(v) FROM public.process_versions v WHERE v.id = p_version_id);
END $$;
REVOKE ALL ON FUNCTION public.process_retire_version(UUID, UUID) FROM PUBLIC;

-- =============================================================================
-- 9. Analytics views (Intelligence Layer contract; security_invoker)
-- =============================================================================

CREATE OR REPLACE VIEW public.v_process_stage_durations
WITH (security_invoker = true) AS
SELECT d.process_key, v.version, s.stage_key, s.name AS stage_name, s.owner_role,
       si.id AS stage_instance_id, si.process_instance_id, si.status,
       si.started_at, si.completed_at,
       EXTRACT(EPOCH FROM (COALESCE(si.completed_at, now()) - si.started_at)) / 60.0 AS minutes_open,
       s.sla_minutes,
       (si.sla_breached_at IS NOT NULL) AS sla_breached
FROM public.process_stage_instances si
JOIN public.process_stages s ON s.id = si.process_stage_id
JOIN public.process_versions v ON v.id = s.process_version_id
JOIN public.process_definitions d ON d.id = v.process_definition_id;

CREATE OR REPLACE VIEW public.v_process_handover_outcomes
WITH (security_invoker = true) AS
SELECT d.process_key, h.id AS handover_id, h.process_instance_id, h.from_role, h.to_role, h.status,
       h.rejection_reason_code, h.proposed_date, h.requested_at,
       COALESCE(h.accepted_at, h.rejected_at) AS decided_at,
       EXTRACT(EPOCH FROM (COALESCE(h.accepted_at, h.rejected_at) - h.requested_at)) / 60.0 AS minutes_to_decision
FROM public.process_handovers h
JOIN public.process_instances i ON i.id = h.process_instance_id
JOIN public.process_definitions d ON d.id = i.process_definition_id;

CREATE OR REPLACE VIEW public.v_process_open_work
WITH (security_invoker = true) AS
SELECT si.id AS stage_instance_id, si.process_instance_id, i.entity_type, i.entity_id, i.context,
       d.process_key, d.name AS process_name, s.stage_key, s.name AS stage_name, s.stage_type,
       si.assigned_role, si.assigned_user_id, si.status, si.started_at, si.due_at,
       (si.due_at IS NOT NULL AND si.due_at < now()) AS is_overdue,
       (SELECT count(*) FROM public.process_tasks t WHERE t.stage_instance_id = si.id AND t.status = 'open') AS open_tasks,
       (SELECT count(*) FROM public.process_tasks t WHERE t.stage_instance_id = si.id AND t.status = 'open' AND t.required) AS required_open_tasks
FROM public.process_stage_instances si
JOIN public.process_instances i ON i.id = si.process_instance_id
JOIN public.process_stages s ON s.id = si.process_stage_id
JOIN public.process_definitions d ON d.id = i.process_definition_id
WHERE si.status IN ('current', 'blocked') AND i.status IN ('active', 'blocked');

GRANT SELECT ON public.v_process_stage_durations, public.v_process_handover_outcomes, public.v_process_open_work
  TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- 10. Existing lead-stage automation: yield to a live process instance (D9)
--     Separate transaction so a failure here cannot undo the schema above.
-- =============================================================================
BEGIN;

-- A BEFORE trigger that fires ahead of the existing AFTER trigger cannot stop it,
-- so the yield is a tiny wrapper installed as a second AFTER trigger that runs
-- first (alphabetical order) and marks the row; the original function then
-- returns early through this guard. Simpler and safer than re-declaring the
-- 200-line original: we redefine only its entry condition by wrapping it.
CREATE OR REPLACE FUNCTION public.process_owns_lead(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.process_instances
    WHERE entity_type = 'lead' AND entity_id = p_lead_id::text AND status IN ('active', 'blocked'));
$$;
REVOKE ALL ON FUNCTION public.process_owns_lead(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_owns_lead(UUID) TO authenticated, service_role;

-- Re-point the trigger at a guard that delegates to the original body.
CREATE OR REPLACE FUNCTION public.sync_lead_stage_progression_work_item_guarded()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF public.process_owns_lead(NEW.id) THEN
    RETURN NEW;
  END IF;
  RETURN public.sync_lead_stage_progression_work_item_body(OLD, NEW);
END $$;

-- The original trigger function, exposed as a plain function over (OLD, NEW) so
-- the guard can call it. Body copied verbatim from
-- 20260903120000_lead_stage_progression_tasks.sql.
CREATE OR REPLACE FUNCTION public.sync_lead_stage_progression_work_item_body(
  p_old public.leads, p_new public.leads
) RETURNS public.leads
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  IF p_new.pipeline_stage IS NOT DISTINCT FROM p_old.pipeline_stage
     AND p_new.assigned_staff IS NOT DISTINCT FROM p_old.assigned_staff THEN
    RETURN p_new;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_new.id::text, 0));

  -- Closed leads and unassigned leads cannot have an actionable owned item.
  IF p_new.pipeline_stage IN ('order_won', 'closed_lost')
     OR p_new.assigned_staff IS NULL THEN
    FOR v_item_id IN
      UPDATE public.work_items
      SET status = 'cancelled',
          cancelled_at = clock_timestamp(),
          return_reason = CASE
            WHEN p_new.assigned_staff IS NULL
              THEN 'Cancelled automatically: lead has no assignee'
            ELSE 'Cancelled automatically: lead reached terminal stage'
          END,
          updated_at = clock_timestamp()
      WHERE related_lead_id = p_new.id
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
          'pipeline_stage', p_new.pipeline_stage,
          'unassigned', p_new.assigned_staff IS NULL
        )
      );
    END LOOP;
    RETURN p_new;
  END IF;

  v_default_days := public.lead_stage_default_days(p_new.pipeline_stage);
  v_action := COALESCE(
    NULLIF(btrim(p_new.next_action), ''),
    public.lead_stage_default_action(p_new.pipeline_stage)
  );

  -- Unknown/non-actionable stages fail closed instead of inventing work.
  IF v_default_days IS NULL OR v_action IS NULL THEN
    RETURN p_new;
  END IF;

  v_due_date := CASE
    WHEN p_new.follow_up_date IS NULL OR p_new.follow_up_date < v_today
      THEN v_today + v_default_days
    ELSE p_new.follow_up_date
  END;
  v_due_at := (v_due_date + TIME '17:30:00') AT TIME ZONE 'Asia/Kolkata';
  v_priority := public.lead_stage_default_priority(p_new.pipeline_stage);

  SELECT id, status
  INTO v_item_id, v_old_status
  FROM public.work_items
  WHERE related_lead_id = p_new.id
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
      'Automatic next action for ' || p_new.name || ' after stage moved to '
        || replace(p_new.pipeline_stage, '_', ' '),
      'Complete the action, record the customer outcome, and update the lead stage or follow-up date.',
      'simple',
      'pending',
      v_priority,
      p_new.assigned_staff,
      NULL,
      v_due_at,
      p_new.id,
      p_new.name,
      'lead_stage_progression',
      p_new.pipeline_stage
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
        'pipeline_stage', p_new.pipeline_stage,
        'follow_up_date', v_due_date
      )
    );
  ELSE
    UPDATE public.work_items
    SET title = v_action,
        description = 'Automatic next action for ' || p_new.name
          || ' after stage moved to ' || replace(p_new.pipeline_stage, '_', ' '),
        instructions = 'Complete the action, record the customer outcome, and update the lead stage or follow-up date.',
        status = 'pending',
        priority = v_priority,
        assigned_user_id = p_new.assigned_staff,
        due_at = v_due_at,
        started_at = NULL,
        returned_at = NULL,
        return_reason = NULL,
        cancelled_at = NULL,
        source_record_id = p_new.pipeline_stage,
        related_label = p_new.name,
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
        'old_pipeline_stage', p_old.pipeline_stage,
        'pipeline_stage', p_new.pipeline_stage,
        'old_assignee', p_old.assigned_staff,
        'assignee', p_new.assigned_staff,
        'follow_up_date', v_due_date
      )
    );
  END IF;

  RETURN p_new;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_lead_stage_progression_work_item_body(public.leads, public.leads) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_lead_stage_progression_work_item_guarded() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sync_lead_stage_progression_work_item ON public.leads;
CREATE TRIGGER trg_sync_lead_stage_progression_work_item
  AFTER UPDATE OF pipeline_stage, assigned_staff ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_stage_progression_work_item_guarded();

COMMENT ON FUNCTION public.sync_lead_stage_progression_work_item_guarded() IS
  'Lead stage progression task automation, skipped for leads owned by a live Process OS instance.';

COMMIT;

-- =============================================================================
-- ROLLBACK (run manually, in this order, to remove Process OS entirely).
-- work_items rows with source_module = ''process_os'' are history and are kept.
-- =============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_sync_lead_stage_progression_work_item ON public.leads;
-- CREATE TRIGGER trg_sync_lead_stage_progression_work_item
--   AFTER UPDATE OF pipeline_stage, assigned_staff ON public.leads
--   FOR EACH ROW EXECUTE FUNCTION public.sync_lead_stage_progression_work_item();
-- DROP FUNCTION IF EXISTS public.sync_lead_stage_progression_work_item_guarded();
-- DROP FUNCTION IF EXISTS public.sync_lead_stage_progression_work_item_body(public.leads, public.leads);
-- DROP FUNCTION IF EXISTS public.process_owns_lead(UUID);
-- DROP VIEW IF EXISTS public.v_process_open_work;
-- DROP VIEW IF EXISTS public.v_process_handover_outcomes;
-- DROP VIEW IF EXISTS public.v_process_stage_durations;
-- DROP FUNCTION IF EXISTS public.process_retire_version(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.process_publish_version(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.process_import_definition(JSONB, UUID);
-- DROP FUNCTION IF EXISTS public.process_sla_sweep(TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS public.process_handover_reject(UUID, UUID, TEXT, TEXT, DATE, TEXT);
-- DROP FUNCTION IF EXISTS public.process_handover_accept(UUID, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.process_handover_create(UUID, UUID, UUID, JSONB);
-- DROP FUNCTION IF EXISTS public.process_override_gate(UUID, UUID, TEXT, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.process_cancel(UUID, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.process_unblock(UUID, UUID, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.process_block(UUID, UUID, UUID, JSONB);
-- DROP FUNCTION IF EXISTS public.process_advance(UUID, UUID, UUID, TEXT, JSONB, TEXT, TEXT, JSONB, JSONB);
-- DROP FUNCTION IF EXISTS public.process_db_gate_ok(public.process_gates, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.process_add_evidence(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB);
-- DROP FUNCTION IF EXISTS public.process_complete_task(UUID, UUID, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.process_start(TEXT, TEXT, TEXT, UUID, JSONB, TEXT, BOOLEAN, TEXT, UUID);
-- DROP FUNCTION IF EXISTS public.process_close_stage(UUID, TEXT, UUID, TEXT, TEXT, TEXT, JSONB);
-- DROP FUNCTION IF EXISTS public.process_open_stage(UUID, UUID, UUID, UUID);
-- DROP FUNCTION IF EXISTS public.process_close_work_item(UUID, TEXT, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.process_mirror_work_item(UUID);
-- DROP FUNCTION IF EXISTS public.process_case_label(JSONB, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.process_resolve_assignee(TEXT, UUID);
-- DROP FUNCTION IF EXISTS public.process_log_event(UUID, UUID, TEXT, UUID, JSONB, TEXT, JSONB, JSONB, TEXT);
-- DROP FUNCTION IF EXISTS public.process_is_partner(UUID);
-- DROP FUNCTION IF EXISTS public.process_user_has_role(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.process_role_app_roles(TEXT);
-- DROP TABLE IF EXISTS public.process_events, public.process_handovers, public.process_evidence,
--   public.process_tasks, public.process_stage_instances, public.process_instances,
--   public.process_role_defaults, public.process_automations, public.process_gates,
--   public.process_checklist_items, public.process_transitions, public.process_stages,
--   public.process_versions, public.process_definitions CASCADE;
-- ALTER TABLE public.work_items DROP CONSTRAINT IF EXISTS work_items_activity_type_check;
-- ALTER TABLE public.work_items ADD CONSTRAINT work_items_activity_type_check
--   CHECK (activity_type IN ('simple', 'checklist', 'inspection', 'report', 'approval'));
-- COMMIT;
