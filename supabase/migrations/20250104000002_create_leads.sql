-- Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  source TEXT NOT NULL,
  lead_type TEXT NOT NULL,
  assigned_staff UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'follow_up', 'hot', 'cold', 'converted', 'lost')),
  ai_summary TEXT,
  ai_score NUMERIC(3, 2) CHECK (ai_score >= 0 AND ai_score <= 1),
  next_action TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Founders can do everything
CREATE POLICY "Founders have full access to leads" ON public.leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  );

-- Staff can view assigned leads or leads they created
CREATE POLICY "Staff can view assigned leads" ON public.leads
  FOR SELECT USING (
    assigned_staff = auth.uid() OR created_by = auth.uid()
  );

-- Staff can update assigned leads
CREATE POLICY "Staff can update assigned leads" ON public.leads
  FOR UPDATE USING (
    assigned_staff = auth.uid() OR created_by = auth.uid()
  );

-- Authenticated users can create leads
CREATE POLICY "Authenticated users can create leads" ON public.leads
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Indexes for common queries
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_assigned_staff ON public.leads(assigned_staff);
CREATE INDEX idx_leads_follow_up_date ON public.leads(follow_up_date);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

-- Comment
COMMENT ON TABLE public.leads IS 'Lead tracking with AI scoring and staff assignment';
