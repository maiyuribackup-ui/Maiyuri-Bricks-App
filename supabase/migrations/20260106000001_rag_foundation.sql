-- Migration to add RAG foundation fields to knowledgebase

-- Create content_type enum
CREATE TYPE public.knowledge_content_type AS ENUM ('transcript', 'objection', 'faq', 'manual', 'document');

-- Add new columns to knowledgebase
ALTER TABLE public.knowledgebase 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS content_type public.knowledge_content_type DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector('english', question_text || ' ' || answer_text)) STORED;

-- Create index for Full Text Search
CREATE INDEX IF NOT EXISTS idx_knowledgebase_fts ON public.knowledgebase USING GIN (fts);

-- Create index for metadata filtering (Gin index for JSONB)
CREATE INDEX IF NOT EXISTS idx_knowledgebase_metadata ON public.knowledgebase USING GIN (metadata);

-- Update match_knowledgebase function to support hybrid search (keyword + vector)
-- This version adds a keyword_search parameter
CREATE OR REPLACE FUNCTION public.match_knowledgebase_hybrid(
  query_embedding vector(768),
  query_text text,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  filter_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  answer_text TEXT,
  confidence_score NUMERIC,
  similarity float,
  rank float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kb.id,
    kb.question_text,
    kb.answer_text,
    kb.confidence_score,
    1 - (kb.embeddings <=> query_embedding) AS similarity,
    ts_rank(kb.fts, websearch_to_tsquery('english'::regconfig, query_text)) as rank
  FROM public.knowledgebase kb
  WHERE kb.embeddings IS NOT NULL
    AND (
      (1 - (kb.embeddings <=> query_embedding) > match_threshold) -- Vector match
      OR
      (kb.fts @@ websearch_to_tsquery('english'::regconfig, query_text)) -- Keyword match
    )
    AND kb.metadata @> filter_metadata -- Metadata filter
  ORDER BY 
    (1 - (kb.embeddings <=> query_embedding)) * 0.7 + -- Weighted score (70% semantic)
    (ts_rank(kb.fts, websearch_to_tsquery('english'::regconfig, query_text)) / (1 + ts_rank(kb.fts, websearch_to_tsquery('english'::regconfig, query_text)))) * 0.3 -- (30% keyword)
    DESC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_knowledgebase_hybrid IS 'Hybrid search using both vector similarity and full-text keyword search';
