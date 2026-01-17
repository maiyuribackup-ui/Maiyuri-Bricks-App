-- Migration: Add lead stage field (Issue #19)
-- Lead stages represent the sales pipeline progress, distinct from status

-- Create the lead_stage enum type
DO $$ BEGIN
    CREATE TYPE lead_stage AS ENUM (
        'inquiry',          -- Initial inquiry received
        'quote_sent',       -- Quote/proposal sent
        'factory_visit',    -- Factory visit scheduled or done
        'negotiation',      -- In active negotiation
        'order_confirmed',  -- Order confirmed by customer
        'in_production',    -- Order in production
        'ready_dispatch',   -- Ready for dispatch
        'delivered'         -- Delivered to customer
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add stage column to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS stage lead_stage DEFAULT 'inquiry';

-- Add stage_updated_at to track when stage was last changed
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMPTZ;

-- Add stage_updated_by to track who (or AI) updated the stage
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS stage_updated_by TEXT;

-- Create index for filtering by stage
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

-- Comment on columns
COMMENT ON COLUMN leads.stage IS 'Sales pipeline stage - distinct from status, tracks order lifecycle';
COMMENT ON COLUMN leads.stage_updated_at IS 'Timestamp of last stage change';
COMMENT ON COLUMN leads.stage_updated_by IS 'User ID or "ai" for AI-triggered updates';
