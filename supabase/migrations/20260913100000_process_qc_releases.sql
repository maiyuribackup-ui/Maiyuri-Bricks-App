-- Process OS: QC release records (PRD §9 Quality Release, plan §8 open Q8).
--
-- V0.1 let the factory manager satisfy QUALITY_RELEASE by attaching a free
-- text "qc_release" note. This replaces that with a real record: what was
-- checked, how much, the batch, the verdict (released / hold), who checked
-- it and when. The record itself is the evidence; the new `qc_released` gate
-- is verified inside the database from the record, never from a note.
--
-- Additive: existing definitions using `manual_confirmation` keep working.
-- Lead-to-Delivery v1.1 switches its QC_RELEASED gate to `qc_released`.

BEGIN;

-- =============================================================================
-- 1. Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.process_qc_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  stage_instance_id UUID NOT NULL REFERENCES public.process_stage_instances(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.process_tasks(id) ON DELETE SET NULL,
  evidence_id UUID REFERENCES public.process_evidence(id) ON DELETE SET NULL,
  odoo_order_id INTEGER,
  product_name TEXT NOT NULL CHECK (length(btrim(product_name)) BETWEEN 1 AND 200),
  quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  batch_ref TEXT CHECK (batch_ref IS NULL OR length(batch_ref) <= 100),
  result TEXT NOT NULL CHECK (result IN ('released', 'hold')),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  photo_path TEXT,
  lab_report_path TEXT,
  checked_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_process_qc_releases_stage
  ON public.process_qc_releases (stage_instance_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_qc_releases_instance
  ON public.process_qc_releases (process_instance_id, checked_at DESC);

ALTER TABLE public.process_qc_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read process_qc_releases" ON public.process_qc_releases;
CREATE POLICY "auth read process_qc_releases" ON public.process_qc_releases
  FOR SELECT TO authenticated USING (true);
-- Writes go through process_record_qc_release (service role only).

-- =============================================================================
-- 2. New gate type
-- =============================================================================
ALTER TABLE public.process_gates DROP CONSTRAINT IF EXISTS process_gates_gate_type_check;
ALTER TABLE public.process_gates ADD CONSTRAINT process_gates_gate_type_check CHECK (gate_type IN (
  'checklist_complete', 'entity_field', 'odoo_quote_linked', 'advance_verified',
  'handover_accepted', 'stock_feasible', 'manual_confirmation',
  'linked_record_status', 'decision_outcome', 'qc_released'));

-- The latest QC record on the stage decides: a hold after a release re-blocks.
CREATE OR REPLACE FUNCTION public.process_qc_gate_ok(p_stage_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT q.result = 'released' AND public.process_user_has_role(q.checked_by, 'FACTORY_MANAGER')
    FROM public.process_qc_releases q
    WHERE q.stage_instance_id = p_stage_instance_id
    ORDER BY q.checked_at DESC, q.created_at DESC
    LIMIT 1), false);
$$;
REVOKE ALL ON FUNCTION public.process_qc_gate_ok(UUID) FROM PUBLIC;

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
    WHEN 'qc_released' THEN
      RETURN public.process_qc_gate_ok(p_stage_instance_id);
    ELSE
      RETURN NULL;
  END CASE;
END $$;
REVOKE ALL ON FUNCTION public.process_db_gate_ok(public.process_gates, UUID, TEXT) FROM PUBLIC;

-- =============================================================================
-- 3. Recording a QC release
--    One call = record + evidence + (on release) checklist item done, in one
--    transaction. Only a FACTORY_MANAGER (or the stage assignee) may record.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_record_qc_release(
  p_instance_id UUID,
  p_stage_instance_id UUID,
  p_actor UUID,
  p_product_name TEXT,
  p_quantity NUMERIC,
  p_result TEXT,
  p_task_id UUID DEFAULT NULL,
  p_batch_ref TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_photo_path TEXT DEFAULT NULL,
  p_lab_report_path TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_in public.process_instances%ROWTYPE;
  v_si public.process_stage_instances%ROWTYPE;
  v_task public.process_tasks%ROWTYPE;
  v_order INTEGER;
  v_qc_id UUID;
  v_ev JSONB;
BEGIN
  IF p_result NOT IN ('released', 'hold') THEN
    RAISE EXCEPTION 'INVALID_QC_RESULT: %', p_result;
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QC_QUANTITY: quantity must be greater than zero';
  END IF;
  SELECT * INTO v_in FROM public.process_instances WHERE id = p_instance_id;
  IF v_in.id IS NULL THEN RAISE EXCEPTION 'INSTANCE_NOT_FOUND: %', p_instance_id; END IF;
  IF v_in.status NOT IN ('active', 'blocked') THEN
    RAISE EXCEPTION 'INSTANCE_NOT_ACTIVE: case is %', v_in.status;
  END IF;
  SELECT * INTO v_si FROM public.process_stage_instances
  WHERE id = p_stage_instance_id AND process_instance_id = p_instance_id;
  IF v_si.id IS NULL THEN RAISE EXCEPTION 'STAGE_NOT_FOUND: %', p_stage_instance_id; END IF;
  IF v_si.status NOT IN ('current', 'blocked') THEN
    RAISE EXCEPTION 'STAGE_NOT_OPEN: this stage is no longer active';
  END IF;
  IF NOT (v_si.assigned_user_id = p_actor OR public.process_user_has_role(p_actor, 'FACTORY_MANAGER')) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the FACTORY_MANAGER may record a QC release';
  END IF;
  IF p_task_id IS NOT NULL THEN
    SELECT * INTO v_task FROM public.process_tasks WHERE id = p_task_id AND stage_instance_id = p_stage_instance_id;
    IF v_task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND: %', p_task_id; END IF;
  END IF;

  v_order := NULLIF(v_in.context->>'odoo_order_id', '')::INTEGER;

  INSERT INTO public.process_qc_releases (
    process_instance_id, stage_instance_id, task_id, odoo_order_id, product_name, quantity,
    batch_ref, result, notes, photo_path, lab_report_path, checked_by
  ) VALUES (
    p_instance_id, p_stage_instance_id, p_task_id, v_order, btrim(p_product_name), p_quantity,
    NULLIF(btrim(p_batch_ref), ''), p_result, NULLIF(btrim(p_notes), ''), p_photo_path, p_lab_report_path, p_actor
  ) RETURNING id INTO v_qc_id;

  -- The record is the evidence. A hold is recorded as a note so a plain
  -- "qc_release" evidence search never mistakes it for a release.
  v_ev := public.process_add_evidence(
    p_instance_id, p_stage_instance_id, p_task_id, p_actor,
    CASE WHEN p_result = 'released' THEN 'qc_release' ELSE 'note' END,
    'text', v_qc_id::TEXT, p_photo_path,
    jsonb_build_object(
      'qc_release_id', v_qc_id, 'result', p_result, 'product_name', btrim(p_product_name),
      'quantity', p_quantity, 'batch_ref', NULLIF(btrim(p_batch_ref), ''),
      'text', CASE WHEN p_result = 'released' THEN 'QC released' ELSE 'QC HOLD' END
              || ': ' || p_quantity::TEXT || ' × ' || btrim(p_product_name)
              || COALESCE(' (batch ' || NULLIF(btrim(p_batch_ref), '') || ')', '')
              || COALESCE(' — ' || NULLIF(btrim(p_notes), ''), '')));
  UPDATE public.process_qc_releases SET evidence_id = (v_ev->>'id')::UUID WHERE id = v_qc_id;

  IF p_result = 'released' AND v_task.id IS NOT NULL AND v_task.status = 'open' THEN
    PERFORM public.process_complete_task(p_task_id, p_actor, 'done', NULL);
  END IF;

  PERFORM public.process_log_event(p_instance_id, p_stage_instance_id,
    CASE WHEN p_result = 'released' THEN 'process.qc_released' ELSE 'process.qc_hold' END,
    p_actor, jsonb_build_object('qc_release_id', v_qc_id, 'product_name', btrim(p_product_name),
                                'quantity', p_quantity, 'batch_ref', NULLIF(btrim(p_batch_ref), ''),
                                'notes', NULLIF(btrim(p_notes), '')));

  RETURN (SELECT to_jsonb(q) FROM public.process_qc_releases q WHERE q.id = v_qc_id);
END $$;
REVOKE ALL ON FUNCTION public.process_record_qc_release(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;

-- ROLLBACK (manual):
-- DROP FUNCTION public.process_record_qc_release(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, TEXT, TEXT);
-- DROP FUNCTION public.process_qc_gate_ok(UUID);
-- (restore process_db_gate_ok from 20260912100000_process_os.sql)
-- DROP TABLE public.process_qc_releases;
