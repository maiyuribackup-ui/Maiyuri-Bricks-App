-- Production Module Migration
-- Tracks manufacturing orders, BOM, raw materials, and employee attendance synced with Odoo MRP

-- ============================================================================
-- Finished Goods Table (synced from Odoo product.product where categ = Finished Good)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.finished_goods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_product_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  internal_reference TEXT,          -- Odoo default_code
  category TEXT NOT NULL DEFAULT 'Finished Good',
  uom_id INTEGER,                   -- Odoo product_uom_id
  uom_name TEXT,                    -- Unit of Measure display name
  bom_id INTEGER,                   -- Primary mrp.bom ID
  bom_quantity NUMERIC(10, 3),      -- Standard output qty per BOM
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- Raw Materials Table (synced from Odoo mrp.bom.line products)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_product_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  internal_reference TEXT,
  category TEXT DEFAULT 'Raw Material',
  uom_id INTEGER,
  uom_name TEXT,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- BOM Lines Table (linking finished goods to raw materials)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  odoo_bom_line_id INTEGER UNIQUE,
  quantity_per_bom NUMERIC(12, 4) NOT NULL,  -- qty per single BOM output
  uom_name TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(finished_good_id, raw_material_id)
);

-- ============================================================================
-- Employees Table (synced from Odoo hr.employee)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_employee_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department TEXT,
  job_title TEXT,
  work_email TEXT,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- Production Orders Table (local + synced to Odoo mrp.production)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,

  -- Product & BOM reference
  finished_good_id UUID NOT NULL REFERENCES public.finished_goods(id) ON DELETE RESTRICT,
  planned_quantity NUMERIC(12, 2) NOT NULL,
  actual_quantity NUMERIC(12, 2),

  -- Status tracking
  status TEXT DEFAULT 'draft' CHECK (
    status IN ('draft', 'confirmed', 'in_progress', 'done', 'cancelled')
  ),

  -- Dates
  scheduled_date DATE NOT NULL,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,

  -- Odoo sync
  odoo_production_id INTEGER,
  odoo_sync_status TEXT DEFAULT 'pending' CHECK (
    odoo_sync_status IN ('pending', 'synced', 'error', 'not_synced')
  ),
  odoo_synced_at TIMESTAMPTZ,
  odoo_error_message TEXT,

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- Production Shifts Table (multiple shifts per order)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.production_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- Production Attendance Table (employees per shift)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.production_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.production_shifts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  odoo_attendance_id INTEGER,  -- Synced to hr.attendance
  odoo_sync_status TEXT DEFAULT 'pending' CHECK (
    odoo_sync_status IN ('pending', 'synced', 'error', 'not_synced')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(shift_id, employee_id)
);

-- ============================================================================
-- Production Consumption Lines (actual raw material usage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.production_consumption_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,

  -- Quantities
  expected_quantity NUMERIC(12, 4) NOT NULL,
  actual_quantity NUMERIC(12, 4),

  -- UoM
  uom_name TEXT,

  -- Tracking
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(production_order_id, raw_material_id)
);

-- ============================================================================
-- Production Sync Log (audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.production_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID REFERENCES public.production_orders(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (
    sync_type IN ('product_sync', 'bom_sync', 'employee_sync', 'mo_create', 'mo_update', 'mo_confirm', 'mo_done', 'attendance_sync')
  ),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  odoo_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_finished_goods_odoo_id ON public.finished_goods(odoo_product_id);
CREATE INDEX IF NOT EXISTS idx_finished_goods_active ON public.finished_goods(is_active);
CREATE INDEX IF NOT EXISTS idx_finished_goods_name ON public.finished_goods(name);

CREATE INDEX IF NOT EXISTS idx_raw_materials_odoo_id ON public.raw_materials(odoo_product_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_active ON public.raw_materials(is_active);

CREATE INDEX IF NOT EXISTS idx_bom_lines_finished_good ON public.bom_lines(finished_good_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_raw_material ON public.bom_lines(raw_material_id);

CREATE INDEX IF NOT EXISTS idx_employees_odoo_id ON public.employees(odoo_employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON public.employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees(department);

CREATE INDEX IF NOT EXISTS idx_production_orders_status ON public.production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_date ON public.production_orders(scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_orders_odoo ON public.production_orders(odoo_production_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_created ON public.production_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_shifts_order ON public.production_shifts(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_shifts_date ON public.production_shifts(shift_date);

CREATE INDEX IF NOT EXISTS idx_production_attendance_shift ON public.production_attendance(shift_id);
CREATE INDEX IF NOT EXISTS idx_production_attendance_employee ON public.production_attendance(employee_id);

CREATE INDEX IF NOT EXISTS idx_consumption_lines_order ON public.production_consumption_lines(production_order_id);

CREATE INDEX IF NOT EXISTS idx_production_sync_log_order ON public.production_sync_log(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_sync_log_created ON public.production_sync_log(created_at DESC);

-- ============================================================================
-- Enable RLS
-- ============================================================================
ALTER TABLE public.finished_goods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_consumption_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_sync_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies - Finished Goods (read for all authenticated, write for founders)
-- ============================================================================
CREATE POLICY "Finished goods viewable by authenticated"
  ON public.finished_goods FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Finished goods editable by founders"
  ON public.finished_goods FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- ============================================================================
-- RLS Policies - Raw Materials
-- ============================================================================
CREATE POLICY "Raw materials viewable by authenticated"
  ON public.raw_materials FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Raw materials editable by founders"
  ON public.raw_materials FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- ============================================================================
-- RLS Policies - BOM Lines
-- ============================================================================
CREATE POLICY "BOM lines viewable by authenticated"
  ON public.bom_lines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "BOM lines editable by founders"
  ON public.bom_lines FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- ============================================================================
-- RLS Policies - Employees
-- ============================================================================
CREATE POLICY "Employees viewable by authenticated"
  ON public.employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Employees editable by founders"
  ON public.employees FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- ============================================================================
-- RLS Policies - Production Orders
-- ============================================================================
CREATE POLICY "Production orders viewable by authenticated"
  ON public.production_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Production orders creatable by authenticated"
  ON public.production_orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Production orders updatable by creators or founders"
  ON public.production_orders FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

CREATE POLICY "Production orders deletable by founders"
  ON public.production_orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- ============================================================================
-- RLS Policies - Production Shifts
-- ============================================================================
CREATE POLICY "Production shifts follow order access"
  ON public.production_shifts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_shifts.production_order_id
    )
  );

-- ============================================================================
-- RLS Policies - Production Attendance
-- ============================================================================
CREATE POLICY "Production attendance follow shift access"
  ON public.production_attendance FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.production_shifts ps
      WHERE ps.id = production_attendance.shift_id
    )
  );

-- ============================================================================
-- RLS Policies - Consumption Lines
-- ============================================================================
CREATE POLICY "Consumption lines follow order access"
  ON public.production_consumption_lines FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_consumption_lines.production_order_id
    )
  );

-- ============================================================================
-- RLS Policies - Sync Log (founders only)
-- ============================================================================
CREATE POLICY "Production sync log viewable by founders"
  ON public.production_sync_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

CREATE POLICY "Production sync log insertable by authenticated"
  ON public.production_sync_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- Auto-generate order number trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_production_order_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  seq_num INTEGER;
  new_number TEXT;
BEGIN
  year_str := to_char(NOW(), 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 9) AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM public.production_orders
  WHERE order_number LIKE 'MO-' || year_str || '-%';

  new_number := 'MO-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
  NEW.order_number := new_number;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_production_order_number ON public.production_orders;
CREATE TRIGGER trigger_generate_production_order_number
  BEFORE INSERT ON public.production_orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION generate_production_order_number();

-- ============================================================================
-- Auto-update updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION update_production_module_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_production_orders_updated_at ON public.production_orders;
CREATE TRIGGER trigger_update_production_orders_updated_at
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_production_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_production_shifts_updated_at ON public.production_shifts;
CREATE TRIGGER trigger_update_production_shifts_updated_at
  BEFORE UPDATE ON public.production_shifts
  FOR EACH ROW
  EXECUTE FUNCTION update_production_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_production_attendance_updated_at ON public.production_attendance;
CREATE TRIGGER trigger_update_production_attendance_updated_at
  BEFORE UPDATE ON public.production_attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_production_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_consumption_lines_updated_at ON public.production_consumption_lines;
CREATE TRIGGER trigger_update_consumption_lines_updated_at
  BEFORE UPDATE ON public.production_consumption_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_production_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_finished_goods_updated_at ON public.finished_goods;
CREATE TRIGGER trigger_update_finished_goods_updated_at
  BEFORE UPDATE ON public.finished_goods
  FOR EACH ROW
  EXECUTE FUNCTION update_production_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_raw_materials_updated_at ON public.raw_materials;
CREATE TRIGGER trigger_update_raw_materials_updated_at
  BEFORE UPDATE ON public.raw_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_production_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_employees_updated_at ON public.employees;
CREATE TRIGGER trigger_update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION update_production_module_updated_at();

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE public.finished_goods IS 'Finished goods synced from Odoo product.product (category: Finished Good)';
COMMENT ON TABLE public.raw_materials IS 'Raw materials synced from Odoo BOM lines';
COMMENT ON TABLE public.bom_lines IS 'Bill of Materials linking finished goods to raw materials with quantities';
COMMENT ON TABLE public.employees IS 'Employees synced from Odoo hr.employee for attendance tracking';
COMMENT ON TABLE public.production_orders IS 'Manufacturing orders with Odoo MRP integration';
COMMENT ON TABLE public.production_shifts IS 'Production shifts with start/end times (multiple per order)';
COMMENT ON TABLE public.production_attendance IS 'Employee attendance per shift, synced to Odoo hr.attendance';
COMMENT ON TABLE public.production_consumption_lines IS 'Raw material consumption with expected vs actual quantities';
COMMENT ON TABLE public.production_sync_log IS 'Audit log for all Odoo synchronization events';
