-- ============================================================================
-- Reference costs: support PARTIAL component breakdowns.
--
-- The previous rule required a cost_element breakdown to sum exactly to the
-- benchmark total. That made the residual zero by construction the moment any
-- breakdown existed:
--
--   unexplained = total_variance − Σ(component variances)
--
-- and if the reference components sum to the reference total, those component
-- variances necessarily sum to the total variance. The number meant to say
-- "we still don't know why" could only ever say zero.
--
-- It also blocked the workflow reconciliation actually follows: you discover
-- one component at a time, and the unexplained amount shrinks as you go.
--
--   Total variance:    -5.77
--   Explained so far:  -4.65   (material -3.20, labour -1.45)
--   Still unexplained: -1.12   <- the whole point
--
-- So breakdown_status now distinguishes:
--   'partial'  (default) - rows may cover only part of the total. Coverage is
--              shown as 24.10 / 32.83 and the residual stays live.
--   'complete' - the user asserts the breakdown IS the whole total; only then
--              is equality enforced, within a 0.01 tolerance.
--
-- Deliberately NOT added: any automatic "balancing" component. The residual is
-- reported, never absorbed.
-- ============================================================================

ALTER TABLE public.std_cost_reference_costs
  ADD COLUMN IF NOT EXISTS breakdown_status TEXT NOT NULL DEFAULT 'partial'
    CHECK (breakdown_status IN ('partial', 'complete'));

COMMENT ON COLUMN public.std_cost_reference_costs.breakdown_status IS
  'partial: components may cover only part of the total, residual stays visible. complete: components must equal the total (0.01 tolerance).';

-- ---------------------------------------------------------------------------
-- Enforcement, deferred to commit.
--
-- Components are written as a set (delete-all then insert-all), so a row-by-row
-- check would fire mid-write against a half-built breakdown. A DEFERRABLE
-- INITIALLY DEFERRED constraint trigger evaluates once, at COMMIT, when the
-- breakdown is whole.
--
-- Two rules:
--   always     - cost elements may not exceed the total. They are exclusive
--                parts of it; summing beyond it is arithmetically impossible,
--                not a judgement call.
--   'complete' - they must equal the total, or the completeness claim is false
--                and the zero residual it produces would be a lie.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.std_cost_check_breakdown()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_reference_id UUID;
  v_total NUMERIC;
  v_status TEXT;
  v_sum NUMERIC;
  v_tolerance CONSTANT NUMERIC := 0.01;
BEGIN
  -- Branch rather than a CASE expression: PL/pgSQL resolves the record fields
  -- in every arm of a CASE, so naming reference_cost_id there fails outright
  -- when NEW is a std_cost_reference_costs row that has no such field.
  IF TG_TABLE_NAME = 'std_cost_reference_costs' THEN
    v_reference_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_reference_id := COALESCE(NEW.reference_cost_id, OLD.reference_cost_id);
  END IF;

  SELECT reference_cost, breakdown_status INTO v_total, v_status
  FROM public.std_cost_reference_costs WHERE id = v_reference_id;

  -- The parent may have been deleted in this same transaction (cascade).
  IF v_total IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM public.std_cost_reference_components
  WHERE reference_cost_id = v_reference_id AND component_kind = 'cost_element';

  IF v_sum > v_total + v_tolerance THEN
    RAISE EXCEPTION
      'Cost element breakdown (%) exceeds the reference cost (%) - elements are exclusive parts of the total',
      ROUND(v_sum, 2), ROUND(v_total, 2);
  END IF;

  IF v_status = 'complete' AND ABS(v_sum - v_total) > v_tolerance THEN
    RAISE EXCEPTION
      'Breakdown is marked complete but adds up to % against a reference cost of % - mark it partial, or account for the remaining %',
      ROUND(v_sum, 2), ROUND(v_total, 2), ROUND(v_total - v_sum, 2);
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS std_cost_reference_components_breakdown_check
  ON public.std_cost_reference_components;
CREATE CONSTRAINT TRIGGER std_cost_reference_components_breakdown_check
  AFTER INSERT OR UPDATE OR DELETE ON public.std_cost_reference_components
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.std_cost_check_breakdown();

DROP TRIGGER IF EXISTS std_cost_reference_costs_breakdown_check
  ON public.std_cost_reference_costs;
CREATE CONSTRAINT TRIGGER std_cost_reference_costs_breakdown_check
  AFTER INSERT OR UPDATE ON public.std_cost_reference_costs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.std_cost_check_breakdown();

-- ---------------------------------------------------------------------------
-- Variance view gains coverage, so "how much of this benchmark do we actually
-- understand yet" is answerable without recomputing it downstream.
-- ---------------------------------------------------------------------------
-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot insert columns
-- into the middle of the column list. Nothing else depends on this view.
DROP VIEW IF EXISTS public.v_std_cost_reference_variance;

CREATE VIEW public.v_std_cost_reference_variance
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
  -- cost_element axis only: raw_material rows live INSIDE material and adding
  -- them here would double-count.
  SELECT reference_id, SUM(difference) AS explained_difference
  FROM public.v_std_cost_reference_component_variance
  WHERE component_kind = 'cost_element' AND difference IS NOT NULL
  GROUP BY reference_id
),
coverage AS (
  SELECT reference_cost_id, SUM(amount) AS breakdown_coverage
  FROM public.std_cost_reference_components
  WHERE component_kind = 'cost_element'
  GROUP BY reference_cost_id
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
  -- What no stored component accounts for. Shrinks as components are
  -- discovered; equals the whole variance when nothing is known yet.
  ROUND((cc.total_cost_per_unit - r.reference_cost) - COALESCE(e.explained_difference, 0), 2)
                                              AS unexplained_difference,
  r.breakdown_status,
  ROUND(COALESCE(cov.breakdown_coverage, 0), 2)       AS breakdown_coverage,
  CASE WHEN r.reference_cost > 0
       THEN ROUND(COALESCE(cov.breakdown_coverage, 0) / r.reference_cost * 100, 2)
  END                                         AS breakdown_coverage_pct,
  EXISTS (SELECT 1 FROM public.std_cost_reference_components rc
           WHERE rc.reference_cost_id = r.id)  AS has_component_breakdown,
  cc.version_id,
  cc.valid_from,
  cc.published_at
FROM public.std_cost_reference_costs r
JOIN current_computed cc ON cc.brick_type = r.brick_type
LEFT JOIN explained e ON e.reference_id = r.id
LEFT JOIN coverage cov ON cov.reference_cost_id = r.id
WHERE r.is_active;

COMMENT ON VIEW public.v_std_cost_reference_variance IS
  'Computed standard vs stored benchmarks. Read by the Intelligence Layer for exception analysis. References never feed the computation; unexplained_difference is reported, never absorbed.';

GRANT SELECT ON public.v_std_cost_reference_variance TO authenticated, service_role;
REVOKE ALL ON public.v_std_cost_reference_variance FROM anon;
