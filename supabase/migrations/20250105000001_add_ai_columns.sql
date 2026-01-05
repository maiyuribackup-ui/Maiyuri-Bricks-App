-- Add AI factors and suggestions columns to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS ai_factors JSONB,
ADD COLUMN IF NOT EXISTS ai_suggestions JSONB;

-- Comment on new columns
COMMENT ON COLUMN public.leads.ai_factors IS 'Array of AI-analyzed factors affecting lead score';
COMMENT ON COLUMN public.leads.ai_suggestions IS 'Array of AI-generated suggestions for lead follow-up';
