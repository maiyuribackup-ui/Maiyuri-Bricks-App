-- ============================================================================
-- Operations Control (oc_) — Phase 1: masters, configuration and audit
--
-- The `oc_` prefix is "operations control". It deliberately sits ALONGSIDE the
-- existing factory_* ledger and the ops_plan* AI planner; neither is modified.
-- Each module gets a dated production cutover, after which the corresponding
-- factory_* entry screen becomes read-only (see the implementation roadmap).
--
-- Guiding principle: Odoo remains the ERP and the authoritative physical
-- inventory. These tables hold operational configuration only.
--
-- PRD: "Production, Fulfilment & Dispatch Control" v1.0.
--   §56-61  activity rate master, effective dating, rate snapshot
--   §34-37  consumption standards + tolerance banding
--   §41-46  vehicle + capacity master, utilisation thresholds
--   §29,§55 configurable deviation reasons
--   §81     master configuration screens
--   §100    seeded operating defaults
--
-- NOTHING that the business may change is a CHECK enum — it is a seeded master
-- row. Workflow statuses and structural discriminators stay as CHECKs.
--
-- NO rate values and NO cement ratios are seeded: PRD §100 requires both to be
-- supplied by the business through configuration. The PRD's illustrative
-- Rs.7 / Rs.6 / 140-per-bag figures must never reach the database.
--
-- Conventions follow 20260714120000_expenses.sql and 20260808120000_factory_ledger.sql:
-- shared set_updated_at() trigger, RLS on with a permissive authenticated-read
-- policy; ALL writes go through service-role API routes which are the real gate.
-- ============================================================================

-- Needed for the EXCLUDE constraints that stop overlapping effective periods
-- (equality on a uuid/text column combined with range overlap).
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

-- shared updated_at helper (idempotent — also defined by earlier migrations)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ------------------------------------------------------------- settings -----
-- Single row (id = 1), mirroring planning_settings. Every operational
-- threshold the PRD calls "configurable" lives here so no business rule is
-- ever hard-coded in TypeScript.
CREATE TABLE IF NOT EXISTS public.oc_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- production (PRD §21, §22)
  default_shifts_per_day INTEGER NOT NULL DEFAULT 2
    CHECK (default_shifts_per_day IN (1, 2)),

  -- dispatch (PRD §40, §46)
  normal_max_trips_per_day INTEGER NOT NULL DEFAULT 2
    CHECK (normal_max_trips_per_day > 0),
  load_green_min_pct NUMERIC(5,2) NOT NULL DEFAULT 95,
  load_yellow_min_pct NUMERIC(5,2) NOT NULL DEFAULT 80,
  load_red_above_pct NUMERIC(5,2) NOT NULL DEFAULT 100,

  -- cement (PRD §32, §37) — a bag is 50 kg, consumption comes in 0.5 steps
  cement_bag_kg NUMERIC(6,2) NOT NULL DEFAULT 50 CHECK (cement_bag_kg > 0),
  cement_bag_step NUMERIC(4,2) NOT NULL DEFAULT 0.5 CHECK (cement_bag_step > 0),
  ratio_amber_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 5,
  ratio_red_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 10,

  -- labour (PRD §63) — wage basis is NOT the same as the cement-ratio basis,
  -- which is always gross. Kept configurable and deliberately separate.
  production_wage_basis TEXT NOT NULL DEFAULT 'accepted'
    CHECK (production_wage_basis IN ('gross', 'accepted')),
  -- reporting basis for output-per-person-shift (PRD §30)
  output_per_person_basis TEXT NOT NULL DEFAULT 'accepted'
    CHECK (output_per_person_basis IN ('gross', 'accepted')),

  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (load_yellow_min_pct <= load_green_min_pct),
  CHECK (ratio_amber_tolerance_pct <= ratio_red_tolerance_pct)
);
INSERT INTO public.oc_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------- activity types -----
-- PRD §57: Production / Loading / Unloading initially, "architecture should
-- allow additional activity types later" — hence a master, not a CHECK enum.
CREATE TABLE IF NOT EXISTS public.oc_activity_types (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  -- where the eligible quantity is read from when the ledger is built
  quantity_source TEXT NOT NULL
    CHECK (quantity_source IN ('production_actual', 'trip_load', 'delivery_stop')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.oc_activity_types (code, label, quantity_source, sort_order) VALUES
  ('production', 'Production', 'production_actual', 1),
  ('loading',    'Loading',    'trip_load',        2),
  ('unloading',  'Unloading',  'delivery_stop',    3)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------- activity rates -----
-- PRD §58-61. Rates are per product AND per activity, effective-dated, and
-- snapshotted onto every ledger entry so approved history is reproducible.
-- NO VALUES SEEDED — PRD §100 and AC-L02.
CREATE TABLE IF NOT EXISTS public.oc_activity_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id) ON DELETE CASCADE,
  activity_code TEXT NOT NULL REFERENCES public.oc_activity_types(code),
  rate NUMERIC(10,2) NOT NULL CHECK (rate >= 0),
  uom TEXT NOT NULL DEFAULT 'per_brick',
  effective_from DATE NOT NULL,
  effective_to DATE,                       -- NULL = still in force
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  modified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),

  -- PRD §88: overlapping rate periods are a data-integrity error and BLOCK.
  -- Inclusive range: a rate ending 31 Aug and one starting 1 Sep do not overlap.
  EXCLUDE USING gist (
    finished_good_id WITH =,
    activity_code WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (active)
);
CREATE INDEX IF NOT EXISTS idx_oc_activity_rates_lookup
  ON public.oc_activity_rates (finished_good_id, activity_code, effective_from DESC);

-- ------------------------------------------------ consumption standards -----
-- PRD §34-36. "Expected number of bricks produced per 50 kg bag", per product,
-- effective-dated so an August record always evaluates against August's recipe.
-- NO VALUES SEEDED — PRD §34 "do not hard-code example values".
CREATE TABLE IF NOT EXISTS public.oc_consumption_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id) ON DELETE CASCADE,
  material TEXT NOT NULL DEFAULT 'cement',
  -- bricks produced per one unit of material (one 50 kg bag)
  standard_yield NUMERIC(10,2) NOT NULL CHECK (standard_yield > 0),
  uom TEXT NOT NULL DEFAULT '50kg_bag',
  -- per-product override; NULL falls back to oc_settings tolerances
  tolerance_pct NUMERIC(5,2) CHECK (tolerance_pct IS NULL OR tolerance_pct >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  modified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),

  EXCLUDE USING gist (
    finished_good_id WITH =,
    material WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (active)
);
CREATE INDEX IF NOT EXISTS idx_oc_consumption_standards_lookup
  ON public.oc_consumption_standards (finished_good_id, material, effective_from DESC);

-- ------------------------------------------------------------ vehicles -----
-- PRD §41: V1 has one standard vehicle; the architecture must support more.
CREATE TABLE IF NOT EXISTS public.oc_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type TEXT NOT NULL UNIQUE,
  description TEXT,
  registration TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The vehicle the factory ledger already records most trips against.
INSERT INTO public.oc_vehicles (vehicle_type, description)
VALUES ('407 Eicher', 'Standard delivery vehicle')
ON CONFLICT (vehicle_type) DO NOTHING;

-- -------------------------------------------------- vehicle capacities -----
-- PRD §42: capacity must NOT be hard-coded. Effective-dated like every other
-- operational standard, so historical utilisation stays reproducible.
CREATE TABLE IF NOT EXISTS public.oc_vehicle_capacities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.oc_vehicles(id) ON DELETE CASCADE,
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id) ON DELETE CASCADE,
  -- maximum NORMAL full load; exceeding it warns, it never blocks (PRD §45)
  full_load_qty NUMERIC(10,0) NOT NULL CHECK (full_load_qty > 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  modified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),

  EXCLUDE USING gist (
    vehicle_id WITH =,
    finished_good_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (active)
);
CREATE INDEX IF NOT EXISTS idx_oc_vehicle_capacities_lookup
  ON public.oc_vehicle_capacities (vehicle_id, finished_good_id, effective_from DESC);

-- Seed the current standard configuration (PRD §100, AC-T04/AC-T05):
--   6-inch brick = 1,000 per full load, 8-inch brick = 900.
-- Size is derived from the Odoo product name (…*8*… / …*6*…) rather than
-- pasting UUIDs, so this stays correct if ids differ per environment.
-- Products whose size cannot be inferred (e.g. Solid Blocks) get no capacity
-- and must be configured by the business before they can be loaded.
INSERT INTO public.oc_vehicle_capacities
  (vehicle_id, finished_good_id, full_load_qty, effective_from, notes)
SELECT v.id, fg.id,
       CASE WHEN fg.name LIKE '%*8*%' THEN 900 ELSE 1000 END,
       CURRENT_DATE,
       'Seeded from PRD current standard configuration'
FROM public.oc_vehicles v
CROSS JOIN public.finished_goods fg
WHERE v.vehicle_type = '407 Eicher'
  AND (fg.name LIKE '%*8*%' OR fg.name LIKE '%*6*%')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------- deviation reasons -----
-- PRD §29 and §55: "maintain configurable reason master".
CREATE TABLE IF NOT EXISTS public.oc_deviation_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('production', 'delivery')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, code)
);

INSERT INTO public.oc_deviation_reasons (scope, code, label, sort_order) VALUES
  ('production', 'machine_breakdown',   'Machine breakdown',           1),
  ('production', 'electricity_failure', 'Electricity failure',         2),
  ('production', 'labour_shortage',     'Labour shortage',             3),
  ('production', 'material_shortage',   'Raw-material shortage',       4),
  ('production', 'weather',             'Weather / rain',              5),
  ('production', 'quality_issue',       'Quality issue',               6),
  ('production', 'production_change',   'Production change',           7),
  ('production', 'customer_change',     'Customer requirement change', 8),
  ('production', 'planned_maintenance', 'Planned maintenance',         9),
  ('production', 'other',               'Other',                      99),
  ('delivery',   'customer_postponed',  'Customer postponed',          1),
  ('delivery',   'vehicle_unavailable', 'Vehicle unavailable',         2),
  ('delivery',   'production_shortage', 'Production shortage',         3),
  ('delivery',   'stock_shortage',      'Stock shortage',              4),
  ('delivery',   'loading_delay',       'Loading delay',               5),
  ('delivery',   'site_inaccessible',   'Site inaccessible',           6),
  ('delivery',   'payment_pending',     'Payment pending',             7),
  ('delivery',   'customer_unavailable','Customer unavailable',        8),
  ('delivery',   'weather',             'Weather',                     9),
  ('delivery',   'route_delay',         'Route delay',                10),
  ('delivery',   'quantity_changed',    'Quantity changed',           11),
  ('delivery',   'other',               'Other',                      99)
ON CONFLICT (scope, code) DO NOTHING;

-- ------------------------------------------------------ product mapping -----
-- Odoo product -> Maiyuri finished good. PURELY a mapping: line classification
-- (product / service / note / unmapped) is a separate responsibility that reads
-- Odoo's own display_type and product type during the sales-order sync.
--
-- This exists because real brick demand is currently invisible: at the time of
-- writing, "CIB-10*8*5-Single Press" (992 open units) and
-- "6 by 6\" Cement Interlock Bricks" (900) carry open demand with no product
-- link, while service lines such as Loading and Unloading carry brick-sized
-- quantities that must never enter the plan.
CREATE TABLE IF NOT EXISTS public.oc_product_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_product_id INTEGER NOT NULL UNIQUE,
  odoo_product_name TEXT,
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id) ON DELETE CASCADE,
  mapped_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  mapped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oc_product_mapping_fg
  ON public.oc_product_mapping (finished_good_id);

-- Backfill from the links the existing planner has already resolved, so the
-- mapping screen starts with the known-good pairs rather than an empty table.
INSERT INTO public.oc_product_mapping (odoo_product_id, odoo_product_name, finished_good_id, notes)
SELECT DISTINCT ON (fg.odoo_product_id)
       fg.odoo_product_id, fg.name, fg.id,
       'Backfilled from finished_goods.odoo_product_id'
FROM public.finished_goods fg
WHERE fg.odoo_product_id IS NOT NULL
ORDER BY fg.odoo_product_id, fg.created_at
ON CONFLICT (odoo_product_id) DO NOTHING;

-- Manual escape hatch for classification ONLY. Kept separate so the mapping
-- table above never becomes a dumping ground for non-physical products.
CREATE TABLE IF NOT EXISTS public.oc_product_classification_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_product_id INTEGER NOT NULL UNIQUE,
  odoo_product_name TEXT,
  line_kind TEXT NOT NULL CHECK (line_kind IN ('product', 'service', 'note', 'unmapped')),
  reason TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------- audit -----
-- Module-wide append-only audit (PRD §74), modelled on work_item_events.
-- Written best-effort by the API layer; never blocks the operation it records.
CREATE TABLE IF NOT EXISTS public.oc_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,               -- table/concept, e.g. 'oc_activity_rates'
  entity_id TEXT,                     -- TEXT: singleton settings key is not a uuid
  action TEXT NOT NULL,               -- created | updated | deleted | posted | …
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oc_audit_entity
  ON public.oc_audit_events (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oc_audit_created
  ON public.oc_audit_events (created_at DESC);

-- -------------------------------------------------------- RLS + triggers ----
-- Authenticated read; NO write policies. Writes go through service-role API
-- routes that enforce roles in-handler (requireProductionRole) — that is the
-- real gate, matching ops_planning / expenses / factory_ledger.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'oc_settings', 'oc_activity_types', 'oc_activity_rates',
    'oc_consumption_standards', 'oc_vehicles', 'oc_vehicle_capacities',
    'oc_deviation_reasons', 'oc_product_mapping',
    'oc_product_classification_overrides', 'oc_audit_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;

  -- oc_audit_events is append-only: no updated_at column, so no trigger.
  FOREACH t IN ARRAY ARRAY[
    'oc_settings', 'oc_activity_types', 'oc_activity_rates',
    'oc_consumption_standards', 'oc_vehicles', 'oc_vehicle_capacities',
    'oc_deviation_reasons', 'oc_product_mapping',
    'oc_product_classification_overrides']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;
