-- AI Sales Coach — Phase 1 (Foundation, no AI yet)
-- Training + coaching system: modules → lessons → quizzes → assignments,
-- daily/weekly targets, progress tracking, knowledge base, admin CMS.
-- Phase-2 AI columns (ai_score, ai_feedback, *_score, conversation_json) are
-- created now but left nullable. Conventions mirror projects_core / smart_quotes:
-- UUID PK, FKs, JSONB, CHECK enums, created_at/updated_at (app sets updated_at),
-- indexes, RLS enabled with an authenticated-staff policy (service role bypasses).
-- Stable `slug`/`(user_id,...)` uniques enable idempotent content seeding.

-- ============================================================================
-- LEARNER PROFILE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  role TEXT,
  training_path TEXT NOT NULL DEFAULT 'production_supervisor'
    CHECK (training_path IN (
      'production_supervisor','sales_executive','factory_coordinator',
      'site_engineer','accounts_assistant','delivery_coordinator')),
  joining_date DATE,
  current_level INTEGER NOT NULL DEFAULT 1,
  active_status BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- CONTENT LIBRARY — modules → lessons → quizzes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  role_applicability TEXT[] NOT NULL DEFAULT '{}',
  difficulty TEXT NOT NULL DEFAULT 'beginner'
    CHECK (difficulty IN ('beginner','intermediate','advanced')),
  estimated_minutes INTEGER NOT NULL DEFAULT 10,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.coach_modules(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  objective TEXT,
  content TEXT NOT NULL DEFAULT '',
  examples TEXT,
  do_dont_notes TEXT,
  estimated_minutes INTEGER NOT NULL DEFAULT 5,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_lessons_module ON public.coach_lessons(module_id);

CREATE TABLE IF NOT EXISTS public.coach_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  lesson_id UUID REFERENCES public.coach_lessons(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.coach_modules(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'mcq'
    CHECK (question_type IN ('mcq','scenario','fill_blank','voice_text')),
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT,
  explanation TEXT,
  suggested_lesson_id UUID REFERENCES public.coach_lessons(id) ON DELETE SET NULL,
  difficulty TEXT NOT NULL DEFAULT 'beginner'
    CHECK (difficulty IN ('beginner','intermediate','advanced')),
  sequence_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_quizzes_lesson ON public.coach_quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_coach_quizzes_module ON public.coach_quizzes(module_id);

-- ============================================================================
-- LEARNER ACTIVITY — lesson progress, quiz attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lesson_id UUID NOT NULL REFERENCES public.coach_lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('not_started','in_progress','completed')),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_coach_lesson_progress_user ON public.coach_lesson_progress(user_id);

CREATE TABLE IF NOT EXISTS public.coach_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quiz_id UUID NOT NULL REFERENCES public.coach_quizzes(id) ON DELETE CASCADE,
  selected_answer TEXT,
  is_correct BOOLEAN,            -- null = pending review (scenario/voice_text)
  score NUMERIC NOT NULL DEFAULT 0,
  ai_feedback TEXT,              -- Phase 2
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_quiz_attempts_user ON public.coach_quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_quiz_attempts_quiz ON public.coach_quiz_attempts(quiz_id);

-- ============================================================================
-- ASSIGNMENTS + submissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  module_id UUID REFERENCES public.coach_modules(id) ON DELETE SET NULL,
  assignment_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (assignment_type IN (
      'product_explanation','lead_followup','objection_practice',
      'factory_explanation','reflection','custom')),
  due_frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (due_frequency IN ('daily','weekly','once')),
  evaluation_method TEXT NOT NULL DEFAULT 'manager'
    CHECK (evaluation_method IN ('ai','manager','both','self')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.coach_assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  submission_text TEXT,
  attachment_url TEXT,
  ai_score NUMERIC,             -- Phase 2
  ai_feedback TEXT,             -- Phase 2
  manager_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (manager_status IN ('pending','approved','needs_improvement','rejected')),
  manager_comment TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_subs_assignment ON public.coach_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_coach_subs_user ON public.coach_assignment_submissions(user_id);

-- ============================================================================
-- ROLEPLAYS (Phase 2 populated; table created now)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_roleplays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  scenario_type TEXT NOT NULL,
  conversation_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_score NUMERIC,
  clarity_score NUMERIC,
  empathy_score NUMERIC,
  product_score NUMERIC,
  closing_score NUMERIC,
  ai_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_roleplays_user ON public.coach_roleplays(user_id);

-- ============================================================================
-- TARGETS (daily / weekly)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (target_type IN (
      'learning','quiz','roleplay','sales_followup',
      'production_update','reflection','custom')),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily','weekly','once')),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed','missed','needs_review')),
  completion_value NUMERIC NOT NULL DEFAULT 0,
  target_value NUMERIC NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_targets_user ON public.coach_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_targets_due ON public.coach_targets(due_date);

-- ============================================================================
-- KNOWLEDGE BASE (grounds Phase-2 AI; admin-managed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'faq'
    CHECK (category IN (
      'brand_story','product','pricing','kerala_comparison','regular_comparison',
      'factory_process','quality','delivery','faq','objection','approved_phrases',
      'avoid_phrases','proof_links','reviews','project_videos','cost_calculator',
      'factory_visit')),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  source_link TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_kb_category ON public.coach_knowledge_base(category);

-- ============================================================================
-- RLS — enable + authenticated-staff full access (service role bypasses)
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'coach_users','coach_modules','coach_lessons','coach_quizzes',
    'coach_lesson_progress','coach_quiz_attempts','coach_assignments',
    'coach_assignment_submissions','coach_roleplays','coach_targets',
    'coach_knowledge_base'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_all ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_auth_all ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'');',
      t, t);
  END LOOP;
END $$;
