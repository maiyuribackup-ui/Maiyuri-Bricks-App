-- Marketing & Sales Command Center — Phase 1: native commercial fields.
-- Adds staff-entered deal-value columns (so dashboard revenue/pipeline figures
-- are REAL, replacing the previous Math.random() placeholder) plus event
-- timestamps for funnel-duration analytics (factory-visit conversion, time to
-- win/lose). All additive + nullable; safe to apply ahead of code.
-- NOTE: `area` already exists on leads — intentionally NOT added here.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estimated_value    numeric,
  ADD COLUMN IF NOT EXISTS estimated_quantity numeric,
  ADD COLUMN IF NOT EXISTS final_order_value  numeric,
  ADD COLUMN IF NOT EXISTS factory_visit_at   timestamptz,
  ADD COLUMN IF NOT EXISTS won_at             timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at            timestamptz;

COMMENT ON COLUMN public.leads.estimated_value IS
  'Staff-entered (or Smart-Quote-seeded) estimated deal value in INR — drives pipeline value KPI.';
COMMENT ON COLUMN public.leads.estimated_quantity IS
  'Estimated quantity (bricks / sq.ft) for this lead.';
COMMENT ON COLUMN public.leads.final_order_value IS
  'Confirmed order value in INR once pipeline_stage = order_won — drives revenue KPI & leaderboard.';
COMMENT ON COLUMN public.leads.factory_visit_at IS
  'Timestamp when factory_visit_status first became "visited" — for visit→order duration analytics.';
COMMENT ON COLUMN public.leads.won_at IS
  'Timestamp when pipeline_stage first became "order_won".';
COMMENT ON COLUMN public.leads.lost_at IS
  'Timestamp when pipeline_stage first became "closed_lost".';
