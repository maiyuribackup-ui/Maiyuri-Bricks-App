-- Migration: Add smart_quote_payload column to leads table
-- This column stores AI-generated payload for Smart Quote personalization

-- Add smart_quote_payload column to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS smart_quote_payload JSONB DEFAULT NULL;

-- Add index for querying leads with payloads
CREATE INDEX IF NOT EXISTS idx_leads_smart_quote_payload
ON leads USING gin(smart_quote_payload)
WHERE smart_quote_payload IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN leads.smart_quote_payload IS 'AI-generated payload for Smart Quote personalization (persona, angles, objections, routing, snippets)';
