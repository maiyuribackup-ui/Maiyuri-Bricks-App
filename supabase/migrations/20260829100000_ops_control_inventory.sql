-- ============================================================================
-- Operations Control (oc_) — Phase 3: inventory ledger, reservations,
-- coverage and readiness.
--
-- PRD: "Production, Fulfilment & Dispatch Control" v1.0
--   §3     inventory authority contract
--   §4     reservations survive curing
--   §6     idempotency
--   §8.3   atomicity through RPCs
--   §86    reconciliation rather than inventing inventory
--
-- THE INVENTORY AUTHORITY CONTRACT (the rule everything here obeys):
--
--   Odoo owns the QUANTITY.       finished_goods.stock_qty mirrors
--                                 Odoo's qty_available.
--   OC owns the EXPLANATION.      why stock changed, when it becomes
--                                 dispatchable, which SO it belongs to.
--
-- OC therefore never claims 8,300 bricks exist because its own ledger says so
-- when Odoo says 8,000. Drift between the two is surfaced as an exception to
-- investigate (oc_inventory_movements.movement_type='reconciliation'), never
-- silently adopted as truth. This is what keeps OC an operational control
-- layer rather than a second, competing stock ledger.
--
-- Derived quantities (computed in src/lib/ops-control/inventory.ts, never
-- stored, so they cannot drift from their inputs):
--
--   Physical On Hand = Odoo qty_available                     (authoritative)
--   Curing           = Σ synced receipts with available_from > today
--   Ready Physical   = Physical On Hand − Curing
--   Reserved Ready   = reservations backed by dispatch-eligible stock
--   Free Ready       = Ready Physical − Reserved Ready
--
-- Design rules carried from review:
--  * RESERVATIONS SURVIVE CURING (§4). Bricks produced today for SO-A are
--    earmarked the moment production is posted, even though they cannot ship
--    for seven days — otherwise another planner reserves them for SO-B in the
--    meantime. A reservation therefore carries available_from, giving four
--    buckets: Reserved-Curing, Reserved-Ready, Free-Curing, Free-Ready.
--  * IDEMPOTENCY (§6). A timed-out request the frontend retries must not
--    post +900 twice. UNIQUE (source_type, source_id, movement_type) makes a
--    duplicate receipt impossible at the database, not merely unlikely.
--  * APPEND-ONLY. Movements are never updated or deleted; a correction is a
--    new movement carrying the delta (§8.2). A trigger enforces this, because
--    the API writes as service role and RLS cannot protect against a future
--    route or a manual script.
--  * ATOMIC TRANSFER (§8.3). Moving a reservation from SO-A to SO-B is one
--    transaction: optimistic locking alone would let the release succeed and
--    the create fail, losing 900 bricks from SO-A that SO-B never received.
--
-- Conventions as the Phase 1/2 migrations: RLS auth-read only, shared
-- set_updated_at() trigger, every write through a service-role route.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------------------------------------------------- inventory movements ---
-- OC's side of the authority contract: an append-only record of WHY stock
-- changed. Quantities are signed (receipts +, issues −) so the ledger sums
-- directly, and every row that came from an operational event carries the
-- identity of that event for idempotency and lineage.
CREATE TABLE IF NOT EXISTS public.oc_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'opening',             -- one-time starting position per product
    'production_receipt',  -- posted production actual (Phase 4)
    'delivery_issue',      -- everything that left on a vehicle (Phase 5)
    'delivery_return',     -- what came back into stock (Phase 5)
    'adjustment',          -- deliberate correction; reason required
    'reconciliation'       -- accepted an investigated drift; reason required
  )),
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id),
  -- Signed: receipts positive, issues negative. Zero is never a movement.
  quantity NUMERIC(14,2) NOT NULL CHECK (quantity <> 0),
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Receipts: movement_date + the product's curing_days. NULL means
  -- immediately dispatchable (issues, returns, opening stock already cured).
  available_from DATE,
  -- The operational event this movement explains. Both NULL for a manual
  -- opening/adjustment, which is why the idempotency index is partial.
  source_type TEXT CHECK (source_type IN (
    'production_actual', 'production_allocation_actual', 'trip_load_line', 'manual'
  )),
  source_id UUID,
  -- Odoo write-back acknowledgement (§3.4). 'not_applicable' for movements
  -- that never travel to Odoo, e.g. a reconciliation recording OC's drift.
  odoo_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (odoo_sync_status IN ('pending', 'synced', 'failed', 'not_applicable')),
  odoo_reference TEXT,
  odoo_synced_at TIMESTAMPTZ,
  error_message TEXT,
  -- Required on adjustments and reconciliations: a quantity correction with
  -- no stated reason is indistinguishable from a mistake.
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oc_movement_reason_required CHECK (
    movement_type NOT IN ('adjustment', 'reconciliation')
    OR (reason IS NOT NULL AND length(trim(reason)) > 0)
  ),
  -- A receipt is the only movement that can be curing; it must say from when.
  CONSTRAINT oc_movement_receipt_available_from CHECK (
    movement_type <> 'production_receipt' OR available_from IS NOT NULL
  )
);

-- §6: the same operational event can produce at most ONE movement of a given
-- type. A retried post finds the row already there instead of doubling stock.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_movement_source
  ON public.oc_inventory_movements (source_type, source_id, movement_type)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oc_movements_product_date
  ON public.oc_inventory_movements (finished_good_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_oc_movements_curing
  ON public.oc_inventory_movements (finished_good_id, available_from)
  WHERE available_from IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_movements_sync
  ON public.oc_inventory_movements (odoo_sync_status)
  WHERE odoo_sync_status = 'pending';

-- Append-only (§8.2). A posted movement is history: the correction for
-- "we counted 1,200 but it was 1,150" is a new −50 movement, not a rewrite,
-- because last week's labour may already have been paid against the 1,200.
-- Odoo write-back columns are the one exception — acknowledgement is not a
-- change to what happened.
CREATE OR REPLACE FUNCTION public.oc_guard_inventory_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inventory movements are append-only; post a correcting movement instead'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.movement_type IS DISTINCT FROM OLD.movement_type
     OR NEW.finished_good_id IS DISTINCT FROM OLD.finished_good_id
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.movement_date IS DISTINCT FROM OLD.movement_date
     OR NEW.available_from IS DISTINCT FROM OLD.available_from
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
    RAISE EXCEPTION 'inventory movements are append-only; only Odoo sync fields may change'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_movement_append_only ON public.oc_inventory_movements;
CREATE TRIGGER trg_oc_movement_append_only
  BEFORE UPDATE OR DELETE ON public.oc_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_inventory_movement();

-- -------------------------------------------------------- reservations ------
-- Which SO line a quantity is earmarked for, and from when it can actually
-- ship. Created at production POST (Phase 4), consumed at delivery COMPLETE
-- (Phase 5), transferable between SO lines in one transaction.
CREATE TABLE IF NOT EXISTS public.oc_stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_line_id UUID NOT NULL REFERENCES public.oc_sales_order_lines(id),
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id),
  quantity NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  -- §4: inherited from the backing receipt. A reservation exists from the
  -- moment production is posted; this is when it becomes DISPATCHABLE.
  -- NULL = ready now (reserved out of existing free-ready stock).
  available_from DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'consumed')),
  -- Lineage (§8.2): an auto-created reservation points at the allocation
  -- actual that produced it, so a shortfall traces reservation → actual
  -- allocation → plan line → shift → production actual.
  source_type TEXT CHECK (source_type IN ('production_allocation_actual', 'manual')),
  source_id UUID,
  reason TEXT,
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §6: one auto-created reservation per allocation actual per SO line. Manual
-- reservations are excluded — a planner may legitimately reserve twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_reservation_source
  ON public.oc_stock_reservations (source_type, source_id, so_line_id)
  WHERE source_type = 'production_allocation_actual';

CREATE INDEX IF NOT EXISTS idx_oc_reservations_so_line
  ON public.oc_stock_reservations (so_line_id, status);
CREATE INDEX IF NOT EXISTS idx_oc_reservations_product
  ON public.oc_stock_reservations (finished_good_id, status);

DROP TRIGGER IF EXISTS trg_oc_reservations_updated_at ON public.oc_stock_reservations;
CREATE TRIGGER trg_oc_reservations_updated_at
  BEFORE UPDATE ON public.oc_stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------- RPC: transfer a reservation ----
-- §8.3: release from one SO line and create on another, atomically. Done as
-- two API calls, a failure between them loses stock from the source line that
-- the destination never receives. The lock_version check makes a concurrent
-- edit fail loudly rather than silently overwrite.
--
-- The transferred quantity keeps its available_from: moving an earmark between
-- customers does not make curing bricks dispatchable any sooner.
CREATE OR REPLACE FUNCTION public.oc_transfer_reservation(
  p_reservation_id UUID,
  p_to_so_line_id UUID,
  p_quantity NUMERIC,
  p_user UUID,
  p_reason TEXT,
  p_expected_lock INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src RECORD;
  v_dest_line RECORD;
  v_new_id UUID;
  v_remaining NUMERIC;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'transfer quantity must be greater than zero';
  END IF;

  SELECT * INTO v_src FROM oc_stock_reservations
   WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation % not found', p_reservation_id;
  END IF;
  IF v_src.lock_version IS DISTINCT FROM p_expected_lock THEN
    RAISE EXCEPTION 'lock_version mismatch (expected %, have %)',
      p_expected_lock, v_src.lock_version USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_src.status <> 'active' THEN
    RAISE EXCEPTION 'only an active reservation can be transferred (status is %)', v_src.status;
  END IF;
  IF p_quantity > v_src.quantity THEN
    RAISE EXCEPTION 'cannot transfer % from a reservation of %', p_quantity, v_src.quantity;
  END IF;

  -- The destination must be a real, active, demand-bearing line: transferring
  -- onto a service line would earmark bricks against "Loading".
  SELECT * INTO v_dest_line FROM oc_sales_order_lines WHERE id = p_to_so_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'destination sales order line % not found', p_to_so_line_id;
  END IF;
  IF NOT v_dest_line.source_active OR NOT v_dest_line.is_demand THEN
    RAISE EXCEPTION 'destination line is not an active demand line';
  END IF;
  IF v_dest_line.finished_good_id IS DISTINCT FROM v_src.finished_good_id THEN
    RAISE EXCEPTION 'destination line is for a different product';
  END IF;
  IF p_to_so_line_id = v_src.so_line_id THEN
    RAISE EXCEPTION 'source and destination sales order line are the same';
  END IF;

  v_remaining := v_src.quantity - p_quantity;

  IF v_remaining = 0 THEN
    UPDATE oc_stock_reservations
       SET status = 'released', released_at = now(),
           reason = COALESCE(p_reason, reason),
           lock_version = lock_version + 1
     WHERE id = p_reservation_id;
  ELSE
    UPDATE oc_stock_reservations
       SET quantity = v_remaining, lock_version = lock_version + 1
     WHERE id = p_reservation_id;
  END IF;

  INSERT INTO oc_stock_reservations
    (so_line_id, finished_good_id, quantity, available_from, status,
     source_type, source_id, reason, created_by)
  VALUES (p_to_so_line_id, v_src.finished_good_id, p_quantity, v_src.available_from,
          'active', 'manual', NULL, p_reason, p_user)
  RETURNING id INTO v_new_id;

  INSERT INTO oc_audit_events (entity, entity_id, action, before_value, after_value, performed_by, reason)
  VALUES ('oc_stock_reservations', p_reservation_id::text, 'transferred',
          jsonb_build_object('so_line_id', v_src.so_line_id, 'quantity', v_src.quantity),
          jsonb_build_object('to_so_line_id', p_to_so_line_id, 'quantity', p_quantity,
                             'new_reservation_id', v_new_id, 'remaining', v_remaining),
          p_user, p_reason);

  RETURN jsonb_build_object(
    'new_reservation_id', v_new_id,
    'source_remaining', v_remaining,
    'source_released', v_remaining = 0);
END $$;

REVOKE ALL ON FUNCTION public.oc_transfer_reservation(UUID, UUID, NUMERIC, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_transfer_reservation(UUID, UUID, NUMERIC, UUID, TEXT, INTEGER)
  TO service_role;

-- -------------------------------------------------------- RLS + policies ----
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['oc_inventory_movements', 'oc_stock_reservations']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;
END $$;
