-- Add product_interests field to leads table
-- Allows multi-select of products the lead is interested in

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS product_interests TEXT[] DEFAULT '{}';

COMMENT ON COLUMN leads.product_interests IS 'Products the lead is interested in (multi-select). Values: 8_inch_mud_interlock, 6_inch_mud_interlock, 8_inch_cement_interlock, 6_inch_cement_interlock, compound_wall_project, residential_project, laying_services';

-- Create index for array queries (GIN index for efficient array operations)
CREATE INDEX IF NOT EXISTS idx_leads_product_interests ON leads USING GIN (product_interests);
