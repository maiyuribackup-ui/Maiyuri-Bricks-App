-- Archive configuration table for thresholds
CREATE TABLE IF NOT EXISTS public.archive_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Insert default thresholds
INSERT INTO public.archive_config (config_key, config_value) VALUES
  ('converted_days', '{"days": 30, "enabled": true}'::jsonb),
  ('lost_days', '{"days": 14, "enabled": true}'::jsonb),
  ('cold_inactivity_days', '{"days": 30, "enabled": true}'::jsonb)
ON CONFLICT (config_key) DO NOTHING;

-- Add archive metadata columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Archive suggestions cache table
CREATE TABLE IF NOT EXISTS public.archive_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  suggestion_reason TEXT NOT NULL,
  suggested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ai_confidence NUMERIC(3, 2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Unique constraint: only one pending suggestion per lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_suggestions_pending_lead
  ON public.archive_suggestions(lead_id)
  WHERE status = 'pending';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON public.leads(archived_at) WHERE is_archived = true;
CREATE INDEX IF NOT EXISTS idx_leads_status_updated ON public.leads(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_archive_suggestions_status ON public.archive_suggestions(status);

-- Enable RLS
ALTER TABLE public.archive_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_suggestions ENABLE ROW LEVEL SECURITY;

-- Archive config policies
CREATE POLICY "Founders can manage archive config" ON public.archive_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  );

CREATE POLICY "Authenticated users can read archive config" ON public.archive_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- Archive suggestions policies
CREATE POLICY "Founders can manage archive suggestions" ON public.archive_suggestions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  );

CREATE POLICY "Staff can view archive suggestions" ON public.archive_suggestions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Helper function to get last activity date for a lead
CREATE OR REPLACE FUNCTION public.get_lead_last_activity(p_lead_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  last_note_date TIMESTAMPTZ;
  lead_updated_at TIMESTAMPTZ;
BEGIN
  SELECT MAX(created_at) INTO last_note_date FROM public.notes WHERE lead_id = p_lead_id;
  SELECT updated_at INTO lead_updated_at FROM public.leads WHERE id = p_lead_id;
  RETURN GREATEST(COALESCE(last_note_date, lead_updated_at), lead_updated_at);
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments
COMMENT ON TABLE public.archive_config IS 'Configuration for smart lead archiving thresholds';
COMMENT ON TABLE public.archive_suggestions IS 'Cache of AI-generated archive suggestions';
COMMENT ON FUNCTION public.get_lead_last_activity IS 'Returns the most recent activity date for a lead (latest of updated_at or last note)';
