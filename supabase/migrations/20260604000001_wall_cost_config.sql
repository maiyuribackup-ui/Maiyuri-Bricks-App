-- Total-Cost-of-Construction comparison (BusinessAnalyst #1).
-- Global founder template lives on factory_settings; each smart quote snapshots
-- it so a shared quote's numbers never change and the rep can personalize them.

-- Global template (founder-owned, edited at /settings → Wall System Costs).
ALTER TABLE public.factory_settings
  ADD COLUMN IF NOT EXISTS wall_cost_config JSONB;

COMMENT ON COLUMN public.factory_settings.wall_cost_config IS
  'Founder-owned wall-system cost template (₹/sq.ft): interlock/red_brick/aac × masonry_units/mortar_cement/plastering/labour. is_seeded_placeholder=true until real values entered.';

-- Per-quote snapshot (personalizable; frozen once shared).
ALTER TABLE public.smart_quotes
  ADD COLUMN IF NOT EXISTS wall_cost_config JSONB;

COMMENT ON COLUMN public.smart_quotes.wall_cost_config IS
  'Snapshot of wall_cost_config taken at generate time; rep-editable per customer. NULL for legacy quotes (page falls back to the global template).';

-- Seed the existing factory_settings row with clearly-flagged PLACEHOLDER values
-- so the comparison renders immediately; the founder replaces them in settings.
UPDATE public.factory_settings
SET wall_cost_config = '{
  "interlock": {"masonry_units": 55, "mortar_cement": 8,  "plastering": 0,  "labour": 22},
  "red_brick": {"masonry_units": 48, "mortar_cement": 18, "plastering": 35, "labour": 38},
  "aac":       {"masonry_units": 60, "mortar_cement": 14, "plastering": 32, "labour": 30},
  "is_seeded_placeholder": true
}'::jsonb
WHERE wall_cost_config IS NULL;
