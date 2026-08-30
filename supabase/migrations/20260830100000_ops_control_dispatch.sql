-- ============================================================================
-- Operations Control (oc_) — Phase 5: trips, load plans and delivery actuals.
--
-- PRD: "Production, Fulfilment & Dispatch Control" v1.0
--   §6     idempotency
--   §7     inventory movement ≠ customer delivered quantity
--   §8.1   Odoo picking ownership (write-back stays OFF)
--   §8.2   adjustments preserve history
--   §8.3   atomicity through RPCs
--   §41-56 trip planning, capacity warnings, delivery actuals
--   §72/73 warnings warn; integrity failures block
--
-- THE DISTINCTION THIS PHASE EXISTS TO MAKE (§7):
--
--   Loaded 900 · customer accepted 850 · returned to factory 20 · damaged 30
--
--     delivery_issue        −900   everything that left the factory
--     delivery_return        +20   what physically came back
--     net inventory impact  −880   the 30 damaged no longer exist
--     customer fulfilment   +850   what the customer actually got
--
--   Damaged stock is a CLASSIFICATION on the load line, not a return
--   movement. The physical loss is already captured by "it left and did not
--   come back"; recording it as a return as well would put 30 bricks back on
--   the shelf that are lying broken in a yard. It is reported separately for
--   quality and cost analysis.
--
-- EVERY LOADED BRICK MUST BE ACCOUNTED FOR. Completion is refused unless
--
--   loaded = unloaded + returned + damaged + lost_or_short
--
-- Loaded 900 / delivered 820 / returned 20 / damaged 30 leaves 30 bricks
-- unexplained, and the operator must classify them — including as an explicit
-- shortage. A draft may remain incomplete while the driver is still
-- reporting; completion may not. Planning exceptions warn (§72/73); physical
-- reconciliation blocks (§27).
--
-- ODOO PICKING WRITE-BACK IS OFF, as for production (§8.1). The columns exist
-- and default to 'pending'. Until it is enabled, OC shows its own operational
-- numbers and marks them "Odoo sync pending" — Odoo remains the authority for
-- commercial SO fulfilment (qty_delivered), which comes back through the
-- demand sync.
-- ============================================================================

-- --------------------------------------------------------------- trips ------
CREATE TABLE IF NOT EXISTS public.oc_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_date DATE NOT NULL,
  trip_no INTEGER NOT NULL CHECK (trip_no > 0),
  vehicle_id UUID REFERENCES public.oc_vehicles(id),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'dispatched', 'completed', 'cancelled')),
  departed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  -- §54: more than the normal trips per day is a WARNING, not a block. The
  -- reason is stored so "why did we run a third trip on the 12th?" has an
  -- answer that outlives the person who authorised it.
  override_reason TEXT,
  override_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_date, trip_no)
);

CREATE INDEX IF NOT EXISTS idx_oc_trips_date ON public.oc_trips (trip_date DESC);

-- --------------------------------------------------------------- stops ------
-- Where the vehicle goes, in order. A stop is a customer site, so the trip
-- sheet reads as a route rather than a list of order numbers.
CREATE TABLE IF NOT EXISTS public.oc_trip_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.oc_trips(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  odoo_partner_id INTEGER,
  customer_name TEXT,
  site_location_id UUID REFERENCES public.oc_site_locations(id),
  schedule_line_id UUID REFERENCES public.oc_delivery_schedule_lines(id),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'delivered', 'skipped')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_oc_trip_stops_trip ON public.oc_trip_stops (trip_id);

-- ---------------------------------------------------------- load lines ------
-- What is on the vehicle for that stop, and what became of it.
--
-- The five actual quantities are the heart of §7. They are nullable while the
-- driver is still reporting and become mandatory-in-aggregate at COMPLETE,
-- where the reconciliation identity is enforced by the RPC.
CREATE TABLE IF NOT EXISTS public.oc_trip_load_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID NOT NULL REFERENCES public.oc_trip_stops(id) ON DELETE CASCADE,
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id),
  so_line_id UUID REFERENCES public.oc_sales_order_lines(id),
  planned_qty NUMERIC(14,2) NOT NULL CHECK (planned_qty > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'adjusted')),
  -- everything that left the factory on the vehicle
  actual_loaded_qty NUMERIC(14,2) CHECK (actual_loaded_qty IS NULL OR actual_loaded_qty >= 0),
  -- what the customer accepted — drives fulfilment, NOT inventory
  actual_unloaded_qty NUMERIC(14,2) CHECK (actual_unloaded_qty IS NULL OR actual_unloaded_qty >= 0),
  -- what physically came back and can be sold again
  returned_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
  -- broken in transit or on site: gone, but NOT a return movement
  damaged_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  -- the explicit "we cannot account for these" bucket, so completion is never
  -- blocked by an operator with no honest option
  lost_or_short_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (lost_or_short_qty >= 0),
  deviation_reason_id UUID REFERENCES public.oc_deviation_reasons(id),
  deviation_comment TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- §8.1: present but dormant until Odoo picking ownership is settled.
  odoo_picking_id INTEGER,
  odoo_picking_name TEXT,
  odoo_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (odoo_sync_status IN ('pending', 'synced', 'failed', 'not_applicable')),
  odoo_synced_at TIMESTAMPTZ,
  error_message TEXT,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A completed row must carry its stamp; a draft must not pretend to.
  CONSTRAINT oc_load_line_completed_stamp CHECK (
    (status = 'draft' AND completed_at IS NULL)
    OR (status <> 'draft' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_oc_load_lines_stop ON public.oc_trip_load_lines (stop_id);
CREATE INDEX IF NOT EXISTS idx_oc_load_lines_so_line
  ON public.oc_trip_load_lines (so_line_id) WHERE so_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_load_lines_draft
  ON public.oc_trip_load_lines (status) WHERE status = 'draft';

-- --------------------------------------------------------- adjustments ------
-- §8.2, the delivery counterpart of the production adjustment: a completed
-- delivery is history, and a correction is a delta row.
CREATE TABLE IF NOT EXISTS public.oc_delivery_actual_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_line_id UUID NOT NULL
    REFERENCES public.oc_trip_load_lines(id) ON DELETE CASCADE,
  delta_loaded NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta_unloaded NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta_returned NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta_damaged NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta_lost_or_short NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oc_delivery_adjustment_not_empty CHECK (
    delta_loaded <> 0 OR delta_unloaded <> 0 OR delta_returned <> 0
    OR delta_damaged <> 0 OR delta_lost_or_short <> 0
  )
);

CREATE INDEX IF NOT EXISTS idx_oc_delivery_adjustments
  ON public.oc_delivery_actual_adjustments (load_line_id);

-- ================================================ lifecycle enforcement =====
-- A completed load line is history: its quantities are corrected by a delta
-- row, never edited. Same reasoning as production (§8.2) — loading labour may
-- already have been paid against the recorded loaded quantity.
CREATE OR REPLACE FUNCTION public.oc_guard_load_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.actual_loaded_qty IS DISTINCT FROM OLD.actual_loaded_qty
     OR NEW.actual_unloaded_qty IS DISTINCT FROM OLD.actual_unloaded_qty
     OR NEW.returned_qty IS DISTINCT FROM OLD.returned_qty
     OR NEW.damaged_qty IS DISTINCT FROM OLD.damaged_qty
     OR NEW.lost_or_short_qty IS DISTINCT FROM OLD.lost_or_short_qty
     OR NEW.stop_id IS DISTINCT FROM OLD.stop_id
     OR NEW.finished_good_id IS DISTINCT FROM OLD.finished_good_id THEN
    RAISE EXCEPTION
      'load line % is % — record an adjustment instead of editing it',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_load_line_completed_immutable ON public.oc_trip_load_lines;
CREATE TRIGGER trg_oc_load_line_completed_immutable
  BEFORE UPDATE ON public.oc_trip_load_lines
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_load_line();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['oc_trips', 'oc_trip_stops', 'oc_trip_load_lines']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ============================================ RPC: COMPLETE a load line =====
-- §7 + §8.3 + §6. One transaction:
--
--   1. verify the lock and the draft status
--   2. BLOCK unless loaded = unloaded + returned + damaged + lost_or_short
--   3. write delivery_issue  (−loaded)   everything that left
--   4. write delivery_return (+returned) only what physically came back
--   5. consume the reservation that backed this line
--   6. mark the line completed
--
-- Damaged and lost quantities generate NO movement of their own: the issue
-- already removed them from stock and they are not coming back. Writing a
-- return for damaged stock would restore bricks that are lying broken in a
-- yard.
--
-- Safe to call twice (§6): a retried request returns the already-completed
-- result rather than issuing the stock a second time.
CREATE OR REPLACE FUNCTION public.oc_complete_delivery_line(
  p_load_line_id UUID,
  p_user UUID,
  p_expected_lock INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line RECORD;
  v_trip_date DATE;
  v_accounted NUMERIC;
  v_issue_id UUID;
  v_return_id UUID;
  v_consumed INTEGER := 0;
BEGIN
  SELECT * INTO v_line FROM oc_trip_load_lines
   WHERE id = p_load_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'load line % not found', p_load_line_id;
  END IF;

  -- Idempotent: the same answer again, not a second issue of stock.
  IF v_line.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'load_line_id', p_load_line_id,
      'status', v_line.status,
      'issue_movement_id', (SELECT id FROM oc_inventory_movements
                             WHERE source_type = 'trip_load_line'
                               AND source_id = p_load_line_id
                               AND movement_type = 'delivery_issue'),
      'return_movement_id', (SELECT id FROM oc_inventory_movements
                              WHERE source_type = 'trip_load_line'
                                AND source_id = p_load_line_id
                                AND movement_type = 'delivery_return'));
  END IF;

  IF v_line.lock_version IS DISTINCT FROM p_expected_lock THEN
    RAISE EXCEPTION 'lock_version mismatch (expected %, have %)',
      p_expected_lock, v_line.lock_version USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_line.actual_loaded_qty IS NULL OR v_line.actual_unloaded_qty IS NULL THEN
    RAISE EXCEPTION 'record the loaded and unloaded quantities before completing';
  END IF;
  IF v_line.actual_loaded_qty <= 0 THEN
    RAISE EXCEPTION 'cannot complete a delivery with nothing loaded';
  END IF;

  -- THE reconciliation identity. Every loaded brick must be accounted for:
  -- delivered, returned, damaged, or explicitly recorded as short. This is
  -- physical integrity, so it BLOCKS — unlike the capacity warnings, which
  -- only warn.
  v_accounted := v_line.actual_unloaded_qty + v_line.returned_qty
                 + v_line.damaged_qty + v_line.lost_or_short_qty;
  IF v_accounted <> v_line.actual_loaded_qty THEN
    RAISE EXCEPTION
      'loaded % but only % accounted for (unloaded % + returned % + damaged % + short %) — classify the remaining % before completing',
      v_line.actual_loaded_qty, v_accounted, v_line.actual_unloaded_qty,
      v_line.returned_qty, v_line.damaged_qty, v_line.lost_or_short_qty,
      v_line.actual_loaded_qty - v_accounted;
  END IF;

  SELECT t.trip_date INTO v_trip_date
    FROM oc_trip_stops s JOIN oc_trips t ON t.id = s.trip_id
   WHERE s.id = v_line.stop_id;

  -- Everything that left the factory. available_from is NULL: stock leaving
  -- has no curing question, and issues are never "curing".
  INSERT INTO oc_inventory_movements
    (movement_type, finished_good_id, quantity, movement_date, available_from,
     source_type, source_id, odoo_sync_status, created_by)
  VALUES ('delivery_issue', v_line.finished_good_id, -v_line.actual_loaded_qty,
          v_trip_date, NULL, 'trip_load_line', p_load_line_id, 'pending', p_user)
  RETURNING id INTO v_issue_id;

  -- Only what physically came back. Damaged stock is deliberately absent.
  IF v_line.returned_qty > 0 THEN
    INSERT INTO oc_inventory_movements
      (movement_type, finished_good_id, quantity, movement_date, available_from,
       source_type, source_id, odoo_sync_status, created_by)
    VALUES ('delivery_return', v_line.finished_good_id, v_line.returned_qty,
            v_trip_date, NULL, 'trip_load_line', p_load_line_id, 'pending', p_user)
    RETURNING id INTO v_return_id;
  END IF;

  -- The reservation that backed this delivery is consumed, not released: the
  -- bricks went to the customer they were earmarked for. Released would put
  -- them back in Free-Ready, which is exactly wrong.
  IF v_line.so_line_id IS NOT NULL THEN
    UPDATE oc_stock_reservations
       SET status = 'consumed', consumed_at = now(), lock_version = lock_version + 1
     WHERE so_line_id = v_line.so_line_id
       AND finished_good_id = v_line.finished_good_id
       AND status = 'active';
    GET DIAGNOSTICS v_consumed = ROW_COUNT;
  END IF;

  UPDATE oc_trip_load_lines
     SET status = 'completed', completed_at = now(), completed_by = p_user,
         lock_version = lock_version + 1
   WHERE id = p_load_line_id;

  INSERT INTO oc_audit_events
    (entity, entity_id, action, before_value, after_value, performed_by)
  VALUES ('oc_trip_load_lines', p_load_line_id::text, 'completed',
          jsonb_build_object('status', 'draft'),
          jsonb_build_object(
            'status', 'completed',
            'loaded', v_line.actual_loaded_qty,
            'unloaded', v_line.actual_unloaded_qty,
            'returned', v_line.returned_qty,
            'damaged', v_line.damaged_qty,
            'lost_or_short', v_line.lost_or_short_qty,
            'net_inventory_impact', v_line.returned_qty - v_line.actual_loaded_qty,
            'customer_fulfilment', v_line.actual_unloaded_qty,
            'reservations_consumed', v_consumed),
          p_user);

  RETURN jsonb_build_object(
    'already_completed', false,
    'load_line_id', p_load_line_id,
    'status', 'completed',
    'issue_movement_id', v_issue_id,
    'return_movement_id', v_return_id,
    -- The two numbers the PRD insists are different facts.
    'net_inventory_impact', v_line.returned_qty - v_line.actual_loaded_qty,
    'customer_fulfilment', v_line.actual_unloaded_qty,
    'reservations_consumed', v_consumed);
END $$;

REVOKE ALL ON FUNCTION public.oc_complete_delivery_line(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_complete_delivery_line(UUID, UUID, INTEGER)
  TO service_role;

-- -------------------------------------------------------- RLS + policies ----
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'oc_trips', 'oc_trip_stops', 'oc_trip_load_lines',
    'oc_delivery_actual_adjustments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;
END $$;
