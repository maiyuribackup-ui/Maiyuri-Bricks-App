-- Migration: Add lead classification, requirement type, and site location fields
-- Issue #3: Lead classification
-- Issue #4: Requirement type
-- Issue #5: Site region and location

-- Create enum types for classification and requirement
DO $$
BEGIN
    -- Lead Classification enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_classification') THEN
        CREATE TYPE lead_classification AS ENUM (
            'direct_customer',
            'vendor',
            'builder',
            'dealer',
            'architect'
        );
    END IF;

    -- Requirement Type enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirement_type') THEN
        CREATE TYPE requirement_type AS ENUM (
            'residential_house',
            'commercial_building',
            'eco_friendly_building',
            'compound_wall'
        );
    END IF;
END $$;

-- Add new columns to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS classification lead_classification,
ADD COLUMN IF NOT EXISTS requirement_type requirement_type,
ADD COLUMN IF NOT EXISTS site_region TEXT,
ADD COLUMN IF NOT EXISTS site_location TEXT;

-- Add comments for documentation
COMMENT ON COLUMN leads.classification IS 'Customer classification: direct_customer, vendor, builder, dealer, architect';
COMMENT ON COLUMN leads.requirement_type IS 'Construction requirement type: residential_house, commercial_building, eco_friendly_building, compound_wall';
COMMENT ON COLUMN leads.site_region IS 'Site region (e.g., Chennai, Kanchipuram)';
COMMENT ON COLUMN leads.site_location IS 'Specific location within the region (e.g., T Nagar, Anna Nagar)';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_classification ON leads(classification);
CREATE INDEX IF NOT EXISTS idx_leads_requirement_type ON leads(requirement_type);
CREATE INDEX IF NOT EXISTS idx_leads_site_region ON leads(site_region);
