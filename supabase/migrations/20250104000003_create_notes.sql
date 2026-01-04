-- Create notes table
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  audio_url TEXT,
  transcription_text TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_summary TEXT,
  confidence_score NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Founders can do everything with notes
CREATE POLICY "Founders have full access to notes" ON public.notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  );

-- Staff can view notes for leads they have access to
CREATE POLICY "Staff can view notes for their leads" ON public.notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE leads.id = notes.lead_id
      AND (leads.assigned_staff = auth.uid() OR leads.created_by = auth.uid())
    )
  );

-- Staff can create notes for leads they have access to
CREATE POLICY "Staff can create notes for their leads" ON public.notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE leads.id = lead_id
      AND (leads.assigned_staff = auth.uid() OR leads.created_by = auth.uid())
    )
  );

-- Staff can update their own notes
CREATE POLICY "Staff can update own notes" ON public.notes
  FOR UPDATE USING (staff_id = auth.uid());

-- Indexes
CREATE INDEX idx_notes_lead_id ON public.notes(lead_id);
CREATE INDEX idx_notes_staff_id ON public.notes(staff_id);
CREATE INDEX idx_notes_date ON public.notes(date DESC);
CREATE INDEX idx_notes_created_at ON public.notes(created_at DESC);

-- Comment
COMMENT ON TABLE public.notes IS 'Lead interaction notes with audio transcription support';
