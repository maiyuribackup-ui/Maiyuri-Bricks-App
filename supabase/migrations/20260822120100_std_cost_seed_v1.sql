-- ============================================================================
-- Unit Economics — seed the first published version from the retiring
-- "Mb Unit Economics" Google Sheet, then open the working draft.
--
-- Seeded by publishing a draft through publish_std_cost_draft(), so go-live
-- uses exactly the same code path staff will use every month afterwards.
-- valid_from = CURRENT_DATE (the go-live date, by definition).
--
-- TWO INPUTS NEED RAM'S CONFIRMATION (§9 of the PRD contradicts itself):
--   red_soil        — PRD says "4712.50 / 37050 kg (≈1.27/kg)". Those disagree
--                     by 10x; 4712.50/37050 = 0.127. Seeded at 3705 kg so the
--                     cost/kg matches the ≈1.27 the sheet actually costs with,
--                     because that is the number the standard has been using.
--   red_soil_gravel — PRD says "3600 / 28900-for-8 (≈0.80/kg)". Seeded at
--                     4500 kg to match ≈0.80/kg. No recipe consumes this
--                     material today, so no computed total depends on it.
-- Both are one edit away in the app once Ram confirms the real load weight.
--
-- Computed totals vs the sheet's (surfaced, not fudged — PRD §9):
--   8 CIB 27.06 vs 32.83 · 6 CIB 26.24 vs 31.80
--   8 MIB 34.77 vs 36.12 · 6 MIB 27.94 vs 29.04
-- The inputs below are the sheet's own inputs; where the totals differ, the
-- sheet's totals were stale. Review with Ram at go-live.
-- ============================================================================

DO $$
DECLARE
  v_draft UUID;
  v_bt UUID;
BEGIN
  -- Idempotent: never seed over an existing standard.
  IF EXISTS (SELECT 1 FROM public.std_cost_versions) THEN
    RAISE NOTICE 'std_cost_versions already populated — skipping seed';
    RETURN;
  END IF;

  INSERT INTO public.std_cost_versions (status, monthly_production_basis, notes)
  VALUES ('draft', 15000,
    'Seeded from the Mb Unit Economics Google Sheet at go-live. red_soil and '
    'red_soil_gravel purchase_unit_kg are best-fit to the sheet''s per-kg cost '
    'and need Ram''s confirmation of the real load weight.')
  RETURNING id INTO v_draft;

  -- ------------------------------------------------------ raw materials ----
  INSERT INTO public.std_cost_rm_prices
    (version_id, rm_key, display_name, purchase_amount, purchase_unit_label, purchase_unit_kg)
  VALUES
    (v_draft, 'cement',          'Cement',          320.00,  '50 Kg Bag',                50),
    (v_draft, 'chemical',        'Chemical',        1850.00, '25 Kg Can',                25),
    (v_draft, 'msand_dust',      'M-Sand Dust',     4512.50, 'Per Unit or 8000 Kgs',     8000),
    (v_draft, 'msand_waste',     'M-Sand Waste',    1937.50, 'Per Unit or 8000 Kgs',     8000),
    (v_draft, 'red_soil',        'Red Soil',        4712.50, 'Per Load (kg to confirm)', 3705),
    (v_draft, 'red_soil_gravel', 'Red Soil Gravel', 3600.00, 'Per Load (kg to confirm)', 4500);

  -- ------------------------------------------------------- fixed costs ------
  INSERT INTO public.std_cost_fixed_items
    (version_id, item_key, display_name, monthly_amount)
  VALUES
    (v_draft, 'machine_repair',  'Machine Repair',    5000.00),
    (v_draft, 'rent',            'Rent',              2500.00),
    (v_draft, 'misc',            'Miscellaneous',     3000.00),
    (v_draft, 'stacking_curing', 'Stacking & Curing', 3000.00),
    (v_draft, 'manager_salary',  'Manager Salary',    60000.00),
    (v_draft, 'marketing',       'Marketing',         5000.00);

  -- ------------------------------------------------------- brick types ------
  -- brick_type and odoo_product_match are part of the frozen downstream
  -- contract: they join onto Odoo product names in the Intelligence Layer.
  INSERT INTO public.std_cost_brick_types
    (version_id, brick_type, odoo_product_match, bricks_per_batch, labor_cost_per_batch,
     electricity_per_unit, depreciation_per_unit, sales_price, sort_order)
  VALUES (v_draft, '8 CIB', 'CIB-10*8*5%', 9, 63.00, 1.00, 1.00, 54.00, 1)
  RETURNING id INTO v_bt;
  INSERT INTO public.std_cost_recipe_lines (brick_type_id, rm_key, kg_per_batch) VALUES
    (v_bt, 'cement', 8.5), (v_bt, 'chemical', 0.1),
    (v_bt, 'msand_dust', 74), (v_bt, 'msand_waste', 49);

  INSERT INTO public.std_cost_brick_types
    (version_id, brick_type, odoo_product_match, bricks_per_batch, labor_cost_per_batch,
     electricity_per_unit, depreciation_per_unit, sales_price, sort_order)
  VALUES (v_draft, '6 CIB', 'CIB-11*6*5%', 9, 54.00, 1.00, 1.00, 45.00, 2)
  RETURNING id INTO v_bt;
  INSERT INTO public.std_cost_recipe_lines (brick_type_id, rm_key, kg_per_batch) VALUES
    (v_bt, 'cement', 9.4), (v_bt, 'chemical', 0.1),
    (v_bt, 'msand_dust', 81.8), (v_bt, 'msand_waste', 13.7);

  INSERT INTO public.std_cost_brick_types
    (version_id, brick_type, odoo_product_match, bricks_per_batch, labor_cost_per_batch,
     electricity_per_unit, depreciation_per_unit, sales_price, sort_order)
  VALUES (v_draft, '8 MIB', 'MIB-10*8*5%', 8, 56.00, 1.00, 1.50, 55.00, 3)
  RETURNING id INTO v_bt;
  INSERT INTO public.std_cost_recipe_lines (brick_type_id, rm_key, kg_per_batch) VALUES
    (v_bt, 'cement', 9.165), (v_bt, 'chemical', 0.1),
    (v_bt, 'msand_dust', 18.28), (v_bt, 'red_soil', 66);

  INSERT INTO public.std_cost_brick_types
    (version_id, brick_type, odoo_product_match, bricks_per_batch, labor_cost_per_batch,
     electricity_per_unit, depreciation_per_unit, sales_price, sort_order)
  VALUES (v_draft, '6 MIB', 'MIB-10*6*5%', 11, 66.00, 1.00, 1.00, 46.00, 4)
  RETURNING id INTO v_bt;
  INSERT INTO public.std_cost_recipe_lines (brick_type_id, rm_key, kg_per_batch) VALUES
    (v_bt, 'cement', 9), (v_bt, 'chemical', 0.1),
    (v_bt, 'msand_dust', 25), (v_bt, 'red_soil', 65);

  -- Publish as v1 and open the fresh working draft, via the real publish path.
  PERFORM public.publish_std_cost_draft(v_draft, CURRENT_DATE, NULL,
    'v1 — seeded from the Mb Unit Economics Google Sheet at go-live.');
END $$;
