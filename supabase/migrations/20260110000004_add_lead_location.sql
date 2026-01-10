-- Add area/location field to leads table for geographic analytics
ALTER TABLE leads ADD COLUMN IF NOT EXISTS area VARCHAR(100);

-- Create index for area-based queries
CREATE INDEX IF NOT EXISTS idx_leads_area ON leads(area);

-- Populate existing leads with sample Tamil Nadu localities based on their ID
-- This distributes leads across different areas for demonstration
UPDATE leads SET area =
  CASE
    WHEN (hashtext(id::text) % 15) = 0 THEN 'Chennai'
    WHEN (hashtext(id::text) % 15) = 1 THEN 'Coimbatore'
    WHEN (hashtext(id::text) % 15) = 2 THEN 'Madurai'
    WHEN (hashtext(id::text) % 15) = 3 THEN 'Tiruchirappalli'
    WHEN (hashtext(id::text) % 15) = 4 THEN 'Salem'
    WHEN (hashtext(id::text) % 15) = 5 THEN 'Tirunelveli'
    WHEN (hashtext(id::text) % 15) = 6 THEN 'Erode'
    WHEN (hashtext(id::text) % 15) = 7 THEN 'Vellore'
    WHEN (hashtext(id::text) % 15) = 8 THEN 'Thoothukudi'
    WHEN (hashtext(id::text) % 15) = 9 THEN 'Dindigul'
    WHEN (hashtext(id::text) % 15) = 10 THEN 'Thanjavur'
    WHEN (hashtext(id::text) % 15) = 11 THEN 'Kanchipuram'
    WHEN (hashtext(id::text) % 15) = 12 THEN 'Tiruppur'
    WHEN (hashtext(id::text) % 15) = 13 THEN 'Nagercoil'
    ELSE 'Karur'
  END
WHERE area IS NULL;

-- Comment on column
COMMENT ON COLUMN leads.area IS 'Geographic area/locality of the lead for delivery planning';
