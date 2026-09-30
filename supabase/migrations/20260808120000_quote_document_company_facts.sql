-- ============================================================================
-- The quotation, matched to the document Maiyuri actually sends.
--
-- The existing Odoo quotation (S00480) carries commercial facts our PDF was
-- missing, and two of them are not cosmetic:
--
--   * GST is EXTRA on their quotes ("GST : Extra as per acutal"). A total
--     printed without saying so reads as final and is materially misleading.
--   * Every line carries an HSN/SAC code (681011). It belongs on an Indian
--     tax document and a contractor's accountant will look for it.
--
-- Plus the bank block, because the terms ask for a 20% advance and a customer
-- cannot pay an advance to a document with no account on it.
--
-- The seeded values below are the business's own, taken from the quotation
-- they are sending today and from the GSTIN the founder supplied. They are
-- editable in Settings > Company & Terms; nothing here is invented.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tax treatment, standing terms, and how to pay
-- ----------------------------------------------------------------------------
ALTER TABLE public.factory_settings
  -- Free text, because the treatment is the business's to state: "GST extra
  -- as per actual", "Prices inclusive of GST", or blank to say nothing.
  ADD COLUMN IF NOT EXISTS tax_note TEXT,
  -- Everything beyond payment + delivery, one term per line. Lets the business
  -- paste the terms block it already uses rather than re-modelling it.
  ADD COLUMN IF NOT EXISTS additional_terms TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch TEXT,
  ADD COLUMN IF NOT EXISTS upi_number TEXT;

COMMENT ON COLUMN public.factory_settings.tax_note IS
  'How tax is treated on the quoted total, in the business own words. Printed directly under the total. NULL prints nothing.';
COMMENT ON COLUMN public.factory_settings.additional_terms IS
  'Standing terms beyond payment and delivery. One term per line; printed as a list.';

-- ----------------------------------------------------------------------------
-- HSN/SAC on the product, so the line item can carry it
-- ----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS hsn_code TEXT;

COMMENT ON COLUMN public.products.hsn_code IS
  'HSN/SAC code printed beside the line item, e.g. 681011 for interlocking blocks.';

-- Interlocking blocks are quoted under 681011 on the current Odoo quotation.
-- Scoped to those two categories only — 'project' work is not the same code.
UPDATE public.products
SET hsn_code = '681011'
WHERE hsn_code IS NULL
  AND category IN ('cement_interlock', 'mud_interlock');

-- ----------------------------------------------------------------------------
-- Seed the business's own facts
--
-- Address note: the quotation letterhead reads "1/303, GNT Road, Padianallur,
-- Redhills, Chennai - 52" while the website lists the factory at Ponneri.
-- The letterhead address is used here because that is what appears on the
-- commercial document today. Correct it in Settings if the registered address
-- is the other one.
-- ----------------------------------------------------------------------------
UPDATE public.factory_settings
SET
  legal_name          = COALESCE(legal_name, 'Maiyuri Bricks'),
  gstin               = COALESCE(gstin, '33AMKPK3174F1Z6'),
  registered_address  = COALESCE(registered_address,
                          '1/303, GNT Road, Padianallur, Redhills, Chennai - 600052'),
  contact_phone       = COALESCE(contact_phone, '+91 94296 90175'),
  contact_email       = COALESCE(contact_email, 'info@maiyuri.com'),
  website             = COALESCE(website, 'www.maiyuri.com'),
  tax_note            = COALESCE(tax_note, 'GST extra, as per actual.'),
  payment_terms       = COALESCE(payment_terms,
                          '20% advance against this quotation; balance immediate on delivery.'),
  delivery_terms      = COALESCE(delivery_terms,
                          '30 days from the date of advance payment.'),
  additional_terms    = COALESCE(additional_terms,
    'The price is inclusive of loading, unloading and transportation.' || E'\n' ||
    'Material is unloaded next to our vehicle.' || E'\n' ||
    'Road access suitable for an Eicher vehicle is required at the site.' || E'\n' ||
    'One load carries 900 blocks (8") or 1,000 blocks (6").'),
  bank_account_name   = COALESCE(bank_account_name, 'Maiyuri Bricks'),
  bank_account_number = COALESCE(bank_account_number, '510909010289320'),
  bank_ifsc           = COALESCE(bank_ifsc, 'CIUB0000389'),
  bank_name           = COALESCE(bank_name, 'City Union Bank'),
  bank_branch         = COALESCE(bank_branch, 'Red Hills'),
  upi_number          = COALESCE(upi_number, '6383579119'),
  quote_footer_note   = COALESCE(quote_footer_note,
                          'Maiyuri Bricks — your eco-friendly construction partner.')
WHERE id = (SELECT id FROM public.factory_settings ORDER BY updated_at LIMIT 1);
