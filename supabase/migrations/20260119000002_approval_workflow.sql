-- Approval Workflow Migration
-- Implements ticketing system for production order approvals with role-based access
-- GitHub Issue #25

-- ============================================================================
-- Update user role constraint to include production_supervisor
-- ============================================================================
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
ADD CONSTRAINT users_role_check
CHECK (role IN ('founder', 'accountant', 'engineer', 'production_supervisor', 'owner'));

-- ============================================================================
-- Tickets Table (approval workflow)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,  -- TKT-YYYY-0001

  -- Type and content
  type TEXT NOT NULL CHECK (type IN ('production_order', 'quote_approval', 'payment_approval')),
  title TEXT NOT NULL,
  description TEXT,

  -- Status & Priority
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_review', 'approved', 'rejected', 'changes_requested')
  ),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (
    priority IN ('low', 'medium', 'high', 'urgent')
  ),

  -- Ownership
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Relationships
  production_order_id UUID REFERENCES public.production_orders(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Metadata
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Approval Data
  approval_notes TEXT,
  rejection_reason TEXT
);

-- ============================================================================
-- Ticket History Table (audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (
    action IN ('created', 'status_changed', 'assigned', 'commented', 'approved', 'rejected', 'changes_requested')
  ),
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- Update Production Orders Table
-- ============================================================================
ALTER TABLE public.production_orders
ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update status constraint to include approval statuses
ALTER TABLE public.production_orders
DROP CONSTRAINT IF EXISTS production_orders_status_check;

ALTER TABLE public.production_orders
ADD CONSTRAINT production_orders_status_check
CHECK (status IN ('draft', 'pending_approval', 'approved', 'confirmed', 'in_progress', 'done', 'cancelled', 'completed'));

-- ============================================================================
-- Auto-generate ticket numbers trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  next_num INT;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(ticket_number FROM 10) AS INT)
  ), 0) + 1
  INTO next_num
  FROM public.tickets
  WHERE ticket_number LIKE 'TKT-' || year_str || '-%';

  NEW.ticket_number := 'TKT-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_ticket_number ON public.tickets;
CREATE TRIGGER trigger_generate_ticket_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION generate_ticket_number();

-- ============================================================================
-- Auto-update timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tickets_updated_at ON public.tickets;
CREATE TRIGGER trigger_update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_updated_at();

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON public.tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON public.tickets(type);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_production_order ON public.tickets(production_order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_due_date ON public.tickets(due_date);

CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON public.ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_action ON public.ticket_history(action);
CREATE INDEX IF NOT EXISTS idx_ticket_history_created ON public.ticket_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_orders_ticket ON public.production_orders(ticket_id);

-- ============================================================================
-- Enable RLS
-- ============================================================================
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies - Tickets
-- ============================================================================
-- All authenticated users can view tickets
CREATE POLICY "tickets_select_all"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (true);

-- Users can create tickets
CREATE POLICY "tickets_insert_authenticated"
  ON public.tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Creators and approvers can update tickets
CREATE POLICY "tickets_update_authorized"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('engineer', 'accountant', 'owner', 'founder')
    )
  );

-- Only founders can delete tickets
CREATE POLICY "tickets_delete_founders"
  ON public.tickets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'founder'
    )
  );

-- ============================================================================
-- RLS Policies - Ticket History
-- ============================================================================
-- All authenticated users can view history
CREATE POLICY "ticket_history_select_all"
  ON public.ticket_history FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert history (for commenting/actions)
CREATE POLICY "ticket_history_insert_authenticated"
  ON public.ticket_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = performed_by);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE public.tickets IS 'Approval tickets for production orders, quotes, and payments';
COMMENT ON TABLE public.ticket_history IS 'Audit trail for ticket actions and comments';
COMMENT ON COLUMN public.tickets.ticket_number IS 'Auto-generated ticket number (TKT-YYYY-XXXX)';
COMMENT ON COLUMN public.tickets.status IS 'Workflow status: pending, in_review, approved, rejected, changes_requested';
COMMENT ON COLUMN public.tickets.priority IS 'Priority level: low, medium, high, urgent';
COMMENT ON COLUMN public.production_orders.ticket_id IS 'Reference to approval ticket when submitted for approval';
