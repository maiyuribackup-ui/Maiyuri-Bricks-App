-- Add Odoo record IDs to leads table
-- These IDs enable direct links to Odoo CRM for quotes and orders

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS odoo_quote_id INTEGER,
  ADD COLUMN IF NOT EXISTS odoo_order_id INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN leads.odoo_quote_id IS 'Odoo sale.order ID for the quote (enables direct linking to Odoo CRM)';
COMMENT ON COLUMN leads.odoo_order_id IS 'Odoo sale.order ID for the confirmed order (enables direct linking to Odoo CRM)';
