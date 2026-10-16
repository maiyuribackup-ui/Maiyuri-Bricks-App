-- ============================================================================
-- Ops Planning Module: AI production & delivery planner
-- Tables: product_planning_params, planning_settings, ops_plans,
--         ops_plan_items, sales_order_cache
-- All writes go through API routes using the service role; RLS grants
-- authenticated users read access (mirrors production-module pattern).
-- ============================================================================

-- Live finished-good stock mirrored from Odoo (qty_available)
ALTER TABLE public.finished_goods
  ADD COLUMN IF NOT EXISTS stock_qty NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS stock_synced_at TIMESTAMPTZ;

-- Per-product planning parameters (the knobs the founder edits)
CREATE TABLE IF NOT EXISTS public.product_planning_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_good_id UUID NOT NULL UNIQUE REFERENCES public.finished_goods(id) ON DELETE CASCADE,
  daily_capacity_units NUMERIC(12,2) NOT NULL DEFAULT 0, -- max units producible per working day
  curing_days INTEGER NOT NULL DEFAULT 7,                -- days from production to dispatchable
  min_batch NUMERIC(12,2) NOT NULL DEFAULT 0,            -- smallest sensible production run (0 = none)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global planning settings (single row, id = 1)
CREATE TABLE IF NOT EXISTS public.planning_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Working days as ISO weekday numbers (1=Mon ... 7=Sun). Default Mon-Sat.
  work_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  max_deliveries_per_day INTEGER NOT NULL DEFAULT 4,
  default_constraints_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.planning_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- A generated & saved plan (one active at a time; older ones superseded)
CREATE TABLE IF NOT EXISTS public.ops_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                                    -- e.g. "Plan 05 Jul – 18 Jul"
  horizon_start DATE NOT NULL,
  horizon_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','superseded','archived')),
  constraint_text TEXT,                                  -- what the user typed
  selected_order_refs TEXT[] NOT NULL DEFAULT '{}',      -- odoo order names planned for
  ai_rationale TEXT,                                     -- AI narrative shown in app
  ai_priorities JSONB,                                   -- raw validated AI output (audit)
  warnings JSONB NOT NULL DEFAULT '[]',                  -- [{type, message, order_ref?}]
  totals JSONB NOT NULL DEFAULT '{}',                    -- {production_units, deliveries, ...}
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);

-- Individual scheduled items (a production run or a delivery slot on a date)
CREATE TABLE IF NOT EXISTS public.ops_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.ops_plans(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('production','delivery')),
  item_date DATE NOT NULL,
  finished_good_id UUID REFERENCES public.finished_goods(id),
  product_name TEXT NOT NULL,                            -- denormalised for display
  quantity NUMERIC(12,2) NOT NULL,
  sale_order_ref TEXT,                                   -- odoo sale.order name (e.g. SO0042)
  customer_name TEXT,
  lead_id UUID REFERENCES public.leads(id),
  production_order_id UUID REFERENCES public.production_orders(id), -- linked when reported
  delivery_id UUID REFERENCES public.deliveries(id),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','done','partial','missed','moved')),
  actual_quantity NUMERIC(12,2),                         -- filled on reporting -> variance
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_plan_items_plan ON public.ops_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_ops_plan_items_date ON public.ops_plan_items(item_date);
CREATE INDEX IF NOT EXISTS idx_ops_plans_status ON public.ops_plans(status);

-- Local mirror of confirmed Odoo sales orders (fast + offline-tolerant planning)
CREATE TABLE IF NOT EXISTS public.sales_order_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_order_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,                                    -- SO number
  partner_name TEXT,
  state TEXT NOT NULL,                                   -- sale | done | cancel
  date_order TIMESTAMPTZ,
  commitment_date TIMESTAMPTZ,                           -- customer-promised date if set in Odoo
  amount_total NUMERIC(14,2),
  -- [{odoo_product_id, finished_good_id?, product_name, qty_ordered, qty_delivered, uom}]
  lines JSONB NOT NULL DEFAULT '[]',
  remaining_units NUMERIC(14,2) NOT NULL DEFAULT 0,      -- sum(ordered - delivered) over planable lines
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_cache_state ON public.sales_order_cache(state);

-- updated_at triggers (reuse the shared trigger fn created in earlier migrations)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER trg_ppp_updated BEFORE UPDATE ON public.product_planning_params
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER trg_opi_updated BEFORE UPDATE ON public.ops_plan_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RLS: authenticated read; writes go through service-role API routes.
ALTER TABLE public.product_planning_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read planning params" ON public.product_planning_params
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read planning settings" ON public.planning_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read ops plans" ON public.ops_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read ops plan items" ON public.ops_plan_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read sales order cache" ON public.sales_order_cache
  FOR SELECT TO authenticated USING (true);
