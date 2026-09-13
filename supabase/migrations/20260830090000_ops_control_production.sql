-- ============================================================================
-- Operations Control (oc_) — Phase 4: production planning, actuals, cement.
--
-- PRD: "Production, Fulfilment & Dispatch Control" v1.0
--   §5     draft → posted → adjusted lifecycle
--   §6     idempotency
--   §8.1   Odoo MO ownership (write-back stays OFF — see below)
--   §8.2   adjustments preserve history
--   §8.3   atomicity through RPCs
--   §22    aggregate manpower, no worker names
--   §24    stock production is not a fake sales order
--   §27    integrity failures BLOCK; planning exceptions only warn
--   §33/35 cement per production line, ratio on GROSS output
--
-- THE LIFECYCLE, and why it is the centre of this migration:
--
--   Draft     Rajesh is still entering. Accepted 1,200 with only 1,000
--             assigned to allocations is a legal draft — half-entered data
--             must never move the business dashboard.
--   Posted    The moment of truth. POST enforces
--             Σ allocation actuals = accepted_qty, then writes the inventory
--             receipt, creates the reservations, and makes the numbers real.
--   Adjusted  A posted record is history. "We counted 1,200, it was 1,150"
--             is a NEW −50 delta row, never an edit, because last week's
--             labour may already have been paid against the 1,200 (§8.2).
--
-- Only POST has side effects. A draft moves no stock, reserves nothing,
-- earns no labour and changes no coverage — enforced by the RPC, not by
-- convention.
--
-- ODOO WRITE-BACK IS DELIBERATELY NOT ENABLED HERE (§8.1). The columns exist
-- (odoo_mo_id, odoo_mo_name, odoo_sync_status) and default to 'pending', but
-- nothing writes to Odoo yet. Turning it on requires answering first: does OC
-- CREATE an Odoo manufacturing order, or REFERENCE one that production_orders
-- already created? Get that wrong and Odoo inventory increases twice for the
-- same physical bricks. The idempotency keys below are what will make the
-- "exactly one Odoo transaction" guarantee enforceable when that is settled.
--
-- Conventions as Phases 1-3: RLS auth-read only, every write through a
-- service-role route with an in-handler role gate, lock_version on rows two
-- people can edit at once.
-- ============================================================================

-- --------------------------------------------------------------- days -------
-- A production day is the planning unit. Shifts hang off it so "we ran one
-- shift on Tuesday" is a fact about the day, not an absence of rows.
CREATE TABLE IF NOT EXISTS public.oc_production_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prod_date DATE NOT NULL UNIQUE,
  planned_shift_count INTEGER NOT NULL DEFAULT 2
    CHECK (planned_shift_count IN (1, 2)),
  notes TEXT,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- shifts ------
-- §22: manpower is an AGGREGATE COUNT, never a list of names. Worker-level
-- attribution is explicitly out of scope for V1 and putting names here would
-- invite it back in through the schema.
CREATE TABLE IF NOT EXISTS public.oc_production_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID NOT NULL REFERENCES public.oc_production_days(id) ON DELETE CASCADE,
  shift_no INTEGER NOT NULL CHECK (shift_no IN (1, 2)),
  planned_manpower INTEGER CHECK (planned_manpower IS NULL OR planned_manpower >= 0),
  actual_manpower INTEGER CHECK (actual_manpower IS NULL OR actual_manpower >= 0),
  notes TEXT,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day_id, shift_no)
);

-- ---------------------------------------------------------- plan lines ------
-- One line per shift+product, mirroring the actuals key so plan and actual
-- compare row for row without a join guess.
CREATE TABLE IF NOT EXISTS public.oc_production_plan_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.oc_production_shifts(id) ON DELETE CASCADE,
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id),
  planned_qty NUMERIC(14,2) NOT NULL CHECK (planned_qty > 0),
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shift_id, finished_good_id)
);

-- --------------------------------------------------------- allocations ------
-- WHY a plan line is produced. §24: production for stock is a first-class
-- purpose, not a fake sales order — inventing an "internal customer" would
-- corrupt every demand and coverage figure downstream.
CREATE TABLE IF NOT EXISTS public.oc_production_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_line_id UUID NOT NULL
    REFERENCES public.oc_production_plan_lines(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('sales_order', 'stock')),
  so_line_id UUID REFERENCES public.oc_sales_order_lines(id),
  stock_ref TEXT,
  planned_qty NUMERIC(14,2) NOT NULL CHECK (planned_qty > 0),
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An allocation that claims to be for a sales order must name one.
  CONSTRAINT oc_allocation_so_line_required CHECK (
    purpose <> 'sales_order' OR so_line_id IS NOT NULL
  ),
  -- ...and one that is for stock must not, or the lineage lies.
  CONSTRAINT oc_allocation_stock_has_no_so_line CHECK (
    purpose <> 'stock' OR so_line_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_oc_allocations_plan_line
  ON public.oc_production_allocations (plan_line_id);
CREATE INDEX IF NOT EXISTS idx_oc_allocations_so_line
  ON public.oc_production_allocations (so_line_id)
  WHERE so_line_id IS NOT NULL;

-- ------------------------------------------------------------- actuals ------
-- What the shift actually produced. The quantity CHECKs are INTEGRITY, so
-- they block (§27): accepted + rejected can never exceed gross, because that
-- describes bricks that do not exist.
CREATE TABLE IF NOT EXISTS public.oc_production_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.oc_production_shifts(id) ON DELETE CASCADE,
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'adjusted')),
  -- What the plan said WHEN the actual was recorded. Kept as a snapshot so a
  -- later plan edit cannot rewrite what the shortfall looked like on the day.
  planned_qty_snapshot NUMERIC(14,2),
  gross_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_qty >= 0),
  accepted_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (accepted_qty >= 0),
  rejected_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  deviation_reason_id UUID REFERENCES public.oc_deviation_reasons(id),
  deviation_comment TEXT,
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- §8.1: present but dormant until Odoo MO ownership is settled.
  odoo_mo_id INTEGER,
  odoo_mo_name TEXT,
  odoo_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (odoo_sync_status IN ('pending', 'synced', 'failed', 'not_applicable')),
  odoo_synced_at TIMESTAMPTZ,
  error_message TEXT,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shift_id, finished_good_id),
  CONSTRAINT oc_actual_qty_balance CHECK (accepted_qty + rejected_qty <= gross_qty),
  -- A posted row must carry its posting stamp; a draft must not pretend to.
  CONSTRAINT oc_actual_posted_stamp CHECK (
    (status = 'draft' AND posted_at IS NULL)
    OR (status <> 'draft' AND posted_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_oc_actuals_shift
  ON public.oc_production_actuals (shift_id);
CREATE INDEX IF NOT EXISTS idx_oc_actuals_status
  ON public.oc_production_actuals (status) WHERE status = 'draft';

-- --------------------------------------------------------- adjustments ------
-- §8.2: a correction to a posted actual is a DELTA row. The original stands.
CREATE TABLE IF NOT EXISTS public.oc_production_actual_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_id UUID NOT NULL
    REFERENCES public.oc_production_actuals(id) ON DELETE CASCADE,
  delta_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta_accepted NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta_rejected NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oc_adjustment_not_empty CHECK (
    delta_gross <> 0 OR delta_accepted <> 0 OR delta_rejected <> 0
  )
);

CREATE INDEX IF NOT EXISTS idx_oc_actual_adjustments
  ON public.oc_production_actual_adjustments (actual_id);

-- -------------------------------------------------- allocation actuals ------
-- WHICH sales order the output actually went to. This row is the lineage
-- anchor: a reservation points at it, so a shortfall traces
-- reservation → allocation actual → allocation → plan line → shift → actual,
-- which is how "who is 100 bricks short?" gets a named answer.
CREATE TABLE IF NOT EXISTS public.oc_production_allocation_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_id UUID NOT NULL
    REFERENCES public.oc_production_actuals(id) ON DELETE CASCADE,
  allocation_id UUID NOT NULL
    REFERENCES public.oc_production_allocations(id),
  actual_qty NUMERIC(14,2) NOT NULL CHECK (actual_qty > 0),
  note TEXT,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actual_id, allocation_id)
);

CREATE INDEX IF NOT EXISTS idx_oc_allocation_actuals_actual
  ON public.oc_production_allocation_actuals (actual_id);

-- ------------------------------------------------------------- cement -------
-- §33: cement is recorded PER PRODUCTION LINE, never as one shift total —
-- a shift total cannot be attributed to a product and so cannot be banded.
-- The 0.5-bag step is validated in the API against oc_settings.cement_bag_step
-- because it is configurable, deliberately not a CHECK.
CREATE TABLE IF NOT EXISTS public.oc_material_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_id UUID NOT NULL
    REFERENCES public.oc_production_actuals(id) ON DELETE CASCADE,
  material TEXT NOT NULL DEFAULT 'cement',
  bags NUMERIC(6,2) NOT NULL CHECK (bags >= 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actual_id, material)
);

-- ================================================ lifecycle enforcement =====
-- §5/§8.2: a posted actual is history. Its quantities may not be edited in
-- place; a correction is an adjustment row carrying the delta. Without this
-- trigger the rule lives only in the API, and the API is not the only thing
-- that can write — a future route, a script or a console session would all
-- bypass it. The status transition itself and the Odoo acknowledgement fields
-- are the permitted changes.
CREATE OR REPLACE FUNCTION public.oc_guard_production_actual()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;  -- drafts are freely editable; that is the point of a draft
  END IF;

  IF NEW.gross_qty IS DISTINCT FROM OLD.gross_qty
     OR NEW.accepted_qty IS DISTINCT FROM OLD.accepted_qty
     OR NEW.rejected_qty IS DISTINCT FROM OLD.rejected_qty
     OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
     OR NEW.finished_good_id IS DISTINCT FROM OLD.finished_good_id THEN
    RAISE EXCEPTION
      'production actual % is % — record an adjustment instead of editing it',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_actual_posted_immutable ON public.oc_production_actuals;
CREATE TRIGGER trg_oc_actual_posted_immutable
  BEFORE UPDATE ON public.oc_production_actuals
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_production_actual();

-- The child rows of a posted actual are frozen for the same reason: changing
-- which SO the output went to, or how much cement it took, after posting
-- would silently rewrite coverage and the cement ratio for a settled day.
CREATE OR REPLACE FUNCTION public.oc_guard_posted_children()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_actual_id UUID;
  v_status TEXT;
BEGIN
  v_actual_id := COALESCE(NEW.actual_id, OLD.actual_id);
  SELECT status INTO v_status FROM oc_production_actuals WHERE id = v_actual_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'production actual % is %; its % rows are frozen',
      v_actual_id, v_status, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_oc_allocation_actuals_draft_only
  ON public.oc_production_allocation_actuals;
CREATE TRIGGER trg_oc_allocation_actuals_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.oc_production_allocation_actuals
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_posted_children();

DROP TRIGGER IF EXISTS trg_oc_consumption_draft_only ON public.oc_material_consumption;
CREATE TRIGGER trg_oc_consumption_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.oc_material_consumption
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_posted_children();

-- updated_at triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'oc_production_days', 'oc_production_shifts', 'oc_production_plan_lines',
    'oc_production_allocations', 'oc_production_actuals', 'oc_material_consumption'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- =================================================== RPC: POST an actual ====
-- §8.3 + §5 + §6. Everything POST does happens in ONE transaction:
--
--   1. verify the lock and the draft status
--   2. enforce Σ allocation actuals = accepted_qty  (the integrity rule)
--   3. write the inventory receipt, dated for curing
--   4. create a reservation for every sales-order allocation
--   5. mark the actual posted
--
-- Done as sequential API writes, a failure at step 4 leaves stock that exists
-- but is reserved for nobody, and a retry double-counts it. Both the receipt
-- and the reservations carry source keys, so the unique indexes from Phase 3
-- make a duplicate physically impossible rather than merely unlikely.
--
-- Calling POST twice is SAFE and returns the already-posted result (§6): a
-- timed-out request the operator retries must not post +900 bricks twice.
CREATE OR REPLACE FUNCTION public.oc_post_production_actual(
  p_actual_id UUID,
  p_user UUID,
  p_expected_lock INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actual RECORD;
  v_prod_date DATE;
  v_curing INTEGER;
  v_available_from DATE;
  v_assigned NUMERIC;
  v_movement_id UUID;
  v_reservations INTEGER := 0;
  v_alloc RECORD;
  v_new_res UUID;
BEGIN
  SELECT * INTO v_actual FROM oc_production_actuals
   WHERE id = p_actual_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production actual % not found', p_actual_id;
  END IF;

  -- Idempotent: a retry of a request that already succeeded is not an error,
  -- it is the same answer again.
  IF v_actual.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'already_posted', true,
      'actual_id', p_actual_id,
      'status', v_actual.status,
      'movement_id', (SELECT id FROM oc_inventory_movements
                       WHERE source_type = 'production_actual'
                         AND source_id = p_actual_id
                         AND movement_type = 'production_receipt'),
      'reservations_created', (SELECT count(*) FROM oc_stock_reservations
                                WHERE source_type = 'production_allocation_actual'
                                  AND source_id IN (
                                    SELECT id FROM oc_production_allocation_actuals
                                     WHERE actual_id = p_actual_id)));
  END IF;

  IF v_actual.lock_version IS DISTINCT FROM p_expected_lock THEN
    RAISE EXCEPTION 'lock_version mismatch (expected %, have %)',
      p_expected_lock, v_actual.lock_version USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_actual.accepted_qty <= 0 THEN
    RAISE EXCEPTION 'cannot post an actual with no accepted output';
  END IF;

  -- THE integrity rule of §5: every accepted brick must be assigned to an
  -- allocation. The UI offers "allocate the remaining N to Stock" when this
  -- is short; it does not let the operator post an unexplained remainder.
  SELECT COALESCE(sum(actual_qty), 0) INTO v_assigned
    FROM oc_production_allocation_actuals WHERE actual_id = p_actual_id;
  IF v_assigned <> v_actual.accepted_qty THEN
    RAISE EXCEPTION
      'allocation actuals total % but accepted output is % — assign the difference before posting',
      v_assigned, v_actual.accepted_qty;
  END IF;

  SELECT d.prod_date INTO v_prod_date
    FROM oc_production_shifts s
    JOIN oc_production_days d ON d.id = s.day_id
   WHERE s.id = v_actual.shift_id;

  -- Curing is what makes accepted output undispatchable, so we refuse to
  -- guess it. Defaulting to 0 would promise bricks a week early; defaulting
  -- to some arbitrary number would be a fiction. Configure the product.
  SELECT curing_days INTO v_curing
    FROM product_planning_params WHERE finished_good_id = v_actual.finished_good_id;
  IF v_curing IS NULL THEN
    RAISE EXCEPTION
      'no curing_days configured for product % — set it in product_planning_params before posting',
      v_actual.finished_good_id;
  END IF;
  v_available_from := v_prod_date + v_curing;

  -- The receipt. UNIQUE (source_type, source_id, movement_type) is what makes
  -- a double post impossible at the database rather than in application code.
  INSERT INTO oc_inventory_movements
    (movement_type, finished_good_id, quantity, movement_date, available_from,
     source_type, source_id, odoo_sync_status, created_by)
  VALUES ('production_receipt', v_actual.finished_good_id, v_actual.accepted_qty,
          v_prod_date, v_available_from, 'production_actual', p_actual_id,
          'pending', p_user)
  RETURNING id INTO v_movement_id;

  -- §4: reservations are created NOW, not when curing finishes. Bricks made
  -- today for SO-A are spoken for from this moment, or another planner
  -- earmarks them for SO-B during the seven days they sit curing. They carry
  -- the receipt's available_from, so they are Reserved-Curing until then.
  FOR v_alloc IN
    SELECT aa.id AS allocation_actual_id, aa.actual_qty, a.so_line_id
      FROM oc_production_allocation_actuals aa
      JOIN oc_production_allocations a ON a.id = aa.allocation_id
     WHERE aa.actual_id = p_actual_id AND a.purpose = 'sales_order'
  LOOP
    INSERT INTO oc_stock_reservations
      (so_line_id, finished_good_id, quantity, available_from, status,
       source_type, source_id, created_by)
    VALUES (v_alloc.so_line_id, v_actual.finished_good_id, v_alloc.actual_qty,
            v_available_from, 'active', 'production_allocation_actual',
            v_alloc.allocation_actual_id, p_user)
    RETURNING id INTO v_new_res;
    v_reservations := v_reservations + 1;
  END LOOP;

  UPDATE oc_production_actuals
     SET status = 'posted', posted_at = now(), posted_by = p_user,
         lock_version = lock_version + 1
   WHERE id = p_actual_id;

  INSERT INTO oc_audit_events
    (entity, entity_id, action, before_value, after_value, performed_by)
  VALUES ('oc_production_actuals', p_actual_id::text, 'posted',
          jsonb_build_object('status', 'draft'),
          jsonb_build_object('status', 'posted',
                             'accepted_qty', v_actual.accepted_qty,
                             'movement_id', v_movement_id,
                             'available_from', v_available_from,
                             'reservations_created', v_reservations),
          p_user);

  RETURN jsonb_build_object(
    'already_posted', false,
    'actual_id', p_actual_id,
    'status', 'posted',
    'movement_id', v_movement_id,
    'available_from', v_available_from,
    'reservations_created', v_reservations);
END $$;

REVOKE ALL ON FUNCTION public.oc_post_production_actual(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_post_production_actual(UUID, UUID, INTEGER)
  TO service_role;

-- -------------------------------------------------------- RLS + policies ----
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'oc_production_days', 'oc_production_shifts', 'oc_production_plan_lines',
    'oc_production_allocations', 'oc_production_actuals',
    'oc_production_actual_adjustments', 'oc_production_allocation_actuals',
    'oc_material_consumption'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;
END $$;
