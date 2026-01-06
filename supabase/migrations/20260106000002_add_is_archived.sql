-- Add is_archived column to leads table
ALTER TABLE leads ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;

-- Create index for faster filtering
CREATE INDEX idx_leads_is_archived ON leads(is_archived);
