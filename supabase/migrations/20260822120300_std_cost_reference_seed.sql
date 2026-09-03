-- ============================================================================
-- Seed the legacy benchmarks from the retiring "Mb Unit Economics" sheet, and
-- mark the two unconfirmed inputs.
--
-- These totals go into std_cost_reference_costs — NOT into the standard. The
-- computed standard keeps saying what the recipes and prices say; the sheet's
-- totals sit next to it as a benchmark, and the difference becomes a question
-- the Intelligence Layer can be asked, rather than a number anyone is tempted
-- to reverse-engineer.
--
-- No component breakdown is seeded because the sheet did not publish one. That
-- is deliberate: every rupee of variance shows as UNEXPLAINED until someone
-- supplies a real breakdown. An invented breakdown that happened to sum to the
-- gap would be exactly the balancing factor this design exists to prevent.
-- ============================================================================

DO $$
DECLARE
  v_draft UUID;
BEGIN
  -- ---------------------------------------- legacy sheet totals as benchmarks
  INSERT INTO public.std_cost_reference_costs
    (brick_type, reference_cost, source, source_label, reference_date, notes)
  VALUES
    ('8 CIB', 32.83, 'legacy_excel', 'Mb Unit Economics sheet', CURRENT_DATE,
     'Total cost/unit as the sheet displayed it at go-live. The sheet''s own inputs do not compute to this.'),
    ('6 CIB', 31.80, 'legacy_excel', 'Mb Unit Economics sheet', CURRENT_DATE,
     'Total cost/unit as the sheet displayed it at go-live. The sheet''s own inputs do not compute to this.'),
    ('8 MIB', 36.12, 'legacy_excel', 'Mb Unit Economics sheet', CURRENT_DATE,
     'Total cost/unit as the sheet displayed it at go-live. The sheet''s own inputs do not compute to this.'),
    ('6 MIB', 29.04, 'legacy_excel', 'Mb Unit Economics sheet', CURRENT_DATE,
     'Total cost/unit as the sheet displayed it at go-live. The sheet''s own inputs do not compute to this.')
  ON CONFLICT (brick_type, source, reference_date) DO NOTHING;

  -- ------------------------------------------- flag the unconfirmed inputs ---
  -- Applied to the OPEN DRAFT only: published versions are immutable, and the
  -- flag is an attribute of the input, so it travels forward on each publish.
  SELECT id INTO v_draft FROM public.std_cost_versions WHERE status = 'draft';
  IF v_draft IS NULL THEN
    RAISE NOTICE 'No open draft — skipping verification flags';
    RETURN;
  END IF;

  UPDATE public.std_cost_rm_prices
     SET needs_verification = true,
         verification_note =
           'Load weight unconfirmed. The source gives both 37,050 kg and approx 1.27/kg, '
           'which disagree by 10x; 3,705 kg is in use because it matches the per-kg cost '
           'the standard has been costing with. Confirm the real load weight, then correct '
           'it here and publish — do not adjust any formula to compensate.'
   WHERE version_id = v_draft AND rm_key = 'red_soil';

  UPDATE public.std_cost_rm_prices
     SET needs_verification = true,
         verification_note =
           'Load weight unconfirmed. The source gives 3600 for "28900-for-8" and approx 0.80/kg; '
           '4,500 kg is in use because it matches the stated per-kg cost. No recipe consumes '
           'this material today, so no computed total depends on it.'
   WHERE version_id = v_draft AND rm_key = 'red_soil_gravel';
END $$;
