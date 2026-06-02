-- Smart Quote 2.0: real interactive pricing.
-- Adds a pricing_config to each smart quote — the staff-reviewed defaults that
-- drive the customer-facing instant estimate (which products are offered, the
-- default area/quantity, delivery distance, and the rep's WhatsApp number).

ALTER TABLE public.smart_quotes
  ADD COLUMN IF NOT EXISTS pricing_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.smart_quotes.pricing_config IS
  'Smart Quote 2.0 interactive-estimate config: { allowed_products[], default_product, default_area_sqft, default_distance_km, locality_label, show_transport, price_note, rep_phone }';
