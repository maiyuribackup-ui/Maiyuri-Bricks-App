-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create knowledgebase table
CREATE TABLE IF NOT EXISTS public.knowledgebase (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  embeddings vector(768),
  confidence_score NUMERIC(3, 2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_updated TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.knowledgebase ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read knowledgebase
CREATE POLICY "Authenticated users can read knowledgebase" ON public.knowledgebase
  FOR SELECT USING (auth.role() = 'authenticated');

-- Founders can manage knowledgebase
CREATE POLICY "Founders can manage knowledgebase" ON public.knowledgebase
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  );

-- Staff can insert to knowledgebase
CREATE POLICY "Staff can add to knowledgebase" ON public.knowledgebase
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create semantic search function
CREATE OR REPLACE FUNCTION public.match_knowledgebase(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  answer_text TEXT,
  confidence_score NUMERIC,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kb.id,
    kb.question_text,
    kb.answer_text,
    kb.confidence_score,
    1 - (kb.embeddings <=> query_embedding) AS similarity
  FROM public.knowledgebase kb
  WHERE kb.embeddings IS NOT NULL
    AND 1 - (kb.embeddings <=> query_embedding) > match_threshold
  ORDER BY kb.embeddings <=> query_embedding
  LIMIT match_count;
$$;

-- Index for vector similarity search
CREATE INDEX idx_knowledgebase_embeddings ON public.knowledgebase
  USING ivfflat (embeddings vector_cosine_ops)
  WITH (lists = 100);

-- Trigger for last_updated
CREATE TRIGGER knowledgebase_updated_at
  BEFORE UPDATE ON public.knowledgebase
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Comment
COMMENT ON TABLE public.knowledgebase IS 'AI knowledgebase with vector embeddings for semantic search';
COMMENT ON FUNCTION public.match_knowledgebase IS 'Semantic search for similar Q&A entries';
