-- ============================================================================
-- Factory Ledger: replaces the factory Google Sheet with a proper ledger.
-- 9 tables under the factory_ namespace (products/deliveries/orders collide
-- with existing app tables), Sat–Fri reporting weeks via factory_week_start(),
-- and derived-only stock & order fulfilment via views. Writes go through
-- service-role /api/factory routes; RLS grants authenticated reads.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sat–Fri reporting week: shift any date back to its Saturday.
-- Postgres DOW: Sun=0 … Sat=6 → offset (dow+1)%7 (Sat→0, Sun→1, Fri→6).
CREATE OR REPLACE FUNCTION public.factory_week_start(d date)
RETURNS date LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT d - ((EXTRACT(DOW FROM d)::int + 1) % 7) $$;

-- ----------------------------------------------------------------- products
CREATE TABLE IF NOT EXISTS public.factory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('MIB-8','MIB-6','CIB-8','CIB-6')),
  -- NULL = physical stock-take not done yet (drives the UI banner).
  -- A deliberate count of 0 is recorded by setting opening_counted_at.
  opening_stock NUMERIC(10,0),
  opening_counted_at DATE,
  finished_good_id UUID REFERENCES public.finished_goods(id), -- future linkage only
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- customers
CREATE TABLE IF NOT EXISTS public.factory_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  phone TEXT,
  credit_hold BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------- orders
CREATE TABLE IF NOT EXISTS public.factory_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.factory_customers(id),
  order_date DATE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.factory_products(id),
  qty_ordered NUMERIC(10,0) NOT NULL CHECK (qty_ordered > 0),
  payment_status TEXT NOT NULL DEFAULT 'Clear'
    CHECK (payment_status IN ('Clear','Hold - Payment','Cancelled')),
  seed_key TEXT UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factory_orders_customer ON public.factory_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_factory_orders_date ON public.factory_orders (order_date);

-- ----------------------------------------------------------- production log
CREATE TABLE IF NOT EXISTS public.factory_production_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date DATE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.factory_products(id),
  qty_produced NUMERIC(10,0) NOT NULL CHECK (qty_produced >= 0),
  cement_bags NUMERIC(6,1) CHECK (cement_bags >= 0),
  downtime_reason TEXT NOT NULL DEFAULT 'None' CHECK (downtime_reason IN
    ('None','Power Cut','Machine Breakdown','Raw Material Shortage',
     'Labour Shortage','Dye / Profile Change','Payment Issue','Holiday','Other')),
  remarks TEXT,
  data_flag TEXT NOT NULL DEFAULT 'OK'
    CHECK (data_flag IN ('OK','Estimated','Check - sources disagree')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (log_date, product_id)
);
CREATE INDEX IF NOT EXISTS idx_factory_prodlog_date ON public.factory_production_log (log_date);

-- ---------------------------------------------------------- production plan
CREATE TABLE IF NOT EXISTS public.factory_production_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date DATE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.factory_products(id),
  planned_qty NUMERIC(10,0) NOT NULL CHECK (planned_qty >= 0),
  plan_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_date, product_id)
);

-- -------------------------------------------------------------------- trips
CREATE TABLE IF NOT EXISTS public.factory_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_date DATE NOT NULL,
  vehicle TEXT NOT NULL CHECK (vehicle IN ('407 Eicher','439 RDX Tractor','Tricycle','Other')),
  start_km NUMERIC(8,1),
  end_km NUMERIC(8,1),
  diesel_litres NUMERIC(6,1) CHECK (diesel_litres >= 0),
  seed_key TEXT UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_km IS NULL OR start_km IS NULL OR end_km >= start_km)
);

-- --------------------------------------------------------------- deliveries
CREATE TABLE IF NOT EXISTS public.factory_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date DATE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.factory_customers(id),
  product_id UUID NOT NULL REFERENCES public.factory_products(id),
  -- qty 0 is allowed for 'Qty to confirm' planned rows from the weekly sheet
  qty NUMERIC(10,0) NOT NULL CHECK (qty >= 0),
  status TEXT NOT NULL DEFAULT 'Planned'
    CHECK (status IN ('Planned','Delivered','Postponed','Cancelled')),
  order_id UUID REFERENCES public.factory_orders(id),
  trip_id UUID REFERENCES public.factory_trips(id),
  data_flag TEXT NOT NULL DEFAULT 'OK'
    CHECK (data_flag IN ('OK','Check - sources disagree','Qty to confirm')),
  seed_key TEXT UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factory_del_date ON public.factory_deliveries (delivery_date);
CREATE INDEX IF NOT EXISTS idx_factory_del_product_status ON public.factory_deliveries (product_id, status);
CREATE INDEX IF NOT EXISTS idx_factory_del_order ON public.factory_deliveries (order_id) WHERE order_id IS NOT NULL;

-- ------------------------------------------------------------------- labour
CREATE TABLE IF NOT EXISTS public.factory_labour (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date DATE NOT NULL,
  worker TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK (work_type IN
    ('Loading','Production 6"','Production 8"','NMR Daily','Advance')),
  qty NUMERIC(10,1) NOT NULL,
  rate NUMERIC(10,2) NOT NULL, -- advances carry a negative rate (qty 1 × -3500)
  seed_key TEXT UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factory_labour_date ON public.factory_labour (work_date);

-- ------------------------------------------------------------------- assets
CREATE TABLE IF NOT EXISTS public.factory_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('Machinery','Machinery Tools','Mechanical Tools','Vehicles',
     'Construction Tools','Electrical & Electronic Tools')),
  qty NUMERIC(8,1) NOT NULL DEFAULT 1,
  location TEXT NOT NULL DEFAULT 'Unknown'
    CHECK (location IN ('Plant','RTO','VM','Split - see notes','Unknown')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset, location)
);

-- ------------------------------------------------------------ RLS + triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'factory_products','factory_customers','factory_orders',
    'factory_production_log','factory_production_plan','factory_trips',
    'factory_deliveries','factory_labour','factory_assets']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- -------------------------------------------------------------------- views
-- Live stock per product. free_stock is THE number a salesperson needs
-- before promising a date. Semantics: committed = status 'Planned' only;
-- 'Postponed' counts in neither delivered nor committed (badged in UI).
CREATE OR REPLACE VIEW public.factory_stock_v
WITH (security_invoker = true) AS
SELECT
  p.id, p.code, p.opening_stock, p.opening_counted_at, p.notes,
  COALESCE(pl.produced, 0) AS produced,
  COALESCE(d.delivered, 0) AS delivered,
  COALESCE(d.committed, 0) AS committed,
  COALESCE(p.opening_stock, 0) + COALESCE(pl.produced, 0)
    - COALESCE(d.delivered, 0) AS stock_balance,
  COALESCE(p.opening_stock, 0) + COALESCE(pl.produced, 0)
    - COALESCE(d.delivered, 0) - COALESCE(d.committed, 0) AS free_stock,
  ROUND(COALESCE(pl.produced, 0) / NULLIF(pl.bags, 0), 1) AS bricks_per_bag
FROM public.factory_products p
LEFT JOIN (
  SELECT product_id, SUM(qty_produced) AS produced, SUM(cement_bags) AS bags
  FROM public.factory_production_log GROUP BY product_id
) pl ON pl.product_id = p.id
LEFT JOIN (
  SELECT product_id,
    SUM(qty) FILTER (WHERE status = 'Delivered') AS delivered,
    SUM(qty) FILTER (WHERE status = 'Planned')  AS committed
  FROM public.factory_deliveries GROUP BY product_id
) d ON d.product_id = p.id;

-- Order fulfilment: delivered/balance derived from actual dispatches, never
-- set by hand. Deliveries without order_id never advance any order.
CREATE OR REPLACE VIEW public.factory_orders_v
WITH (security_invoker = true) AS
SELECT
  o.id, o.customer_id, o.order_date, o.product_id, o.qty_ordered,
  o.payment_status, o.notes, o.created_at, o.updated_at,
  c.name AS customer_name, c.credit_hold,
  p.code AS product_code,
  COALESCE(dv.delivered, 0) AS delivered,
  GREATEST(o.qty_ordered - COALESCE(dv.delivered, 0), 0) AS balance_due,
  CASE
    WHEN COALESCE(dv.delivered, 0) = 0 THEN 'Not started'
    WHEN COALESCE(dv.delivered, 0) >= o.qty_ordered THEN 'Complete'
    ELSE 'Partial'
  END AS fulfilment
FROM public.factory_orders o
JOIN public.factory_customers c ON c.id = o.customer_id
JOIN public.factory_products p ON p.id = o.product_id
LEFT JOIN (
  SELECT order_id, SUM(qty) AS delivered
  FROM public.factory_deliveries
  WHERE status = 'Delivered' AND order_id IS NOT NULL
  GROUP BY order_id
) dv ON dv.order_id = o.id;
