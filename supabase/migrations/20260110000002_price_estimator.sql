-- Price Estimator Feature Migration
-- Creates tables for products, factory settings, estimates, and estimate items

-- Products master table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cement_interlock', 'mud_interlock', 'project')),
  size TEXT CHECK (size IN ('6_inch', '8_inch') OR size IS NULL),
  unit TEXT NOT NULL, -- 'piece', 'sqft'
  base_price NUMERIC(10, 2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Factory settings (location + transport rate)
CREATE TABLE IF NOT EXISTS public.factory_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT DEFAULT 'Maiyuri Bricks Factory',
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  address TEXT,
  transport_rate_per_km NUMERIC(6, 2) DEFAULT 15.00,
  min_transport_charge NUMERIC(8, 2) DEFAULT 500.00,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Estimates table
CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  estimate_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),

  -- Delivery info
  delivery_address TEXT NOT NULL,
  delivery_latitude NUMERIC(10, 7),
  delivery_longitude NUMERIC(10, 7),
  distance_km NUMERIC(8, 2),

  -- Pricing
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_cost NUMERIC(10, 2) DEFAULT 0,
  discount_percentage NUMERIC(5, 2) DEFAULT 0,
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  discount_reason TEXT,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- AI discount suggestion
  ai_suggested_discount NUMERIC(5, 2),
  ai_discount_reasoning TEXT,
  ai_confidence NUMERIC(3, 2),

  -- Metadata
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Estimate line items
CREATE TABLE IF NOT EXISTS public.estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(10, 2) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_estimates_lead_id ON public.estimates(lead_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON public.estimates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON public.estimate_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for products (read for all authenticated, write for founders)
CREATE POLICY "Products are viewable by authenticated users"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Products are editable by founders"
  ON public.products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- RLS Policies for factory_settings (read for all authenticated, write for founders)
CREATE POLICY "Factory settings are viewable by authenticated users"
  ON public.factory_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Factory settings are editable by founders"
  ON public.factory_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- RLS Policies for estimates (based on lead access)
CREATE POLICY "Estimates are viewable by lead owners or founders"
  ON public.estimates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE leads.id = estimates.lead_id
      AND (
        leads.created_by = auth.uid()
        OR leads.assigned_staff = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'founder'
        )
      )
    )
  );

CREATE POLICY "Estimates are creatable by authenticated users"
  ON public.estimates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Estimates are updatable by creators or founders"
  ON public.estimates FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

CREATE POLICY "Estimates are deletable by creators or founders"
  ON public.estimates FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- RLS Policies for estimate_items (based on estimate access)
CREATE POLICY "Estimate items follow estimate access"
  ON public.estimate_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates
      WHERE estimates.id = estimate_items.estimate_id
      AND (
        estimates.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'founder'
        )
      )
    )
  );

-- Seed products data
INSERT INTO public.products (name, category, size, unit, base_price, description) VALUES
  ('Cement Interlock Brick 6"', 'cement_interlock', '6_inch', 'piece', 12.00, 'Standard 6 inch cement interlock paver'),
  ('Cement Interlock Brick 8"', 'cement_interlock', '8_inch', 'piece', 18.00, 'Heavy duty 8 inch cement interlock paver'),
  ('Mud Interlock Brick 6"', 'mud_interlock', '6_inch', 'piece', 8.00, 'Eco-friendly 6 inch mud interlock'),
  ('Mud Interlock Brick 8"', 'mud_interlock', '8_inch', 'piece', 14.00, 'Eco-friendly 8 inch mud interlock'),
  ('Compound Wall Construction', 'project', NULL, 'sqft', 150.00, 'Complete compound wall including materials and labor'),
  ('Residential House Project', 'project', NULL, 'sqft', 200.00, 'Full residential house construction support'),
  ('Laying Services', 'project', NULL, 'sqft', 35.00, 'Professional brick laying service per sqft')
ON CONFLICT DO NOTHING;

-- Function to generate estimate number
CREATE OR REPLACE FUNCTION generate_estimate_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  seq_num INTEGER;
  new_number TEXT;
BEGIN
  year_str := to_char(NOW(), 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(estimate_number FROM 10) AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM public.estimates
  WHERE estimate_number LIKE 'EST-' || year_str || '-%';

  new_number := 'EST-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
  NEW.estimate_number := new_number;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate estimate number
DROP TRIGGER IF EXISTS trigger_generate_estimate_number ON public.estimates;
CREATE TRIGGER trigger_generate_estimate_number
  BEFORE INSERT ON public.estimates
  FOR EACH ROW
  WHEN (NEW.estimate_number IS NULL OR NEW.estimate_number = '')
  EXECUTE FUNCTION generate_estimate_number();

-- Function to update estimates.updated_at
CREATE OR REPLACE FUNCTION update_estimate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_estimate_updated_at ON public.estimates;
CREATE TRIGGER trigger_update_estimate_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION update_estimate_updated_at();
