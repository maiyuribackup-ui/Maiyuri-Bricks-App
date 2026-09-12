-- ============================================================================
-- Quotation document: the commercial facts a customer can forward to a
-- contractor, a bank, or their family.
--
-- Company identity and terms live once, on factory_settings. Every value is
-- NULL by default and must be entered by the business — a GST number, a
-- payment term or a delivery promise invented by software is a liability, so
-- the PDF omits any block whose facts are missing rather than guessing.
--
-- Per-quote, a quotation needs an identity and an expiry: quote_number and
-- valid_until.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Company identity + standing commercial terms
-- ----------------------------------------------------------------------------
ALTER TABLE public.factory_settings
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS registered_address TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  -- Free text so the business words its own terms.
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS delivery_terms TEXT,
  ADD COLUMN IF NOT EXISTS quote_footer_note TEXT,
  ADD COLUMN IF NOT EXISTS quote_validity_days INTEGER NOT NULL DEFAULT 15;

COMMENT ON COLUMN public.factory_settings.gstin IS
  'GSTIN printed on quotations. NULL until the business enters it — never seed a placeholder.';
COMMENT ON COLUMN public.factory_settings.payment_terms IS
  'Payment terms in the business own words, e.g. "50% advance, balance before dispatch".';

-- ----------------------------------------------------------------------------
-- Quotation identity and expiry
-- ----------------------------------------------------------------------------
ALTER TABLE public.smart_quotes
  ADD COLUMN IF NOT EXISTS quote_number TEXT,
  ADD COLUMN IF NOT EXISTS valid_until DATE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_smart_quotes_quote_number
  ON public.smart_quotes(quote_number)
  WHERE quote_number IS NOT NULL;

-- Sequence drives the running number; the year prefix is applied in SQL below
-- and by the generate route for new quotes.
CREATE SEQUENCE IF NOT EXISTS public.smart_quote_number_seq START 1;

/**
 * Assign the next quotation number, e.g. MB-2026-0042.
 * Idempotent per quote: an existing number is returned unchanged, so
 * regenerating a quote never renumbers a document already in a customer's hands.
 */
CREATE OR REPLACE FUNCTION public.assign_quote_number(p_quote_id UUID)
RETURNS TEXT AS $$
DECLARE
  existing TEXT;
  next_num TEXT;
BEGIN
  SELECT quote_number INTO existing
  FROM public.smart_quotes WHERE id = p_quote_id;

  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  next_num := 'MB-' || to_char(now(), 'YYYY') || '-' ||
              lpad(nextval('public.smart_quote_number_seq')::TEXT, 4, '0');

  UPDATE public.smart_quotes
  SET quote_number = next_num
  WHERE id = p_quote_id;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.assign_quote_number(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_quote_number(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_quote_number(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- Backfill: existing quotes get a number and an expiry derived from their own
-- creation date, so a document produced today for an old quote is honest about
-- when it was quoted.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  validity INTEGER;
BEGIN
  SELECT COALESCE(quote_validity_days, 15) INTO validity
  FROM public.factory_settings LIMIT 1;
  IF validity IS NULL THEN validity := 15; END IF;

  FOR r IN
    SELECT id, created_at FROM public.smart_quotes
    WHERE quote_number IS NULL ORDER BY created_at
  LOOP
    UPDATE public.smart_quotes
    SET quote_number = 'MB-' || to_char(r.created_at, 'YYYY') || '-' ||
                       lpad(nextval('public.smart_quote_number_seq')::TEXT, 4, '0'),
        valid_until  = COALESCE(valid_until, (r.created_at + (validity || ' days')::interval)::date)
    WHERE id = r.id;
  END LOOP;
END $$;
