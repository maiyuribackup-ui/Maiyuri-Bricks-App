-- ============================================================================
-- Operations Control (oc_) — Phase 6: labour ledger and weekly settlement.
--
-- PRD: "Production, Fulfilment & Dispatch Control" v1.0
--   §5     labour is generated at POST / COMPLETE, never from a draft
--   §6     idempotency
--   §57-61 activity rates, effective dating, the ledger snapshot
--   §62-68 weekly settlement, approval, locking
--   §8.2   adjustments preserve history
--
-- WHAT THIS PAYS FOR. Labour is earned by operationally captured work, not by
-- what was invoiced: production labour comes from a POSTED production actual,
-- loading and unloading from a COMPLETED delivery's own loaded and unloaded
-- quantities. Odoo's "Loading" and "Unloading" sales-order lines are
-- commercial billing items and are deliberately NOT a labour source — they
-- are what the customer is charged, which is a different question from what
-- the yard is owed.
--
-- THE RATE SNAPSHOT (§60/§61). Every entry stores the rate it was paid at,
-- which rate row that came from, and that row's effective_from. So when the
-- 8" rate goes from Rs.7 to Rs.7.50 on 1 September, August's settled work
-- stays at Rs.7 — twice over: the effective-dated lookup picks the right row
-- at generation time, and the snapshot means even editing the master later
-- cannot rewrite a settled week.
--
-- MISSING RATES MUST NEVER BLOCK OPERATIONS. The rate table ships empty by
-- design (§100) — the business supplies the values. So the generator SKIPS an
-- entry it cannot price rather than raising: a supervisor posting a shift at
-- 6am must not be stopped because nobody has entered a rate yet. The unpriced
-- work is reported as an exception and can be generated later, once the rate
-- exists, by re-running the generator — which is safe because it is
-- idempotent.
--
-- WORKER-LEVEL DISTRIBUTION IS OUT OF SCOPE (§22, open question 8). V1 ends
-- at activity totals: Production Rs.X, Loading Rs.Y, Unloading Rs.Z, weekly
-- payable Rs.Total. There is deliberately no worker column here; adding one
-- would invite an allocation model the business has not asked for.
-- ============================================================================

-- -------------------------------------------------------------- ledger ------
CREATE TABLE IF NOT EXISTS public.oc_labour_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  -- The factory week runs Saturday to Friday. Generated from entry_date so it
  -- can never disagree with it, using the same function the rest of the app
  -- already uses for factory weeks.
  week_start DATE GENERATED ALWAYS AS (public.factory_week_start(entry_date)) STORED,
  activity_code TEXT NOT NULL REFERENCES public.oc_activity_types(code),
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id),
  -- Where the work came from. The adjustment sources exist so a correction to
  -- a settled week becomes a differential in the CURRENT week (§67) rather
  -- than a rewrite of a week that has already been paid.
  source_type TEXT NOT NULL CHECK (source_type IN (
    'production_actual',
    'trip_load_line',
    'production_actual_adjustment',
    'delivery_actual_adjustment'
  )),
  source_id UUID NOT NULL,
  -- Signed: a differential from a downward adjustment is negative, and so is
  -- the amount. That is the whole point of paying by delta.
  eligible_qty NUMERIC(14,2) NOT NULL CHECK (eligible_qty <> 0),
  -- §61: the snapshot. Never re-read from the master to display an entry.
  rate_applied NUMERIC(12,4) NOT NULL,
  rate_id UUID REFERENCES public.oc_activity_rates(id),
  rate_effective_from DATE,
  amount NUMERIC(14,2) NOT NULL,
  settlement_id UUID,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §6: one entry per source event per activity per product. A retried post
-- cannot pay the same work twice — enforced here, not in application code.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_labour_source
  ON public.oc_labour_ledger (source_type, source_id, activity_code, finished_good_id);

CREATE INDEX IF NOT EXISTS idx_oc_labour_week
  ON public.oc_labour_ledger (week_start, activity_code);
CREATE INDEX IF NOT EXISTS idx_oc_labour_settlement
  ON public.oc_labour_ledger (settlement_id) WHERE settlement_id IS NOT NULL;

-- --------------------------------------------------------- settlements ------
-- One per factory week. The status ladder is deliberately one-way in the
-- direction that matters: once locked, the week's entries are frozen.
CREATE TABLE IF NOT EXISTS public.oc_labour_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'approved', 'paid', 'locked')),
  -- Totals per activity, snapshotted at approval so the approved figure is
  -- reproducible even if a later differential lands in a subsequent week.
  totals JSONB,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  notes TEXT,
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oc_settlement_week CHECK (week_end > week_start)
);

ALTER TABLE public.oc_labour_ledger
  DROP CONSTRAINT IF EXISTS oc_labour_ledger_settlement_id_fkey;
ALTER TABLE public.oc_labour_ledger
  ADD CONSTRAINT oc_labour_ledger_settlement_id_fkey
  FOREIGN KEY (settlement_id) REFERENCES public.oc_labour_settlements(id);

DROP TRIGGER IF EXISTS trg_oc_labour_settlements_updated_at ON public.oc_labour_settlements;
CREATE TRIGGER trg_oc_labour_settlements_updated_at
  BEFORE UPDATE ON public.oc_labour_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================ settled-week immutability ==
-- §67: a settled week has been paid. Its entries are frozen — a correction
-- becomes a differential in the current week, never an edit to what was paid.
CREATE OR REPLACE FUNCTION public.oc_guard_labour_entry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_settlement UUID;
BEGIN
  v_settlement := COALESCE(OLD.settlement_id, NEW.settlement_id);
  IF v_settlement IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO v_status FROM oc_labour_settlements WHERE id = v_settlement;
  IF v_status IN ('approved', 'paid', 'locked') THEN
    -- Attaching an entry to the settlement is what settling IS, so allow the
    -- transition that only sets settlement_id; block anything touching money.
    IF TG_OP = 'UPDATE'
       AND NEW.eligible_qty IS NOT DISTINCT FROM OLD.eligible_qty
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.rate_applied IS NOT DISTINCT FROM OLD.rate_applied
       AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'week % is % — record a differential in the current week instead',
      (SELECT week_start FROM oc_labour_settlements WHERE id = v_settlement), v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_oc_labour_settled_immutable ON public.oc_labour_ledger;
CREATE TRIGGER trg_oc_labour_settled_immutable
  BEFORE UPDATE OR DELETE ON public.oc_labour_ledger
  FOR EACH ROW EXECUTE FUNCTION public.oc_guard_labour_entry();

-- ================================================== RPC: generate labour ====
-- Idempotent, and deliberately NON-BLOCKING.
--
-- Returns a summary rather than raising, because it runs inside the same
-- transaction as posting production or completing a delivery. Those are
-- physical operations that must succeed whether or not a rate has been
-- configured — the alternative is a supervisor at 6am unable to record a
-- shift because nobody entered a rate. Unpriced work is counted in
-- `skipped_no_rate` and can be generated later by re-running this, which is
-- safe because the unique index makes a second run a no-op.
CREATE OR REPLACE FUNCTION public.oc_generate_labour(
  p_source_type TEXT,
  p_source_id UUID,
  p_user UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_basis TEXT;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_rec RECORD;
  v_rate RECORD;
  v_entry_date DATE;
  v_guard INTEGER;
BEGIN
  SELECT COALESCE(production_wage_basis, 'accepted') INTO v_basis
    FROM oc_settings LIMIT 1;
  v_basis := COALESCE(v_basis, 'accepted');

  -- Build the (activity, product, date, quantity) rows this source earns for,
  -- then price each one. Keeping the shape uniform is what lets production,
  -- dispatch and both kinds of adjustment share one pricing path.
  FOR v_rec IN
    SELECT * FROM (
      -- Production: gross or accepted per the configured wage basis (§35 is
      -- about the cement RATIO, which is always gross; what labour pays for
      -- is a separate business decision, hence the setting).
      SELECT 'production'::TEXT AS activity_code,
             a.finished_good_id,
             d.prod_date AS entry_date,
             CASE WHEN v_basis = 'gross' THEN a.gross_qty ELSE a.accepted_qty END AS qty
        FROM oc_production_actuals a
        JOIN oc_production_shifts s ON s.id = a.shift_id
        JOIN oc_production_days d ON d.id = s.day_id
       WHERE p_source_type = 'production_actual' AND a.id = p_source_id

      UNION ALL
      -- Loading is paid on what left the yard; unloading on what was actually
      -- put down at the customer. Damaged and short stock was still loaded,
      -- so loading is paid on it — the work happened.
      SELECT 'loading', l.finished_good_id, t.trip_date, l.actual_loaded_qty
        FROM oc_trip_load_lines l
        JOIN oc_trip_stops st ON st.id = l.stop_id
        JOIN oc_trips t ON t.id = st.trip_id
       WHERE p_source_type = 'trip_load_line' AND l.id = p_source_id

      UNION ALL
      SELECT 'unloading', l.finished_good_id, t.trip_date, l.actual_unloaded_qty
        FROM oc_trip_load_lines l
        JOIN oc_trip_stops st ON st.id = l.stop_id
        JOIN oc_trips t ON t.id = st.trip_id
       WHERE p_source_type = 'trip_load_line' AND l.id = p_source_id

      UNION ALL
      -- §67 differentials. The entry_date is the ADJUSTMENT's date, not the
      -- original work's, so it falls in the current open week rather than
      -- reopening one that has been paid.
      SELECT 'production', a.finished_good_id, adj.created_at::date,
             CASE WHEN v_basis = 'gross' THEN adj.delta_gross ELSE adj.delta_accepted END
        FROM oc_production_actual_adjustments adj
        JOIN oc_production_actuals a ON a.id = adj.actual_id
       WHERE p_source_type = 'production_actual_adjustment' AND adj.id = p_source_id

      UNION ALL
      SELECT 'loading', l.finished_good_id, adj.created_at::date, adj.delta_loaded
        FROM oc_delivery_actual_adjustments adj
        JOIN oc_trip_load_lines l ON l.id = adj.load_line_id
       WHERE p_source_type = 'delivery_actual_adjustment' AND adj.id = p_source_id

      UNION ALL
      SELECT 'unloading', l.finished_good_id, adj.created_at::date, adj.delta_unloaded
        FROM oc_delivery_actual_adjustments adj
        JOIN oc_trip_load_lines l ON l.id = adj.load_line_id
       WHERE p_source_type = 'delivery_actual_adjustment' AND adj.id = p_source_id
    ) rows
    WHERE qty IS NOT NULL AND qty <> 0
  LOOP
    -- §60: the rate in force ON THE WORK'S DATE, not today's rate.
    SELECT r.id, r.rate, r.effective_from INTO v_rate
      FROM oc_activity_rates r
     WHERE r.finished_good_id = v_rec.finished_good_id
       AND r.activity_code = v_rec.activity_code
       AND r.active
       AND v_rec.entry_date >= r.effective_from
       AND (r.effective_to IS NULL OR v_rec.entry_date <= r.effective_to)
     ORDER BY r.effective_from DESC
     LIMIT 1;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- A differential has to land somewhere it can actually be PAID. If the
    -- week its date falls in has already been approved, paid or locked, the
    -- entry would be stranded: settled weeks do not re-attach entries, and a
    -- locked one cannot be reopened at all. So walk forward to the first week
    -- that is still open. In practice an adjustment usually arrives weeks
    -- later and this is a no-op; it matters when a correction lands in the
    -- same week the settlement was just run.
    v_entry_date := v_rec.entry_date;
    v_guard := 0;
    WHILE v_guard < 520 AND EXISTS (
      SELECT 1 FROM oc_labour_settlements
       WHERE week_start = factory_week_start(v_entry_date)
         AND status IN ('approved', 'paid', 'locked')
    ) LOOP
      v_entry_date := factory_week_start(v_entry_date) + 7;
      v_guard := v_guard + 1;
    END LOOP;

    INSERT INTO oc_labour_ledger
      (entry_date, activity_code, finished_good_id, source_type, source_id,
       eligible_qty, rate_applied, rate_id, rate_effective_from, amount, created_by)
    VALUES (v_entry_date, v_rec.activity_code, v_rec.finished_good_id,
            p_source_type, p_source_id, v_rec.qty, v_rate.rate, v_rate.id,
            v_rate.effective_from, ROUND(v_rec.qty * v_rate.rate, 2), p_user)
    ON CONFLICT (source_type, source_id, activity_code, finished_good_id)
      DO NOTHING;

    IF FOUND THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'source_type', p_source_type,
    'source_id', p_source_id,
    'entries_created', v_created,
    'skipped_no_rate', v_skipped);
END $$;

REVOKE ALL ON FUNCTION public.oc_generate_labour(TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_generate_labour(TEXT, UUID, UUID)
  TO service_role;

-- ============================================ triggers: earn at POST/COMPLETE
-- §5: labour is earned when work is POSTED or COMPLETED, never from a draft.
--
-- Implemented as triggers rather than by editing oc_post_production_actual()
-- and oc_complete_delivery_line(). Those RPCs are shipped and verified;
-- rewriting them here to add one call would mean restating hundreds of lines
-- and risking silent drift from what was reviewed. A trigger fires inside the
-- same transaction, so labour is still atomic with the post — which is the
-- property that actually matters.
CREATE OR REPLACE FUNCTION public.oc_earn_labour_on_post()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    PERFORM oc_generate_labour('production_actual', NEW.id, NEW.posted_by);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_labour_on_production_post ON public.oc_production_actuals;
CREATE TRIGGER trg_oc_labour_on_production_post
  AFTER UPDATE ON public.oc_production_actuals
  FOR EACH ROW EXECUTE FUNCTION public.oc_earn_labour_on_post();

CREATE OR REPLACE FUNCTION public.oc_earn_labour_on_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status = 'draft' THEN
    PERFORM oc_generate_labour('trip_load_line', NEW.id, NEW.completed_by);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_labour_on_delivery_complete ON public.oc_trip_load_lines;
CREATE TRIGGER trg_oc_labour_on_delivery_complete
  AFTER UPDATE ON public.oc_trip_load_lines
  FOR EACH ROW EXECUTE FUNCTION public.oc_earn_labour_on_complete();

-- Adjustments earn their differential the moment they are recorded.
CREATE OR REPLACE FUNCTION public.oc_earn_labour_on_adjustment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM oc_generate_labour(
    CASE TG_TABLE_NAME
      WHEN 'oc_production_actual_adjustments' THEN 'production_actual_adjustment'
      ELSE 'delivery_actual_adjustment'
    END, NEW.id, NEW.created_by);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_labour_on_production_adjustment
  ON public.oc_production_actual_adjustments;
CREATE TRIGGER trg_oc_labour_on_production_adjustment
  AFTER INSERT ON public.oc_production_actual_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.oc_earn_labour_on_adjustment();

DROP TRIGGER IF EXISTS trg_oc_labour_on_delivery_adjustment
  ON public.oc_delivery_actual_adjustments;
CREATE TRIGGER trg_oc_labour_on_delivery_adjustment
  AFTER INSERT ON public.oc_delivery_actual_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.oc_earn_labour_on_adjustment();

-- ========================================= RPC: settle and lock a week ======
-- §8.3 + §62-68. Attaching every unsettled entry in the week and snapshotting
-- the totals happens together, so a settlement can never be approved against
-- a figure that does not match the entries it covers.
CREATE OR REPLACE FUNCTION public.oc_settle_labour_week(
  p_week_start DATE,
  p_status TEXT,
  p_user UUID,
  p_expected_lock INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settlement RECORD;
  v_id UUID;
  v_attached INTEGER := 0;
  v_totals JSONB;
  v_total NUMERIC;
BEGIN
  IF p_status NOT IN ('draft', 'reviewed', 'approved', 'paid', 'locked') THEN
    RAISE EXCEPTION 'unknown settlement status %', p_status;
  END IF;

  SELECT * INTO v_settlement FROM oc_labour_settlements
   WHERE week_start = p_week_start FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO oc_labour_settlements (week_start, week_end, status, created_by)
    VALUES (p_week_start, p_week_start + 6, 'draft', p_user)
    RETURNING * INTO v_settlement;
  END IF;
  v_id := v_settlement.id;

  IF p_expected_lock IS NOT NULL
     AND v_settlement.lock_version IS DISTINCT FROM p_expected_lock THEN
    RAISE EXCEPTION 'lock_version mismatch (expected %, have %)',
      p_expected_lock, v_settlement.lock_version USING ERRCODE = 'serialization_failure';
  END IF;

  -- A locked week is final. Reopening is out of scope for V1 by design: the
  -- correction path is a differential in the current week (§67).
  IF v_settlement.status = 'locked' AND p_status <> 'locked' THEN
    RAISE EXCEPTION 'week % is locked and cannot be reopened', p_week_start;
  END IF;

  -- Attach every unsettled entry in the week. Done before the totals so the
  -- snapshot always describes exactly the entries the settlement covers.
  UPDATE oc_labour_ledger
     SET settlement_id = v_id
   WHERE week_start = p_week_start AND settlement_id IS NULL;
  GET DIAGNOSTICS v_attached = ROW_COUNT;

  SELECT COALESCE(jsonb_object_agg(activity_code, activity_total), '{}'::jsonb),
         COALESCE(sum(activity_total), 0)
    INTO v_totals, v_total
    FROM (
      SELECT activity_code, sum(amount) AS activity_total
        FROM oc_labour_ledger
       WHERE settlement_id = v_id
       GROUP BY activity_code
    ) t;

  UPDATE oc_labour_settlements
     SET status = p_status,
         totals = jsonb_build_object('by_activity', v_totals, 'total', v_total),
         reviewed_by = CASE WHEN p_status = 'reviewed' THEN p_user ELSE reviewed_by END,
         reviewed_at = CASE WHEN p_status = 'reviewed' THEN now() ELSE reviewed_at END,
         approved_by = CASE WHEN p_status = 'approved' THEN p_user ELSE approved_by END,
         approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
         paid_at = CASE WHEN p_status = 'paid' THEN now() ELSE paid_at END,
         locked_at = CASE WHEN p_status = 'locked' THEN now() ELSE locked_at END,
         lock_version = lock_version + 1
   WHERE id = v_id;

  INSERT INTO oc_audit_events
    (entity, entity_id, action, before_value, after_value, performed_by)
  VALUES ('oc_labour_settlements', v_id::text, p_status,
          jsonb_build_object('status', v_settlement.status),
          jsonb_build_object('status', p_status, 'entries_attached', v_attached,
                             'total', v_total),
          p_user);

  RETURN jsonb_build_object(
    'settlement_id', v_id,
    'week_start', p_week_start,
    'status', p_status,
    'entries_attached', v_attached,
    'totals', v_totals,
    'total', v_total);
END $$;

REVOKE ALL ON FUNCTION public.oc_settle_labour_week(DATE, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_settle_labour_week(DATE, TEXT, UUID, INTEGER)
  TO service_role;

-- -------------------------------------------------------- RLS + policies ----
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['oc_labour_ledger', 'oc_labour_settlements']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;
END $$;
