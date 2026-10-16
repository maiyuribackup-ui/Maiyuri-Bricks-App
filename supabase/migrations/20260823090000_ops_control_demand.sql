-- ============================================================================
-- Operations Control (oc_) — Phase 2: demand, product mapping workflow,
-- delivery schedules.
--
-- PRD: "Production, Fulfilment & Dispatch Control" v1.0
--   §9-11   open SO backlog, SO line as the planning unit, fulfilment statuses
--   §12-15  delivery schedules, versioning, customer confirmation, PDF
--   §51     site location data
--   §85-86  Odoo sync requirements, staleness visibility
--
-- Design rules carried from review:
--  * Odoo SO lines that have entered operational history are NEVER physically
--    deleted. Sync soft-retires unseen rows (source_active=false) via ONE
--    transactional RPC, so a half-failed sync can never mix snapshots.
--  * A schedule version's business content freezes the moment it leaves
--    'draft' — enforced by a DATABASE trigger, not just the API, because the
--    API runs as service role and RLS cannot protect against a future route.
--  * Customer-facing data (names, site, contact) is SNAPSHOTTED per version:
--    the PDF reads only the snapshot + lines, so editing a site master later
--    can never rewrite what a confirmed version told the customer.
--  * Two version pointers: latest_version_id (working) and
--    active_confirmed_version_id (the standing customer commitment). Both are
--    composite FKs so a pointer can only reference a version of ITS OWN
--    schedule. At most ONE open working version (draft/sent/
--    revision_requested) exists per schedule.
--  * A schedule line can only reference an SO line of the SAME Odoo order
--    (composite FK) — a schedule for SO-A physically cannot borrow SO-B's line.
--
-- Conventions as 20260822090000_ops_control_masters.sql: RLS auth-read only,
-- shared set_updated_at() trigger, all writes through service-role routes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ------------------------------------------------------------ sync runs -----
-- Observability ("did the 00:20 sync actually complete?") and concurrency
-- (one active demand sync at a time; the API refuses a new run while another
-- is 'running' and younger than 10 minutes, so a crashed run cannot deadlock
-- syncing forever).
CREATE TABLE IF NOT EXISTS public.oc_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'demand' CHECK (kind IN ('demand')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'cron')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  orders_fetched INTEGER,
  pages_fetched INTEGER,
  lines_fetched INTEGER,
  demand_lines INTEGER,
  service_note_lines INTEGER,
  unmapped_lines INTEGER,
  retired_lines INTEGER,
  error TEXT,
  triggered_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_sync_runs_recent
  ON public.oc_sync_runs (kind, started_at DESC);

-- ------------------------------------------------------ sales order lines ---
-- The PRD's planning unit (§9.2), one row per Odoo sale.order.line.
-- UNIQUE (id, odoo_order_id) anchors the composite FK from schedule lines.
CREATE TABLE IF NOT EXISTS public.oc_sales_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_line_id INTEGER NOT NULL UNIQUE,
  odoo_order_id INTEGER NOT NULL,
  order_name TEXT NOT NULL,
  odoo_partner_id INTEGER,              -- identity; the name is a display snapshot
  partner_name TEXT,
  odoo_product_id INTEGER,
  product_name TEXT,
  display_type TEXT,                    -- Odoo's own: line_section / line_note / NULL
  finished_good_id UUID REFERENCES public.finished_goods(id),
  line_kind TEXT NOT NULL CHECK (line_kind IN ('product', 'service', 'note', 'unmapped')),
  is_demand BOOLEAN NOT NULL DEFAULT false,
  qty_ordered NUMERIC(14,2) NOT NULL DEFAULT 0,
  qty_delivered NUMERIC(14,2) NOT NULL DEFAULT 0,
  uom TEXT,
  order_state TEXT,
  date_order TIMESTAMPTZ,
  -- soft-retire: rows referenced by operational history are never deleted
  source_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  source_removed_at TIMESTAMPTZ,
  sync_run_id UUID REFERENCES public.oc_sync_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, odoo_order_id)
);
CREATE INDEX IF NOT EXISTS idx_oc_so_lines_order ON public.oc_sales_order_lines (odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_oc_so_lines_demand
  ON public.oc_sales_order_lines (line_kind, is_demand, source_active);
CREATE INDEX IF NOT EXISTS idx_oc_so_lines_fg ON public.oc_sales_order_lines (finished_good_id);
CREATE INDEX IF NOT EXISTS idx_oc_so_lines_product ON public.oc_sales_order_lines (odoo_product_id);

-- -------------------------------------------------------- site locations ----
-- PRD §51: stored from V1, route optimisation deferred. odoo_partner_id keys
-- the site to a customer identity; names are display text.
CREATE TABLE IF NOT EXISTS public.oc_site_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_partner_id INTEGER,
  customer_name TEXT NOT NULL,
  site_name TEXT,
  address TEXT,
  gmaps_url TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  contact_name TEXT,
  phone TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oc_site_locations_partner
  ON public.oc_site_locations (odoo_partner_id);

-- ------------------------------------------------------------ schedules -----
CREATE TABLE IF NOT EXISTS public.oc_delivery_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_order_id INTEGER NOT NULL UNIQUE,
  order_name TEXT NOT NULL,
  odoo_partner_id INTEGER,
  customer_name TEXT,
  site_location_id UUID REFERENCES public.oc_site_locations(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'confirmed', 'in_progress', 'completed',
                      'revision_requested', 'cancelled')),
  -- latest = the working version; active_confirmed = the standing customer
  -- commitment. Composite FKs added below, after the versions table exists.
  latest_version_id UUID,
  active_confirmed_version_id UUID,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, odoo_order_id)
);

CREATE TABLE IF NOT EXISTS public.oc_delivery_schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.oc_delivery_schedules(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'confirmed', 'revision_requested',
                      'superseded', 'cancelled')),
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmation_note TEXT,
  revision_reason TEXT,
  -- Customer-facing commitment snapshot, captured at version creation:
  -- {order_name, odoo_partner_id, customer_name, site_name, address,
  --  gmaps_url, contact_name, phone}. The PDF reads ONLY this + the lines.
  customer_snapshot JSONB NOT NULL DEFAULT '{}',
  -- PRD over-scheduling override, stored on the version itself so "why did we
  -- promise 5,000 against 4,500?" is answerable without mining audit events.
  overschedule_override_reason TEXT,
  overschedule_override_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  overschedule_override_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, version_no),
  UNIQUE (id, schedule_id)              -- anchor for the composite pointer FKs
);

-- At most ONE open working version per schedule: a draft V3 cannot be opened
-- while V2 is still sent/awaiting the customer — V2 must close first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_sched_one_open_version
  ON public.oc_delivery_schedule_versions (schedule_id)
  WHERE status IN ('draft', 'sent', 'revision_requested');

-- Pointers may only reference versions of their OWN schedule; a plain FK on
-- the version id cannot enforce that relationship.
DO $$ BEGIN
  ALTER TABLE public.oc_delivery_schedules
    ADD CONSTRAINT fk_oc_sched_latest_version
    FOREIGN KEY (latest_version_id, id)
    REFERENCES public.oc_delivery_schedule_versions (id, schedule_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.oc_delivery_schedules
    ADD CONSTRAINT fk_oc_sched_active_confirmed_version
    FOREIGN KEY (active_confirmed_version_id, id)
    REFERENCES public.oc_delivery_schedule_versions (id, schedule_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.oc_delivery_schedule_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.oc_delivery_schedule_versions(id) ON DELETE CASCADE,
  so_line_id UUID NOT NULL,
  -- copied from the parent schedule; the composite FK below makes it
  -- physically impossible to schedule another order's SO line.
  odoo_order_id INTEGER NOT NULL,
  delivery_date DATE NOT NULL,
  quantity NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (so_line_id, odoo_order_id)
    REFERENCES public.oc_sales_order_lines (id, odoo_order_id)
);
CREATE INDEX IF NOT EXISTS idx_oc_sched_lines_version
  ON public.oc_delivery_schedule_lines (version_id);
CREATE INDEX IF NOT EXISTS idx_oc_sched_lines_so_line
  ON public.oc_delivery_schedule_lines (so_line_id);

-- ------------------------------------------- schedule line guard trigger ----
-- Two invariants, enforced IN THE DATABASE because the API writes as service
-- role (RLS cannot protect against a future route or script):
--  1. Lines are mutable only while their version is 'draft'. A version that
--     was sent or confirmed keeps its content forever — the PDF a customer
--     received yesterday equals its version permanently.
--  2. A line's odoo_order_id must equal its schedule's odoo_order_id (belt to
--     the composite FK's braces: the FK pins the SO line's order; this pins
--     the schedule's).
-- Deliberate side effect (verified): a schedule that has lines cannot be
-- DELETEd at all — the cascade fires this guard. Schedules are closed by
-- status ('cancelled'), never destroyed; customer history is permanent.
CREATE OR REPLACE FUNCTION public.oc_guard_schedule_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_sched_order INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT v.status INTO v_status
      FROM public.oc_delivery_schedule_versions v WHERE v.id = OLD.version_id;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'schedule version is % — its lines are immutable', v_status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  SELECT v.status, s.odoo_order_id INTO v_status, v_sched_order
    FROM public.oc_delivery_schedule_versions v
    JOIN public.oc_delivery_schedules s ON s.id = v.schedule_id
   WHERE v.id = NEW.version_id;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'schedule version is % — its lines are immutable', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.odoo_order_id IS DISTINCT FROM v_sched_order THEN
    RAISE EXCEPTION 'schedule line order % does not match the schedule''s order %',
      NEW.odoo_order_id, v_sched_order USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_schedule_line_guard ON public.oc_delivery_schedule_lines;
CREATE TRIGGER trg_oc_schedule_line_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.oc_delivery_schedule_lines
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_schedule_line();

-- ------------------------------------------------ RPC: apply demand sync ----
-- The sync's ENTIRE database application in one transaction. The Odoo fetch
-- happens outside (it cannot reasonably hold a DB transaction open); the
-- caller builds and classifies the complete snapshot, then calls this once.
-- Any failure rolls back everything: the database only ever holds a complete
-- old snapshot or a complete new one, never a mixture.
CREATE OR REPLACE FUNCTION public.oc_apply_demand_sync(p_run_id UUID, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_upserted INTEGER;
  v_retired INTEGER;
  v_demand INTEGER;
  v_service_note INTEGER;
  v_unmapped INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM oc_sync_runs WHERE id = p_run_id AND status = 'running') THEN
    RAISE EXCEPTION 'sync run % is not in running state', p_run_id;
  END IF;

  WITH src AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS r(
      odoo_line_id INTEGER, odoo_order_id INTEGER, order_name TEXT,
      odoo_partner_id INTEGER, partner_name TEXT, odoo_product_id INTEGER,
      product_name TEXT, display_type TEXT, finished_good_id UUID,
      line_kind TEXT, is_demand BOOLEAN, qty_ordered NUMERIC,
      qty_delivered NUMERIC, uom TEXT, order_state TEXT, date_order TIMESTAMPTZ)
  ), up AS (
    INSERT INTO oc_sales_order_lines AS t (
      odoo_line_id, odoo_order_id, order_name, odoo_partner_id, partner_name,
      odoo_product_id, product_name, display_type, finished_good_id, line_kind,
      is_demand, qty_ordered, qty_delivered, uom, order_state, date_order,
      source_active, last_seen_at, source_removed_at, sync_run_id)
    SELECT s.odoo_line_id, s.odoo_order_id, s.order_name, s.odoo_partner_id,
           s.partner_name, s.odoo_product_id, s.product_name, s.display_type,
           s.finished_good_id, s.line_kind, COALESCE(s.is_demand, false),
           COALESCE(s.qty_ordered, 0), COALESCE(s.qty_delivered, 0), s.uom,
           s.order_state, s.date_order,
           true, v_now, NULL, p_run_id
      FROM src s
    ON CONFLICT (odoo_line_id) DO UPDATE SET
      odoo_order_id = EXCLUDED.odoo_order_id,
      order_name = EXCLUDED.order_name,
      odoo_partner_id = EXCLUDED.odoo_partner_id,
      partner_name = EXCLUDED.partner_name,
      odoo_product_id = EXCLUDED.odoo_product_id,
      product_name = EXCLUDED.product_name,
      display_type = EXCLUDED.display_type,
      finished_good_id = EXCLUDED.finished_good_id,
      line_kind = EXCLUDED.line_kind,
      is_demand = EXCLUDED.is_demand,
      qty_ordered = EXCLUDED.qty_ordered,
      qty_delivered = EXCLUDED.qty_delivered,
      uom = EXCLUDED.uom,
      order_state = EXCLUDED.order_state,
      date_order = EXCLUDED.date_order,
      source_active = true,              -- a returning line is reactivated
      last_seen_at = v_now,
      source_removed_at = NULL,
      sync_run_id = p_run_id
    RETURNING 1
  )
  SELECT count(*) INTO v_upserted FROM up;

  -- Soft-retire previously-known rows the fetch did not return. UPDATE, never
  -- DELETE: schedule history keeps referencing retired lines forever.
  UPDATE oc_sales_order_lines
     SET source_active = false, source_removed_at = v_now, sync_run_id = p_run_id
   WHERE source_active
     AND (last_seen_at IS NULL OR last_seen_at < v_now);
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  SELECT count(*) FILTER (WHERE COALESCE(r.is_demand, false)),
         count(*) FILTER (WHERE r.line_kind IN ('service', 'note')),
         count(*) FILTER (WHERE r.line_kind = 'unmapped')
    INTO v_demand, v_service_note, v_unmapped
    FROM jsonb_to_recordset(p_rows) AS r(line_kind TEXT, is_demand BOOLEAN);

  UPDATE oc_sync_runs
     SET status = 'success', completed_at = now(), lines_fetched = v_upserted,
         demand_lines = v_demand, service_note_lines = v_service_note,
         unmapped_lines = v_unmapped, retired_lines = v_retired
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'upserted', v_upserted, 'retired', v_retired, 'demand', v_demand,
    'service_note', v_service_note, 'unmapped', v_unmapped);
END $$;

REVOKE ALL ON FUNCTION public.oc_apply_demand_sync(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_apply_demand_sync(UUID, JSONB) TO service_role;

-- -------------------------------------------- RPC: apply product mapping ----
-- Mapping is not just a master edit. In one transaction: upsert the mapping,
-- reclassify existing ACTIVE lines for that product, audit. So mapping a
-- product makes its demand appear immediately — no re-sync required.
-- Only 'unmapped' lines are promoted (plus finished_good corrections on lines
-- already 'product'): service beats mapping by design — accidentally mapping
-- "Loading" must never turn 115k service units into brick demand. Notes and
-- overridden lines are untouched.
CREATE OR REPLACE FUNCTION public.oc_apply_product_mapping(
  p_odoo_product_id INTEGER,
  p_odoo_product_name TEXT,
  p_finished_good_id UUID,
  p_user UUID,
  p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reclassified INTEGER;
  v_before JSONB;
BEGIN
  SELECT to_jsonb(m) INTO v_before
    FROM oc_product_mapping m WHERE m.odoo_product_id = p_odoo_product_id;

  INSERT INTO oc_product_mapping AS t
    (odoo_product_id, odoo_product_name, finished_good_id, mapped_by, mapped_at, notes)
  VALUES (p_odoo_product_id, p_odoo_product_name, p_finished_good_id, p_user, now(), p_notes)
  ON CONFLICT (odoo_product_id) DO UPDATE SET
    finished_good_id = EXCLUDED.finished_good_id,
    odoo_product_name = COALESCE(EXCLUDED.odoo_product_name, t.odoo_product_name),
    mapped_by = EXCLUDED.mapped_by,
    mapped_at = now(),
    notes = COALESCE(EXCLUDED.notes, t.notes);

  UPDATE oc_sales_order_lines l
     SET finished_good_id = p_finished_good_id,
         line_kind = 'product',
         is_demand = true
   WHERE l.odoo_product_id = p_odoo_product_id
     AND l.source_active
     AND l.line_kind IN ('unmapped', 'product');
  GET DIAGNOSTICS v_reclassified = ROW_COUNT;

  INSERT INTO oc_audit_events (entity, entity_id, action, before_value, after_value, performed_by)
  VALUES ('oc_product_mapping', p_odoo_product_id::text,
          CASE WHEN v_before IS NULL THEN 'created' ELSE 'updated' END,
          v_before,
          jsonb_build_object('finished_good_id', p_finished_good_id,
                             'reclassified_lines', v_reclassified),
          p_user);

  RETURN jsonb_build_object('reclassified', v_reclassified);
END $$;

REVOKE ALL ON FUNCTION public.oc_apply_product_mapping(INTEGER, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_apply_product_mapping(INTEGER, TEXT, UUID, UUID, TEXT) TO service_role;

-- ------------------------------------------ RPC: confirm schedule version ---
-- Confirm atomically: supersede the previously confirmed version, mark this
-- one confirmed, flip BOTH pointers, bump lock_version. Only a 'sent' version
-- can be confirmed.
CREATE OR REPLACE FUNCTION public.oc_confirm_schedule_version(
  p_schedule_id UUID,
  p_version_id UUID,
  p_note TEXT,
  p_user UUID,
  p_expected_lock INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sched RECORD;
  v_ver RECORD;
BEGIN
  SELECT * INTO v_sched FROM oc_delivery_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule % not found', p_schedule_id; END IF;
  IF v_sched.lock_version IS DISTINCT FROM p_expected_lock THEN
    RAISE EXCEPTION 'lock_version mismatch (expected %, have %)',
      p_expected_lock, v_sched.lock_version USING ERRCODE = 'serialization_failure';
  END IF;

  SELECT * INTO v_ver FROM oc_delivery_schedule_versions
   WHERE id = p_version_id AND schedule_id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version % not found on schedule %', p_version_id, p_schedule_id; END IF;
  IF v_ver.status <> 'sent' THEN
    RAISE EXCEPTION 'only a sent version can be confirmed (status is %)', v_ver.status;
  END IF;

  UPDATE oc_delivery_schedule_versions
     SET status = 'superseded'
   WHERE schedule_id = p_schedule_id AND status = 'confirmed';

  UPDATE oc_delivery_schedule_versions
     SET status = 'confirmed', confirmed_at = now(), confirmation_note = p_note
   WHERE id = p_version_id;

  UPDATE oc_delivery_schedules
     SET status = 'confirmed',
         active_confirmed_version_id = p_version_id,
         latest_version_id = p_version_id,
         lock_version = lock_version + 1
   WHERE id = p_schedule_id;

  INSERT INTO oc_audit_events (entity, entity_id, action, after_value, performed_by)
  VALUES ('oc_delivery_schedules', p_schedule_id::text, 'version_confirmed',
          jsonb_build_object('version_id', p_version_id, 'version_no', v_ver.version_no,
                             'note', p_note),
          p_user);

  RETURN jsonb_build_object('confirmed_version_no', v_ver.version_no);
END $$;

REVOKE ALL ON FUNCTION public.oc_confirm_schedule_version(UUID, UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_confirm_schedule_version(UUID, UUID, TEXT, UUID, INTEGER) TO service_role;

-- -------------------------------------------------------- RLS + triggers ----
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'oc_sync_runs', 'oc_sales_order_lines', 'oc_site_locations',
    'oc_delivery_schedules', 'oc_delivery_schedule_versions',
    'oc_delivery_schedule_lines']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;

  -- oc_sync_runs has no updated_at column; the schedule-line guard trigger is
  -- created explicitly above.
  FOREACH t IN ARRAY ARRAY[
    'oc_sales_order_lines', 'oc_site_locations', 'oc_delivery_schedules',
    'oc_delivery_schedule_versions', 'oc_delivery_schedule_lines']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;
