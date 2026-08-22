-- ============================================================================
-- Unit Economics — reference (benchmark) costs, kept SEPARATE from the standard
--
-- The computed standard is what it is: recipes × prices, no balancing factors,
-- no plugs. But we still need to answer "why is 8 CIB ₹5.77 below the old
-- costing?" — so legacy and benchmark numbers are stored ALONGSIDE the
-- standard, never inside it.
--
-- Hard rule, enforced by construction: nothing in this file feeds any
-- computation. std_cost_reference_costs is not referenced by
-- v_std_cost_brick_type_computed, by the two frozen contract views, or by
-- computeBundle() in TypeScript. A reference cost can only ever be DISPLAYED
-- next to a computed cost and subtracted from it. Correcting a business input
-- happens by editing the draft and publishing a new version — never by
-- nudging a reference number until the variance disappears.
--
-- Two axes of component breakdown, both optional:
--   'cost_element'  material · labour · electricity · depreciation · fixed ·
--                   other — mutually exclusive, they sum to the reference
--                   total, and each maps 1:1 onto a computed number. The
--                   UNEXPLAINED residual is measured on this axis only.
--   'raw_material'  cement · chemical · … — a drill-down INSIDE the material
--                   element, so "cement consumption differs by ₹0.62" is
--                   answerable. Deliberately NOT added to the cost_element
--                   sum; doing so would double-count material.
-- ============================================================================

-- --------------------------------------------- inputs that need verifying ---
-- An input can be in use and still be known-uncertain (the red soil load
-- weight: 3,705 kg or 37,050 kg — a 10x difference in a real cost driver).
-- Marking the INPUT is the honest way to carry that: the number stays what we
-- believe it is, the doubt is recorded against it, and when the truth is known
-- it is corrected through a normal publish that version history explains.
ALTER TABLE public.std_cost_rm_prices
  ADD COLUMN IF NOT EXISTS needs_verification BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.std_cost_rm_prices
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

COMMENT ON COLUMN public.std_cost_rm_prices.needs_verification IS
  'This input is in use but unconfirmed. Never a reason to alter a formula — correct the input and publish.';

-- ------------------------------------------------------- reference costs ----

CREATE TABLE IF NOT EXISTS public.std_cost_reference_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches std_cost_brick_types.brick_type by value, deliberately WITHOUT a
  -- foreign key: a benchmark outlives any one version, and a legacy number for
  -- a discontinued product is still worth keeping.
  brick_type TEXT NOT NULL,
  reference_cost NUMERIC(12, 4) NOT NULL CHECK (reference_cost >= 0),
  source TEXT NOT NULL CHECK (source IN (
    'legacy_excel', 'manual_benchmark', 'historical_actual', 'competitor', 'other'
  )),
  source_label TEXT,                    -- e.g. 'Mb Unit Economics sheet'
  reference_date DATE NOT NULL,         -- what date this benchmark speaks for
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brick_type, source, reference_date)
);

CREATE INDEX IF NOT EXISTS idx_std_cost_reference_costs_active
  ON public.std_cost_reference_costs (brick_type, reference_date DESC) WHERE is_active;

DROP TRIGGER IF EXISTS set_std_cost_reference_costs_updated_at ON public.std_cost_reference_costs;
CREATE TRIGGER set_std_cost_reference_costs_updated_at
  BEFORE UPDATE ON public.std_cost_reference_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.std_cost_reference_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_cost_id UUID NOT NULL
    REFERENCES public.std_cost_reference_costs(id) ON DELETE CASCADE,
  component_kind TEXT NOT NULL CHECK (component_kind IN ('cost_element', 'raw_material')),
  component_key TEXT NOT NULL,
  amount NUMERIC(12, 4) NOT NULL CHECK (amount >= 0),
  -- cost_element keys are a closed set because each must map onto a computed
  -- number; raw_material keys are open, matching std_cost_rm_prices.rm_key.
  CONSTRAINT std_cost_reference_components_cost_element_key CHECK (
    component_kind <> 'cost_element' OR component_key IN (
      'material', 'labour', 'electricity', 'depreciation', 'fixed', 'other'
    )
  ),
  UNIQUE (reference_cost_id, component_kind, component_key)
);

CREATE INDEX IF NOT EXISTS idx_std_cost_reference_components_parent
  ON public.std_cost_reference_components (reference_cost_id);

-- ============================================================================
-- Variance views — computed standard vs reference, for the Intelligence Layer.
-- Mirrored in computeReferenceVariance() in packages/shared for the live UI.
-- ============================================================================

-- Per-component differences. computed_amount is NULL where a reference
-- component has no computed counterpart ('other'), so it stays visible as
-- unmatched rather than silently reading as a zero difference.
CREATE OR REPLACE VIEW public.v_std_cost_reference_component_variance
WITH (security_invoker = true) AS
WITH current_computed AS (
  SELECT c.*, bt.electricity_per_unit, bt.depreciation_per_unit
  FROM public.v_std_cost_brick_type_computed c
  JOIN public.std_cost_brick_types bt ON bt.id = c.brick_type_id
  WHERE c.status = 'published'
    AND c.valid_from = (
      SELECT MAX(valid_from) FROM public.std_cost_versions WHERE status = 'published'
    )
),
recipe_per_unit AS (
  SELECT bt.brick_type,
         rl.rm_key,
         (rl.kg_per_batch * (rm.purchase_amount / rm.purchase_unit_kg)) / bt.bricks_per_batch
           AS cost_per_unit
  FROM public.std_cost_recipe_lines rl
  JOIN public.std_cost_brick_types bt ON bt.id = rl.brick_type_id
  JOIN public.std_cost_rm_prices rm
    ON rm.version_id = bt.version_id AND rm.rm_key = rl.rm_key
  JOIN current_computed cc ON cc.brick_type_id = bt.id
)
SELECT
  r.id                          AS reference_id,
  r.brick_type,
  r.source,
  r.reference_date,
  rc.component_kind,
  rc.component_key,
  rc.amount                     AS reference_amount,
  CASE rc.component_kind
    WHEN 'cost_element' THEN CASE rc.component_key
      WHEN 'material'     THEN cc.material_cost_per_unit
      WHEN 'labour'       THEN cc.labor_cost_per_unit
      WHEN 'electricity'  THEN cc.electricity_per_unit
      WHEN 'depreciation' THEN cc.depreciation_per_unit
      WHEN 'fixed'        THEN cc.fixed_cost_per_unit
      ELSE NULL                              -- 'other' has no counterpart
    END
    ELSE (SELECT rpu.cost_per_unit FROM recipe_per_unit rpu
           WHERE rpu.brick_type = r.brick_type AND rpu.rm_key = rc.component_key)
  END                           AS computed_amount,
  CASE rc.component_kind
    WHEN 'cost_element' THEN CASE rc.component_key
      WHEN 'material'     THEN ROUND(cc.material_cost_per_unit - rc.amount, 4)
      WHEN 'labour'       THEN ROUND(cc.labor_cost_per_unit - rc.amount, 4)
      WHEN 'electricity'  THEN ROUND(cc.electricity_per_unit - rc.amount, 4)
      WHEN 'depreciation' THEN ROUND(cc.depreciation_per_unit - rc.amount, 4)
      WHEN 'fixed'        THEN ROUND(cc.fixed_cost_per_unit - rc.amount, 4)
      ELSE NULL
    END
    ELSE ROUND(COALESCE((SELECT rpu.cost_per_unit FROM recipe_per_unit rpu
                          WHERE rpu.brick_type = r.brick_type
                            AND rpu.rm_key = rc.component_key), 0) - rc.amount, 4)
  END                           AS difference
FROM public.std_cost_reference_costs r
JOIN public.std_cost_reference_components rc ON rc.reference_cost_id = r.id
LEFT JOIN current_computed cc ON cc.brick_type = r.brick_type
WHERE r.is_active;

-- Headline reconciliation, one row per brick type per active reference.
CREATE OR REPLACE VIEW public.v_std_cost_reference_variance
WITH (security_invoker = true) AS
WITH current_computed AS (
  SELECT c.*
  FROM public.v_std_cost_brick_type_computed c
  WHERE c.status = 'published'
    AND c.valid_from = (
      SELECT MAX(valid_from) FROM public.std_cost_versions WHERE status = 'published'
    )
),
explained AS (
  -- Only the cost_element axis: the raw_material rows live INSIDE material and
  -- adding them here would double-count.
  SELECT reference_id, SUM(difference) AS explained_difference
  FROM public.v_std_cost_reference_component_variance
  WHERE component_kind = 'cost_element' AND difference IS NOT NULL
  GROUP BY reference_id
)
SELECT
  r.brick_type,
  r.id                                        AS reference_id,
  r.source,
  r.source_label,
  r.reference_date,
  r.notes,
  ROUND(cc.total_cost_per_unit, 2)            AS computed_cost_per_unit,
  r.reference_cost,
  ROUND(cc.total_cost_per_unit - r.reference_cost, 2) AS variance_amount,
  CASE WHEN r.reference_cost > 0
       THEN ROUND((cc.total_cost_per_unit - r.reference_cost) / r.reference_cost * 100, 2)
  END                                         AS variance_pct,
  ROUND(COALESCE(e.explained_difference, 0), 2)       AS explained_difference,
  -- What the stored breakdown does NOT account for. With no breakdown at all
  -- this equals the whole variance, which is the honest answer.
  ROUND((cc.total_cost_per_unit - r.reference_cost) - COALESCE(e.explained_difference, 0), 2)
                                              AS unexplained_difference,
  EXISTS (SELECT 1 FROM public.std_cost_reference_components rc
           WHERE rc.reference_cost_id = r.id)  AS has_component_breakdown,
  cc.version_id,
  cc.valid_from,
  cc.published_at
FROM public.std_cost_reference_costs r
JOIN current_computed cc ON cc.brick_type = r.brick_type
LEFT JOIN explained e ON e.reference_id = r.id
WHERE r.is_active;

COMMENT ON VIEW public.v_std_cost_reference_variance IS
  'Computed standard vs stored benchmarks. Read by the Intelligence Layer for exception analysis. References never feed the computation.';

-- ============================================================================
-- publish_std_cost_draft() — carry the verification flags into the next draft.
-- Otherwise a published-then-copied draft would quietly lose the record that an
-- input is still unconfirmed.
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

  INSERT INTO std_cost_versions (status, monthly_production_basis, notes, created_by, updated_by)
  SELECT 'draft', monthly_production_basis, NULL, p_published_by, p_published_by
  FROM std_cost_versions WHERE id = p_draft_id
  RETURNING id INTO v_new_draft;

  INSERT INTO std_cost_rm_prices
    (version_id, rm_key, display_name, purchase_amount, purchase_unit_label, purchase_unit_kg,
     needs_verification, verification_note)
  SELECT v_new_draft, rm_key, display_name, purchase_amount, purchase_unit_label, purchase_unit_kg,
         needs_verification, verification_note
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

-- ------------------------------------------------------------------- RLS ----

ALTER TABLE public.std_cost_reference_costs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.std_cost_reference_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS std_cost_reference_costs_read ON public.std_cost_reference_costs;
CREATE POLICY std_cost_reference_costs_read ON public.std_cost_reference_costs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS std_cost_reference_components_read ON public.std_cost_reference_components;
CREATE POLICY std_cost_reference_components_read ON public.std_cost_reference_components
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.std_cost_reference_costs      FROM anon;
REVOKE ALL ON public.std_cost_reference_components FROM anon;
REVOKE ALL ON public.v_std_cost_reference_variance           FROM anon;
REVOKE ALL ON public.v_std_cost_reference_component_variance FROM anon;

GRANT SELECT ON public.std_cost_reference_costs      TO authenticated;
GRANT SELECT ON public.std_cost_reference_components TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.std_cost_reference_costs      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.std_cost_reference_components TO service_role;
GRANT SELECT ON public.v_std_cost_reference_variance           TO authenticated, service_role;
GRANT SELECT ON public.v_std_cost_reference_component_variance TO authenticated, service_role;
