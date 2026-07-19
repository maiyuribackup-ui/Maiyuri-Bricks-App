-- Rate card (Golden Hour GH0): the business prices DELIVERED, per product,
-- by distance band (e.g. CIB 8" · 0-20km → ₹18/pc · 20-50km → ₹19.5/pc).
-- Bands are configurable by management; the auto-quote and AI pre-call brief
-- resolve prices from here, falling back to products.base_price when no band
-- covers the distance.
CREATE TABLE IF NOT EXISTS public.rate_card_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  km_from NUMERIC(6, 1) NOT NULL CHECK (km_from >= 0),
  km_to NUMERIC(6, 1) NOT NULL CHECK (km_to > km_from),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, km_from, km_to)
);

CREATE INDEX IF NOT EXISTS idx_rate_card_product
  ON public.rate_card_entries (product_id) WHERE is_active;

ALTER TABLE public.rate_card_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rate_card_read" ON public.rate_card_entries;
CREATE POLICY "rate_card_read" ON public.rate_card_entries
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_rate_card_updated_at ON public.rate_card_entries;
CREATE TRIGGER set_rate_card_updated_at
  BEFORE UPDATE ON public.rate_card_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
