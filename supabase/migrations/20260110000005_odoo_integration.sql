-- Add Odoo integration fields to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS odoo_lead_id INTEGER,
ADD COLUMN IF NOT EXISTS odoo_partner_id INTEGER,
ADD COLUMN IF NOT EXISTS odoo_quote_number TEXT,
ADD COLUMN IF NOT EXISTS odoo_order_number TEXT,
ADD COLUMN IF NOT EXISTS odoo_quote_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS odoo_order_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS odoo_quote_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS odoo_order_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS odoo_sync_status TEXT DEFAULT 'pending'
  CHECK (odoo_sync_status IN ('pending', 'synced', 'error', 'not_synced'));

-- Create index for Odoo lookups
CREATE INDEX IF NOT EXISTS idx_leads_odoo_lead_id ON public.leads(odoo_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_odoo_sync_status ON public.leads(odoo_sync_status);

-- Create Odoo sync log table for tracking sync history
CREATE TABLE IF NOT EXISTS public.odoo_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('lead_push', 'lead_pull', 'quote_pull', 'order_pull')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  odoo_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on sync log
ALTER TABLE public.odoo_sync_log ENABLE ROW LEVEL SECURITY;

-- Founders can view sync logs
CREATE POLICY "Founders can view sync logs" ON public.odoo_sync_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  );

-- Create index for sync log queries
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_lead_id ON public.odoo_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_created_at ON public.odoo_sync_log(created_at DESC);

-- Comment
COMMENT ON COLUMN public.leads.odoo_lead_id IS 'Corresponding lead/opportunity ID in Odoo CRM';
COMMENT ON COLUMN public.leads.odoo_quote_number IS 'Quotation number from Odoo (e.g., S00001)';
COMMENT ON COLUMN public.leads.odoo_order_number IS 'Sales order number from Odoo (e.g., SO00001)';
COMMENT ON TABLE public.odoo_sync_log IS 'Audit log for Odoo synchronization events';
