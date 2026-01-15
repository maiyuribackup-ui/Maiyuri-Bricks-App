-- Lead Intelligence Consolidation: Phase 1
-- Adds structured AI intelligence fields to leads table for decision cockpit

-- Add urgency field with constrained values
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS urgency TEXT
  CHECK (urgency IN ('immediate', '1-3_months', '3-6_months', 'unknown'));

-- Add dominant objection - the primary barrier to conversion
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS dominant_objection TEXT;

-- Add best conversion lever - what will close this deal
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS best_conversion_lever TEXT
  CHECK (best_conversion_lever IN ('proof', 'price', 'visit', 'relationship', 'timeline'));

-- Add lost reason - for post-mortem analysis on lost leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- Add index on urgency for quick filtering of hot leads
CREATE INDEX IF NOT EXISTS idx_leads_urgency ON public.leads(urgency)
  WHERE urgency = 'immediate';

-- Comment the new fields for documentation
COMMENT ON COLUMN public.leads.urgency IS 'AI-derived purchase urgency: immediate, 1-3_months, 3-6_months, unknown';
COMMENT ON COLUMN public.leads.dominant_objection IS 'Primary barrier to conversion identified from call analysis';
COMMENT ON COLUMN public.leads.best_conversion_lever IS 'Recommended approach to close: proof, price, visit, relationship, timeline';
COMMENT ON COLUMN public.leads.lost_reason IS 'Post-mortem reason for lost leads to improve future conversions';
