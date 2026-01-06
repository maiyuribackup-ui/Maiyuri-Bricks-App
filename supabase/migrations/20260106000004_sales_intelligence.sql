-- Create coaching_insights table
CREATE TABLE IF NOT EXISTS public.coaching_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  insight_type TEXT CHECK (insight_type IN ('correction', 'missed_opportunity', 'kudos')),
  quote_text TEXT,
  suggestion TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS for coaching_insights
ALTER TABLE public.coaching_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view coaching insights" ON public.coaching_insights
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create coaching insights" ON public.coaching_insights
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create unanswered_questions table
CREATE TABLE IF NOT EXISTS public.unanswered_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  context TEXT,
  source_note_id UUID REFERENCES public.notes(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'task_created', 'resolved')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS for unanswered_questions
ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view unanswered questions" ON public.unanswered_questions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert unanswered questions" ON public.unanswered_questions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update unanswered questions" ON public.unanswered_questions
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_coaching_note_id ON public.coaching_insights(note_id);
CREATE INDEX idx_coaching_lead_id ON public.coaching_insights(lead_id);
CREATE INDEX idx_unanswered_task_id ON public.unanswered_questions(task_id);
CREATE INDEX idx_unanswered_status ON public.unanswered_questions(status);
