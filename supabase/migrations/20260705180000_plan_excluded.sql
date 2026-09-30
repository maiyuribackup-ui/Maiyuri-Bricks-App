-- Some Odoo "products" are really non-inventory lines (Discount, Employee
-- Advance) that Odoo still tags as category 'Finished Good'. They pollute the
-- planner's capacity list and order lines. Add an explicit exclusion flag
-- (survives Odoo re-syncs, which only touch name/stock/etc).

ALTER TABLE public.finished_goods
  ADD COLUMN IF NOT EXISTS plan_excluded BOOLEAN NOT NULL DEFAULT false;

-- Exclude the known non-brick items by Odoo product id.
UPDATE public.finished_goods
  SET plan_excluded = true
  WHERE odoo_product_id IN (83, 110); -- Discount, Employee Advance

-- Clean up any planning params already created for them.
DELETE FROM public.product_planning_params
  WHERE finished_good_id IN (
    SELECT id FROM public.finished_goods WHERE plan_excluded = true
  );
