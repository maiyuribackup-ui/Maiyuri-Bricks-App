-- Migration: Voice-feedback foundation
-- Adds:
--   1. leads.feedback_token  (short opaque token, base32, used in /feedback/<token> URLs)
--   2. leads.language_preference  (en|ta — drives the personalised voice prompt + UI)
--   3. lead_feedback table  (one row per submission, structured + raw payload)
-- All changes are idempotent: safe to re-run on environments where parts already exist.
-- See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 1)

-- ============================================================================
-- 1. Token generator
-- ============================================================================
-- 10-character base32 token using an alphabet that excludes ambiguous glyphs
-- (no 0/O/1/I). ~32^10 ≈ 10^15 space — practical for non-enumerable URLs and
-- short enough to fallback-type if a QR scan fails.

CREATE OR REPLACE FUNCTION public.gen_feedback_token()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result   TEXT := '';
  i        INT;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.gen_feedback_token IS
  'Returns a 10-char base32 token (no 0/O/1/I). Used for public /feedback/<token> URLs.';

-- ============================================================================
-- 2. leads.feedback_token + leads.language_preference
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS feedback_token TEXT,
  ADD COLUMN IF NOT EXISTS language_preference TEXT NOT NULL DEFAULT 'en'
    CHECK (language_preference IN ('en', 'ta'));

-- Backfill any existing leads with a unique token. Loop until a unique value is
-- assigned (collision space is astronomical, but be defensive).
DO $$
DECLARE
  r          RECORD;
  candidate  TEXT;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE feedback_token IS NULL LOOP
    LOOP
      candidate := public.gen_feedback_token();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leads WHERE feedback_token = candidate);
    END LOOP;
    UPDATE public.leads SET feedback_token = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- Now enforce NOT NULL + UNIQUE.
ALTER TABLE public.leads
  ALTER COLUMN feedback_token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'leads_feedback_token_key'
  ) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_feedback_token_key UNIQUE (feedback_token);
  END IF;
END $$;

-- BEFORE INSERT trigger: auto-issue a token if the inserter didn't provide one.
CREATE OR REPLACE FUNCTION public.leads_set_feedback_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
BEGIN
  IF NEW.feedback_token IS NULL OR length(NEW.feedback_token) = 0 THEN
    LOOP
      candidate := public.gen_feedback_token();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leads WHERE feedback_token = candidate);
    END LOOP;
    NEW.feedback_token := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_feedback_token ON public.leads;
CREATE TRIGGER trg_leads_set_feedback_token
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_set_feedback_token();

COMMENT ON COLUMN public.leads.feedback_token IS
  'Short opaque token used in public /feedback/<token> URLs (QR codes). Revocable: regenerate to invalidate prior QRs.';
COMMENT ON COLUMN public.leads.language_preference IS
  'Lead preferred language for the voice feedback experience: en (English) or ta (Tamil/தமிழ்).';

-- ============================================================================
-- 3. lead_feedback table
-- ============================================================================
-- One row per submission. Mirrors the v1 strict-JSON contract; `raw_payload`
-- keeps the original document for forward compatibility.

CREATE TABLE IF NOT EXISTS public.lead_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  channel             TEXT NOT NULL CHECK (channel IN ('form', 'voice')),
  language            TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ta')),

  -- Visit experience
  rating              INT  CHECK (rating BETWEEN 1 AND 5),
  impressed           TEXT[] DEFAULT '{}',
  clarity             TEXT CHECK (clarity IN ('very_clear', 'mostly_clear', 'need_comparison', 'not_clear') OR clarity IS NULL),

  -- Product perception
  benefits            TEXT[] DEFAULT '{}',
  concerns            TEXT[] DEFAULT '{}',
  timeline            TEXT,

  -- Next step
  next_action         TEXT,
  next_action_detail  JSONB DEFAULT '{}'::jsonb,

  -- Free-form
  notes               TEXT,

  -- Voice-only
  voice_transcript    TEXT,
  voice_duration_sec  INT,

  -- Flags + observability
  flags               JSONB DEFAULT '{}'::jsonb,           -- {priority_followup: bool, followup_reason: text}
  raw_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- full strict-JSON document
  submitted_from      TEXT,                                 -- UA string trimmed to ~120 chars

  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_feedback_lead_id      ON public.lead_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_submitted_at ON public.lead_feedback(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_rating       ON public.lead_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_channel      ON public.lead_feedback(channel);
-- GIN index for queries like "leads who flagged 'cost' as a concern".
CREATE INDEX IF NOT EXISTS idx_lead_feedback_concerns_gin ON public.lead_feedback USING gin (concerns);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_benefits_gin ON public.lead_feedback USING gin (benefits);

COMMENT ON TABLE  public.lead_feedback IS 'Factory-visit feedback submissions, one row per submission (tap form or voice).';
COMMENT ON COLUMN public.lead_feedback.raw_payload IS 'Full strict-JSON document from the survey/voice agent. Keep for forward compatibility.';
COMMENT ON COLUMN public.lead_feedback.flags IS 'Routing flags: {priority_followup: bool, followup_reason: text}. Drives next-day staff queue.';

-- ============================================================================
-- 4. RLS — public can NOT read/write directly. Writes go via service-role API.
-- ============================================================================

ALTER TABLE public.lead_feedback ENABLE ROW LEVEL SECURITY;

-- Founders: full access.
DROP POLICY IF EXISTS "Founders have full access to lead_feedback" ON public.lead_feedback;
CREATE POLICY "Founders have full access to lead_feedback" ON public.lead_feedback
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
  );

-- Staff: select feedback only for leads they have access to (same rule as notes).
DROP POLICY IF EXISTS "Staff can view feedback for their leads" ON public.lead_feedback;
CREATE POLICY "Staff can view feedback for their leads" ON public.lead_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE leads.id = lead_feedback.lead_id
        AND (leads.assigned_staff = auth.uid() OR leads.created_by = auth.uid())
    )
  );

-- NOTE: there is intentionally no INSERT/UPDATE/DELETE policy for `anon` or
-- `authenticated` end-users. Submissions are written by the API route using
-- the service-role key, which bypasses RLS. This keeps public clients unable
-- to write directly even if they discover the table name.

-- ============================================================================
-- DOWN MIGRATION (manual — for reference)
-- ============================================================================
-- To roll back:
--   DROP TABLE IF EXISTS public.lead_feedback CASCADE;
--   ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_feedback_token_key;
--   DROP TRIGGER IF EXISTS trg_leads_set_feedback_token ON public.leads;
--   DROP FUNCTION IF EXISTS public.leads_set_feedback_token();
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS feedback_token;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS language_preference;
--   DROP FUNCTION IF EXISTS public.gen_feedback_token();
