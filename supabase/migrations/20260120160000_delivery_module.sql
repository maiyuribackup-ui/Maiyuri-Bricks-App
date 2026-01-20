-- Delivery Management Module
-- 2-way integration with Odoo stock.picking (delivery orders)

-- ============================================
-- Table: user_odoo_mapping
-- Maps app users to Odoo user IDs for driver sync
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_odoo_mapping (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  odoo_user_id INTEGER NOT NULL,
  odoo_user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- Table: deliveries
-- Local cache of Odoo stock.picking (outgoing)
-- ============================================
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Odoo Reference
  odoo_picking_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,                          -- e.g., "WH/OUT/00423"
  origin TEXT,                                 -- Source document (sale order name)

  -- Linked Sale Order (cached from Odoo)
  odoo_sale_id INTEGER,
  odoo_sale_name TEXT,                         -- e.g., "S00410"

  -- Customer Info (cached from partner_id)
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  customer_city TEXT,
  delivery_latitude NUMERIC(10, 7),
  delivery_longitude NUMERIC(10, 7),

  -- Status & Scheduling
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (
    status IN ('draft', 'waiting', 'confirmed', 'assigned', 'in_transit', 'delivered', 'cancelled')
  ),
  priority INTEGER DEFAULT 0 CHECK (priority IN (0, 1)),  -- 0=Normal, 1=Urgent
  scheduled_date TIMESTAMPTZ NOT NULL,
  date_done TIMESTAMPTZ,

  -- Driver Assignment
  assigned_driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  odoo_user_id INTEGER,                        -- Odoo user_id for driver

  -- Delivery Details
  total_weight NUMERIC(12, 2),
  total_quantity NUMERIC(12, 2),
  carrier_tracking_ref TEXT,

  -- Proof of Delivery (local only)
  signature_url TEXT,                          -- Supabase Storage URL
  signature_captured_at TIMESTAMPTZ,
  photo_urls TEXT[],                           -- Array of photo URLs
  delivery_notes TEXT,
  recipient_name TEXT,                         -- Person who received

  -- Sync Tracking
  odoo_sync_status TEXT DEFAULT 'synced' CHECK (
    odoo_sync_status IN ('synced', 'pending_push', 'error')
  ),
  odoo_synced_at TIMESTAMPTZ DEFAULT now(),
  last_local_update TIMESTAMPTZ DEFAULT now(),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- Table: delivery_lines
-- Move lines from Odoo stock.move
-- ============================================
CREATE TABLE IF NOT EXISTS public.delivery_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,

  -- Odoo Reference
  odoo_move_id INTEGER NOT NULL,

  -- Product Info
  product_name TEXT NOT NULL,
  product_code TEXT,
  odoo_product_id INTEGER,

  -- Quantities
  quantity_ordered NUMERIC(12, 2) NOT NULL,
  quantity_delivered NUMERIC(12, 2),
  uom_name TEXT,

  -- Sort order
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(delivery_id, odoo_move_id)
);

-- ============================================
-- Table: delivery_sync_log
-- Audit trail for sync operations
-- ============================================
CREATE TABLE IF NOT EXISTS public.delivery_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (
    sync_type IN ('pull', 'push_status', 'push_pod', 'push_driver')
  ),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  odoo_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_deliveries_odoo_picking ON deliveries(odoo_picking_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_scheduled ON deliveries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_sync_status ON deliveries(odoo_sync_status);
CREATE INDEX IF NOT EXISTS idx_deliveries_date_done ON deliveries(date_done);
CREATE INDEX IF NOT EXISTS idx_delivery_lines_delivery ON delivery_lines(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sync_log_delivery ON delivery_sync_log(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sync_log_created ON delivery_sync_log(created_at);

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_odoo_mapping ENABLE ROW LEVEL SECURITY;

-- Deliveries: All authenticated users can read all (staff), drivers see assigned
CREATE POLICY "Authenticated users can read deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (true);

-- Deliveries: Staff can update all, drivers can only update assigned
CREATE POLICY "Users can update deliveries" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Deliveries: Only service role can insert (from sync)
CREATE POLICY "Service role can insert deliveries" ON public.deliveries
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Deliveries: Service role can do all
CREATE POLICY "Service role full access deliveries" ON public.deliveries
  FOR ALL TO service_role
  USING (true);

-- Delivery lines: Follow parent delivery access
CREATE POLICY "Authenticated users can read delivery_lines" ON public.delivery_lines
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access delivery_lines" ON public.delivery_lines
  FOR ALL TO service_role
  USING (true);

-- Sync logs: Read for authenticated, full for service
CREATE POLICY "Authenticated users can read sync logs" ON public.delivery_sync_log
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access sync logs" ON public.delivery_sync_log
  FOR ALL TO service_role
  USING (true);

-- User Odoo mapping: Read for authenticated, full for service
CREATE POLICY "Authenticated users can read user_odoo_mapping" ON public.user_odoo_mapping
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access user_odoo_mapping" ON public.user_odoo_mapping
  FOR ALL TO service_role
  USING (true);

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_delivery_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_delivery_updated_at();

CREATE TRIGGER delivery_lines_updated_at
  BEFORE UPDATE ON public.delivery_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_delivery_updated_at();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE public.deliveries IS 'Local cache of Odoo delivery orders (stock.picking with outgoing type)';
COMMENT ON TABLE public.delivery_lines IS 'Products in each delivery (from Odoo stock.move)';
COMMENT ON TABLE public.delivery_sync_log IS 'Audit trail for Odoo sync operations';
COMMENT ON TABLE public.user_odoo_mapping IS 'Maps app users to Odoo user IDs for driver assignment sync';
