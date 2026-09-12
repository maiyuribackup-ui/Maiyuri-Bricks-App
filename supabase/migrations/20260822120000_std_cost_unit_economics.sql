-- ============================================================================
-- Unit Economics (Standard Cost) module
--
-- Replaces the "Mb Unit Economics" Google Sheet. Staff maintain raw-material
-- prices, per-brick-type recipes, overheads and monthly fixed costs on a
-- single mutable DRAFT; an admin PUBLISHES that draft as an immutable version
-- with a valid_from date. The Maiyuri Intelligence Layer reads the published
-- standard through the two frozen views at the bottom of this file.
--
-- The one rule that makes the "chemical is ₹80/kg on the sheet but ₹74/kg by
-- its own inputs" class of bug impossible: NO DERIVED NUMBER IS EVER STORED
-- FROM USER INPUT. cost_per_kg is a generated column; every per-unit cost is
-- computed in v_std_cost_brick_type_computed below and mirrored exactly once
-- in TypeScript (packages/shared/src/unit-economics.ts) for live editing.
--
-- Conventions follow the rest of the repo: TEXT + CHECK enums, RLS enabled
-- with an authenticated-read policy, writes go through the service-role client
-- in the API (which is the real gate — role checks live there), anon revoked.
-- ============================================================================

-- shared updated_at helper (idempotent — also defined by earlier migrations)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------- versions --

CREATE TABLE IF NOT EXISTS public.std_cost_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  -- set at publish; the date this standard takes effect
  valid_from DATE,
  monthly_production_basis INTEGER NOT NULL DEFAULT 15000
    CHECK (monthly_production_basis > 0),
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  -- a published version is meaningless without the date it takes effect
  CONSTRAINT std_cost_versions_published_has_valid_from
    CHECK (status <> 'published' OR (valid_from IS NOT NULL AND published_at IS NOT NULL))
);

-- Exactly one draft at a time. (Partial unique index on the constant column:
-- every draft row collides on status = 'draft'.)
CREATE UNIQUE INDEX IF NOT EXISTS std_cost_versions_one_draft
  ON public.std_cost_versions (status) WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_std_cost_versions_published
  ON public.std_cost_versions (valid_from DESC, published_at DESC)
  WHERE status = 'published';

DROP TRIGGER IF EXISTS set_std_cost_versions_updated_at ON public.std_cost_versions;
CREATE TRIGGER set_std_cost_versions_updated_at
  BEFORE UPDATE ON public.std_cost_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------- raw material master

CREATE TABLE IF NOT EXISTS public.std_cost_rm_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.std_cost_versions(id) ON DELETE CASCADE,
  -- 'cement','chemical','msand_dust','msand_waste','red_soil','red_soil_gravel'
  rm_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  purchase_amount NUMERIC(12, 2) NOT NULL CHECK (purchase_amount >= 0),
  -- '50 Kg Bag', 'Per Unit or 8000 Kgs', ...
  purchase_unit_label TEXT NOT NULL,
  purchase_unit_kg NUMERIC(12, 3) NOT NULL CHECK (purchase_unit_kg > 0),
  -- DERIVED — generated, never writable
  cost_per_kg NUMERIC(12, 4)
    GENERATED ALWAYS AS (purchase_amount / purchase_unit_kg) STORED,
  UNIQUE (version_id, rm_key)
);

CREATE INDEX IF NOT EXISTS idx_std_cost_rm_prices_version
  ON public.std_cost_rm_prices (version_id);

-- ------------------------------------------------------------- brick types --

CREATE TABLE IF NOT EXISTS public.std_cost_brick_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.std_cost_versions(id) ON DELETE CASCADE,
  brick_type TEXT NOT NULL,             -- '8 CIB' | '6 CIB' | '8 MIB' | '6 MIB' (extensible)
  -- ILIKE pattern onto the Odoo product name, e.g. 'CIB-10*8*5%'
  odoo_product_match TEXT NOT NULL,
  bricks_per_batch NUMERIC(6, 2) NOT NULL CHECK (bricks_per_batch > 0),
  labor_cost_per_batch NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (labor_cost_per_batch >= 0),
  electricity_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (electricity_per_unit >= 0),
  depreciation_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (depreciation_per_unit >= 0),
  sales_price NUMERIC(10, 2) CHECK (sales_price IS NULL OR sales_price >= 0),
  loading_unloading_per_unit NUMERIC(10, 2) DEFAULT 3 CHECK (loading_unloading_per_unit >= 0),
  transport_per_unit NUMERIC(10, 2) DEFAULT 3 CHECK (transport_per_unit >= 0),
  commission_per_unit NUMERIC(10, 2) DEFAULT 1 CHECK (commission_per_unit >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (version_id, brick_type)
);

CREATE INDEX IF NOT EXISTS idx_std_cost_brick_types_version
  ON public.std_cost_brick_types (version_id);

-- ----------------------------------------------------------- recipe lines ---

CREATE TABLE IF NOT EXISTS public.std_cost_recipe_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brick_type_id UUID NOT NULL REFERENCES public.std_cost_brick_types(id) ON DELETE CASCADE,
  rm_key TEXT NOT NULL,
  kg_per_batch NUMERIC(12, 3) NOT NULL CHECK (kg_per_batch >= 0),
  UNIQUE (brick_type_id, rm_key)
);

CREATE INDEX IF NOT EXISTS idx_std_cost_recipe_lines_brick_type
  ON public.std_cost_recipe_lines (brick_type_id);

-- ------------------------------------------------------- monthly fixed cost -

CREATE TABLE IF NOT EXISTS public.std_cost_fixed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.std_cost_versions(id) ON DELETE CASCADE,
  -- 'machine_repair','rent','misc','stacking_curing','manager_salary','marketing'
  item_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  monthly_amount NUMERIC(12, 2) NOT NULL CHECK (monthly_amount >= 0),
  UNIQUE (version_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_std_cost_fixed_items_version
  ON public.std_cost_fixed_items (version_id);

-- ============================================================================
-- Immutability: a published version and everything hanging off it is frozen.
-- The app never edits published rows, but "immutable" is a promise to the
-- Intelligence Layer, so the database enforces it rather than trusting code.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.std_cost_guard_published()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_version UUID;
BEGIN
  IF TG_TABLE_NAME = 'std_cost_versions' THEN
    -- Publishing (draft -> published) and archiving a published version are the
    -- only transitions allowed; a published version's numbers never change.
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'Published standard cost versions cannot be deleted';
      END IF;
      RETURN OLD;
    END IF;
    IF OLD.status = 'published' AND NEW.status = 'published' THEN
      IF (NEW.monthly_production_basis, NEW.valid_from, NEW.notes)
         IS DISTINCT FROM (OLD.monthly_production_basis, OLD.valid_from, OLD.notes) THEN
        RAISE EXCEPTION 'Published standard cost version % is immutable', OLD.id;
      END IF;
    ELSIF OLD.status = 'published' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'A published version cannot be turned back into a draft; create a new draft from it';
    END IF;
    RETURN NEW;
  END IF;

  -- child tables: resolve the owning version
  IF TG_TABLE_NAME = 'std_cost_recipe_lines' THEN
    SELECT bt.version_id INTO v_version FROM public.std_cost_brick_types bt
      WHERE bt.id = COALESCE(NEW.brick_type_id, OLD.brick_type_id);
  ELSE
    v_version := COALESCE(NEW.version_id, OLD.version_id);
  END IF;

  SELECT status INTO v_status FROM public.std_cost_versions WHERE id = v_version;
  IF v_status = 'published' THEN
    RAISE EXCEPTION 'Version % is published and immutable (table %)', v_version, TG_TABLE_NAME;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS std_cost_versions_guard ON public.std_cost_versions;
CREATE TRIGGER std_cost_versions_guard
  BEFORE UPDATE OR DELETE ON public.std_cost_versions
  FOR EACH ROW EXECUTE FUNCTION public.std_cost_guard_published();

DROP TRIGGER IF EXISTS std_cost_rm_prices_guard ON public.std_cost_rm_prices;
CREATE TRIGGER std_cost_rm_prices_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.std_cost_rm_prices
  FOR EACH ROW EXECUTE FUNCTION public.std_cost_guard_published();

DROP TRIGGER IF EXISTS std_cost_brick_types_guard ON public.std_cost_brick_types;
CREATE TRIGGER std_cost_brick_types_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.std_cost_brick_types
  FOR EACH ROW EXECUTE FUNCTION public.std_cost_guard_published();

DROP TRIGGER IF EXISTS std_cost_recipe_lines_guard ON public.std_cost_recipe_lines;
CREATE TRIGGER std_cost_recipe_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.std_cost_recipe_lines
  FOR EACH ROW EXECUTE FUNCTION public.std_cost_guard_published();

DROP TRIGGER IF EXISTS std_cost_fixed_items_guard ON public.std_cost_fixed_items;
CREATE TRIGGER std_cost_fixed_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.std_cost_fixed_items
  FOR EACH ROW EXECUTE FUNCTION public.std_cost_guard_published();

-- The publish path needs ONE controlled write of the published row (status,
-- valid_from, published_by/at). It happens inside publish_std_cost_draft()
-- below, which flips status draft -> published in a single UPDATE — allowed by
-- the guard because OLD.status is still 'draft' at that moment.

-- ============================================================================
-- Computation — the single SQL source of truth (§6 of the PRD).
-- Mirrored exactly in packages/shared/src/unit-economics.ts for live editing;
-- packages/shared/src/unit-economics.test.ts pins both to the same numbers.
-- Full precision here; rounding happens only at the contract views / display.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_std_cost_brick_type_computed
WITH (security_invoker = true) AS
WITH fixed_totals AS (
  SELECT version_id, SUM(monthly_amount) AS monthly_fixed_total
  FROM public.std_cost_fixed_items
  GROUP BY version_id
),
material AS (
  SELECT rl.brick_type_id,
         -- Divide at full precision rather than through the stored 4-dp
         -- cost_per_kg column, so this matches computeRmCostPerKg() exactly.
         SUM(rl.kg_per_batch * (rm.purchase_amount / rm.purchase_unit_kg))
           AS material_cost_per_batch,
         MAX(rl.kg_per_batch) FILTER (WHERE rl.rm_key = 'cement') AS cement_kg_per_batch
  FROM public.std_cost_recipe_lines rl
  JOIN public.std_cost_brick_types bt ON bt.id = rl.brick_type_id
  JOIN public.std_cost_rm_prices rm
    ON rm.version_id = bt.version_id AND rm.rm_key = rl.rm_key
  GROUP BY rl.brick_type_id
)
SELECT
  bt.id                                   AS brick_type_id,
  bt.version_id,
  bt.brick_type,
  bt.odoo_product_match,
  bt.bricks_per_batch,
  bt.sales_price,
  bt.loading_unloading_per_unit,
  bt.transport_per_unit,
  bt.commission_per_unit,
  bt.sort_order,
  COALESCE(m.material_cost_per_batch, 0)                       AS material_cost_per_batch,
  COALESCE(m.material_cost_per_batch, 0) / bt.bricks_per_batch AS material_cost_per_unit,
  bt.labor_cost_per_batch,
  bt.labor_cost_per_batch / bt.bricks_per_batch                AS labor_cost_per_unit,
  bt.electricity_per_unit + bt.depreciation_per_unit           AS overhead_per_unit,
  (COALESCE(m.material_cost_per_batch, 0) / bt.bricks_per_batch)
    + (bt.labor_cost_per_batch / bt.bricks_per_batch)
    + bt.electricity_per_unit + bt.depreciation_per_unit       AS variable_cost_per_unit,
  COALESCE(f.monthly_fixed_total, 0) / v.monthly_production_basis AS fixed_cost_per_unit,
  (COALESCE(m.material_cost_per_batch, 0) / bt.bricks_per_batch)
    + (bt.labor_cost_per_batch / bt.bricks_per_batch)
    + bt.electricity_per_unit + bt.depreciation_per_unit
    + COALESCE(f.monthly_fixed_total, 0) / v.monthly_production_basis AS total_cost_per_unit,
  CASE WHEN bt.sales_price IS NULL THEN NULL ELSE
    bt.sales_price
      - COALESCE(bt.loading_unloading_per_unit, 0)
      - COALESCE(bt.transport_per_unit, 0)
      - COALESCE(bt.commission_per_unit, 0)
      - ((COALESCE(m.material_cost_per_batch, 0) / bt.bricks_per_batch)
         + (bt.labor_cost_per_batch / bt.bricks_per_batch)
         + bt.electricity_per_unit + bt.depreciation_per_unit
         + COALESCE(f.monthly_fixed_total, 0) / v.monthly_production_basis)
  END                                                          AS margin_per_unit,
  CASE WHEN COALESCE(m.cement_kg_per_batch, 0) > 0
       THEN bt.bricks_per_batch * 50 / m.cement_kg_per_batch
  END                                                          AS bricks_per_cement_bag,
  v.monthly_production_basis,
  COALESCE(f.monthly_fixed_total, 0)                           AS monthly_fixed_total,
  v.status,
  v.valid_from,
  v.published_at
FROM public.std_cost_brick_types bt
JOIN public.std_cost_versions v ON v.id = bt.version_id
LEFT JOIN material m ON m.brick_type_id = bt.id
LEFT JOIN fixed_totals f ON f.version_id = bt.version_id;

-- ============================================================================
-- FROZEN INTEGRATION CONTRACT (§8) — the Maiyuri Intelligence Layer reads
-- exactly these two views. NEVER rename the views or their columns, and never
-- change brick_type / product_match values without a downstream handshake.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_standard_costs_current
WITH (security_invoker = true) AS
SELECT c.brick_type,
       c.odoo_product_match              AS product_match,
       ROUND(c.variable_cost_per_unit, 2) AS variable_cost_per_unit,
       ROUND(c.fixed_cost_per_unit, 2)    AS fixed_cost_per_unit,
       ROUND(c.total_cost_per_unit, 2)    AS total_cost_per_unit,
       ROUND(c.labor_cost_per_unit, 2)    AS labor_cost_per_unit,
       c.bricks_per_batch,
       c.monthly_production_basis,
       c.sales_price,
       c.valid_from,
       c.published_at,
       c.version_id
FROM public.v_std_cost_brick_type_computed c
WHERE c.status = 'published'
  AND c.valid_from = (
    SELECT MAX(valid_from) FROM public.std_cost_versions WHERE status = 'published'
  );

CREATE OR REPLACE VIEW public.v_standard_rm_prices_current
WITH (security_invoker = true) AS
SELECT rm.rm_key, rm.display_name, rm.purchase_amount, rm.purchase_unit_label,
       rm.purchase_unit_kg, rm.cost_per_kg, v.valid_from, v.published_at
FROM public.std_cost_rm_prices rm
JOIN public.std_cost_versions v ON v.id = rm.version_id
WHERE v.status = 'published'
  AND v.valid_from = (
    SELECT MAX(valid_from) FROM public.std_cost_versions WHERE status = 'published'
  );

COMMENT ON VIEW public.v_standard_costs_current IS
  'FROZEN CONTRACT — read by the Maiyuri Intelligence Layer. Do not rename view or columns.';
COMMENT ON VIEW public.v_standard_rm_prices_current IS
  'FROZEN CONTRACT — read by the Maiyuri Intelligence Layer. Do not rename view or columns.';

-- ============================================================================
-- Publish — draft becomes an immutable published version, and a fresh draft is
-- opened as a copy of it. Done in ONE function so it is atomic: there is never
-- a moment with two drafts, or none.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.publish_std_cost_draft(
  p_draft_id UUID,
  p_valid_from DATE,
  p_published_by UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_draft UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM std_cost_versions WHERE id = p_draft_id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Version % is not the open draft', p_draft_id;
  END IF;

  -- A later-or-equal valid_from would leave the contract views pointing at the
  -- wrong version, so the standard must move forward in time.
  IF EXISTS (
    SELECT 1 FROM std_cost_versions
    WHERE status = 'published' AND valid_from >= p_valid_from
  ) THEN
    RAISE EXCEPTION 'valid_from % must be after the currently published version', p_valid_from;
  END IF;

  UPDATE std_cost_versions
     SET status = 'published',
         valid_from = p_valid_from,
         published_by = p_published_by,
         published_at = now(),
         notes = COALESCE(p_notes, notes)
   WHERE id = p_draft_id;

  -- Fresh draft, copied from what was just published.
  INSERT INTO std_cost_versions (status, monthly_production_basis, notes, created_by, updated_by)
  SELECT 'draft', monthly_production_basis, NULL, p_published_by, p_published_by
  FROM std_cost_versions WHERE id = p_draft_id
  RETURNING id INTO v_new_draft;

  INSERT INTO std_cost_rm_prices
    (version_id, rm_key, display_name, purchase_amount, purchase_unit_label, purchase_unit_kg)
  SELECT v_new_draft, rm_key, display_name, purchase_amount, purchase_unit_label, purchase_unit_kg
  FROM std_cost_rm_prices WHERE version_id = p_draft_id;

  INSERT INTO std_cost_fixed_items (version_id, item_key, display_name, monthly_amount)
  SELECT v_new_draft, item_key, display_name, monthly_amount
  FROM std_cost_fixed_items WHERE version_id = p_draft_id;

  WITH copied AS (
    INSERT INTO std_cost_brick_types
      (version_id, brick_type, odoo_product_match, bricks_per_batch, labor_cost_per_batch,
       electricity_per_unit, depreciation_per_unit, sales_price, loading_unloading_per_unit,
       transport_per_unit, commission_per_unit, sort_order)
    SELECT v_new_draft, brick_type, odoo_product_match, bricks_per_batch, labor_cost_per_batch,
           electricity_per_unit, depreciation_per_unit, sales_price, loading_unloading_per_unit,
           transport_per_unit, commission_per_unit, sort_order
    FROM std_cost_brick_types WHERE version_id = p_draft_id
    RETURNING id, brick_type
  )
  INSERT INTO std_cost_recipe_lines (brick_type_id, rm_key, kg_per_batch)
  SELECT copied.id, rl.rm_key, rl.kg_per_batch
  FROM copied
  JOIN std_cost_brick_types old_bt
    ON old_bt.version_id = p_draft_id AND old_bt.brick_type = copied.brick_type
  JOIN std_cost_recipe_lines rl ON rl.brick_type_id = old_bt.id;

  RETURN v_new_draft;
END $$;

REVOKE ALL ON FUNCTION public.publish_std_cost_draft(UUID, DATE, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_std_cost_draft(UUID, DATE, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.publish_std_cost_draft(UUID, DATE, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_std_cost_draft(UUID, DATE, UUID, TEXT) TO service_role;

-- ============================================================================
-- RLS. Authenticated staff READ everything (history is not a secret inside the
-- company). NO write policy exists on any table: every mutation goes through
-- the API on the service-role client, which enforces "staff edit the draft,
-- only admins publish". anon can read nothing.
-- ============================================================================

ALTER TABLE public.std_cost_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.std_cost_rm_prices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.std_cost_brick_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.std_cost_recipe_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.std_cost_fixed_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS std_cost_versions_read ON public.std_cost_versions;
CREATE POLICY std_cost_versions_read ON public.std_cost_versions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS std_cost_rm_prices_read ON public.std_cost_rm_prices;
CREATE POLICY std_cost_rm_prices_read ON public.std_cost_rm_prices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS std_cost_brick_types_read ON public.std_cost_brick_types;
CREATE POLICY std_cost_brick_types_read ON public.std_cost_brick_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS std_cost_recipe_lines_read ON public.std_cost_recipe_lines;
CREATE POLICY std_cost_recipe_lines_read ON public.std_cost_recipe_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS std_cost_fixed_items_read ON public.std_cost_fixed_items;
CREATE POLICY std_cost_fixed_items_read ON public.std_cost_fixed_items
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.std_cost_versions     FROM anon;
REVOKE ALL ON public.std_cost_rm_prices    FROM anon;
REVOKE ALL ON public.std_cost_brick_types  FROM anon;
REVOKE ALL ON public.std_cost_recipe_lines FROM anon;
REVOKE ALL ON public.std_cost_fixed_items  FROM anon;
REVOKE ALL ON public.v_std_cost_brick_type_computed FROM anon;
REVOKE ALL ON public.v_standard_costs_current       FROM anon;
REVOKE ALL ON public.v_standard_rm_prices_current   FROM anon;

-- Explicit grants rather than relying on Supabase's default privileges for
-- new objects, so the same migration is correct on any database.
-- authenticated gets SELECT only: with RLS on and no write policy, every
-- mutation has to come through the API's service-role client, where the
-- "staff edit the draft, only management publishes" rule actually lives.
GRANT SELECT ON public.std_cost_versions     TO authenticated;
GRANT SELECT ON public.std_cost_rm_prices    TO authenticated;
GRANT SELECT ON public.std_cost_brick_types  TO authenticated;
GRANT SELECT ON public.std_cost_recipe_lines TO authenticated;
GRANT SELECT ON public.std_cost_fixed_items  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.std_cost_versions     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.std_cost_rm_prices    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.std_cost_brick_types  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.std_cost_recipe_lines TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.std_cost_fixed_items  TO service_role;

-- The Intelligence Layer reads with the same role it already uses for
-- public.leads. If that is a role other than service_role, it needs SELECT on
-- these five base tables and a SELECT policy — the views are security_invoker,
-- so they never hand out more access than the reader already has.
-- authenticated staff read the same views in-app.
GRANT SELECT ON public.v_std_cost_brick_type_computed TO authenticated, service_role;
GRANT SELECT ON public.v_standard_costs_current       TO authenticated, service_role;
GRANT SELECT ON public.v_standard_rm_prices_current   TO authenticated, service_role;
