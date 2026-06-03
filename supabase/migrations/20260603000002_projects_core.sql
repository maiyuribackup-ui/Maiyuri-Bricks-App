-- Projects Module — Core Value Loop (V1)
-- Template → Estimate/BOQ → Approve Budget (baseline) → WBS → Daily Progress
-- → Cost → Budget-vs-Actual + AI Insights. ~10 core tables.
-- Conventions mirror smart_quotes/leads: UUID PK, FKs, JSONB, CHECK enums,
-- created_at/updated_at, RLS enabled with an authenticated-staff policy
-- (API uses the service role, which bypasses RLS; policies are a safety net).

-- ============================================================================
-- TEMPLATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  default_daily_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  closure_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_wbs_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_code TEXT,
  default_unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_template_wbs_template ON public.template_wbs_items(template_id);

CREATE TABLE IF NOT EXISTS public.template_boq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  cost_category TEXT NOT NULL DEFAULT 'material' CHECK (cost_category IN (
    'material','labour','machine','transport','fuel','loading','unloading',
    'subcontract','repair','overhead','miscellaneous')),
  default_cost_rate NUMERIC DEFAULT 0,
  default_selling_rate NUMERIC DEFAULT 0,
  linked_wbs_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_template_boq_template ON public.template_boq_items(template_id);

-- ============================================================================
-- RATE MASTER (reusable cost/selling rates; seeded from products + services)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  cost_category TEXT NOT NULL DEFAULT 'material' CHECK (cost_category IN (
    'material','labour','machine','transport','fuel','loading','unloading',
    'subcontract','repair','overhead','miscellaneous')),
  standard_cost_rate NUMERIC DEFAULT 0,
  standard_selling_rate NUMERIC DEFAULT 0,
  min_selling_rate NUMERIC,
  route TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.project_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  location TEXT,
  project_type TEXT,
  project_manager TEXT,
  supervisor TEXT,
  start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft_estimate' CHECK (status IN (
    'draft_estimate','estimate_under_review','budget_approved','not_started',
    'in_progress','at_risk','delayed','on_hold','completed','closed','cancelled')),
  health_status TEXT NOT NULL DEFAULT 'on_track' CHECK (health_status IN (
    'on_track','at_risk','delayed','over_budget')),
  approved_budget NUMERIC,
  expected_revenue NUMERIC,
  expected_margin NUMERIC,
  forecast_cost NUMERIC,
  forecast_margin NUMERIC,
  progress_pct NUMERIC NOT NULL DEFAULT 0,
  telegram_chat_id TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_lead ON public.projects(lead_id);
CREATE INDEX IF NOT EXISTS idx_projects_telegram ON public.projects(telegram_chat_id);

-- ============================================================================
-- ESTIMATES (approved estimate = frozen baseline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','under_review','approved','superseded')),
  total_cost NUMERIC DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  margin_amount NUMERIC DEFAULT 0,
  margin_pct NUMERIC DEFAULT 0,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estimates_project ON public.project_estimates(project_id);

CREATE TABLE IF NOT EXISTS public.boq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  estimate_id UUID REFERENCES public.project_estimates(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC DEFAULT 0,
  unit TEXT,
  cost_category TEXT NOT NULL DEFAULT 'material' CHECK (cost_category IN (
    'material','labour','machine','transport','fuel','loading','unloading',
    'subcontract','repair','overhead','miscellaneous')),
  cost_rate NUMERIC DEFAULT 0,
  selling_rate NUMERIC DEFAULT 0,
  cost_amount NUMERIC DEFAULT 0,
  revenue_amount NUMERIC DEFAULT 0,
  margin_amount NUMERIC DEFAULT 0,
  linked_wbs_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boq_project ON public.boq_items(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_estimate ON public.boq_items(estimate_id);

-- ============================================================================
-- WBS (work breakdown structure per project)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_wbs_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_code TEXT,
  linked_boq_code TEXT,
  planned_start DATE,
  planned_end DATE,
  actual_start DATE,
  actual_end DATE,
  planned_quantity NUMERIC,
  completed_quantity NUMERIC DEFAULT 0,
  unit TEXT,
  planned_budget NUMERIC DEFAULT 0,
  actual_cost NUMERIC DEFAULT 0,
  progress_pct NUMERIC NOT NULL DEFAULT 0,
  responsible TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started','in_progress','blocked','at_risk','delayed','completed','cancelled')),
  delay_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wbs_project ON public.project_wbs_items(project_id);

-- ============================================================================
-- DAILY PROGRESS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_code TEXT,
  progress_date DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_quantity NUMERIC,
  actual_quantity NUMERIC,
  unit TEXT,
  labour_count NUMERIC,
  labour_hours NUMERIC,
  machine_hours NUMERIC,
  material_used TEXT,
  cost_mentioned NUMERIC,
  issue TEXT,
  delay_reason TEXT,
  tomorrow_plan TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  supervisor_notes TEXT,
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','telegram','ai')),
  ai_confidence NUMERIC,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_progress_project ON public.daily_progress(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON public.daily_progress(progress_date);

-- ============================================================================
-- COST ENTRIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cost_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_code TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost_category TEXT NOT NULL DEFAULT 'material' CHECK (cost_category IN (
    'material','labour','machine','transport','fuel','loading','unloading',
    'subcontract','repair','overhead','miscellaneous')),
  description TEXT,
  quantity NUMERIC,
  unit TEXT,
  rate NUMERIC,
  amount NUMERIC NOT NULL DEFAULT 0,
  vendor TEXT,
  payment_status TEXT NOT NULL DEFAULT 'payable' CHECK (payment_status IN (
    'paid','payable','advance_paid','pending_verification')),
  bill_number TEXT,
  attachment_url TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','telegram','ai')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_entries_project ON public.cost_entries(project_id);

-- ============================================================================
-- RLS — enable + authenticated-staff full access (service role bypasses)
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'project_templates','template_wbs_items','template_boq_items','rate_master',
    'projects','project_estimates','boq_items','project_wbs_items','daily_progress','cost_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_all ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_auth_all ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'');',
      t, t);
  END LOOP;
END $$;

-- ============================================================================
-- SEED — Templates (Brick Supply, Compound Wall) + rate_master from products
-- ============================================================================
DO $$
DECLARE
  brick_tpl UUID;
  wall_tpl UUID;
BEGIN
  -- Brick Supply Project --------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.project_templates WHERE name = 'Brick Supply Project') THEN
    INSERT INTO public.project_templates (name, project_type, description, default_daily_questions, closure_checklist, default_risks)
    VALUES (
      'Brick Supply Project', 'brick_supply',
      'Standard brick production + dispatch project.',
      '["How many bricks were produced today?","How many labourers worked?","How many machine hours?","Any damaged or rejected bricks?","Any delay or issue?","Tomorrow''s production target?","Were photos uploaded?"]'::jsonb,
      '["Final payment received","Delivery photos uploaded","Customer review requested","Referral requested","Lessons learned recorded"]'::jsonb,
      '["Rain / weather delay","Machine breakdown","Labour shortage","Transport delay","Customer payment delay","Quality issue","Material shortage"]'::jsonb
    ) RETURNING id INTO brick_tpl;

    INSERT INTO public.template_wbs_items (template_id, seq, code, name, default_unit) VALUES
      (brick_tpl, 1,'W1','Order Confirmation',NULL),
      (brick_tpl, 2,'W2','Production Planning',NULL),
      (brick_tpl, 3,'W3','Brick Production','bricks'),
      (brick_tpl, 4,'W4','Quality Check',NULL),
      (brick_tpl, 5,'W5','Loading','bricks'),
      (brick_tpl, 6,'W6','Transport',NULL),
      (brick_tpl, 7,'W7','Delivery Confirmation',NULL),
      (brick_tpl, 8,'W8','Payment Closure',NULL),
      (brick_tpl, 9,'W9','Review / Referral',NULL),
      (brick_tpl,10,'W10','Project Closure',NULL);

    INSERT INTO public.template_boq_items (template_id, name, unit, cost_category, default_cost_rate, default_selling_rate, linked_wbs_code) VALUES
      (brick_tpl,'8" Mud Interlock Brick','brick','material',0,18,'W3'),
      (brick_tpl,'6" Mud Interlock Brick','brick','material',0,14,'W3'),
      (brick_tpl,'Loading','brick','loading',0,0,'W5'),
      (brick_tpl,'Transport','trip','transport',0,0,'W6'),
      (brick_tpl,'Unloading','brick','unloading',0,0,'W7'),
      (brick_tpl,'Site Support','day','labour',0,0,'W7'),
      (brick_tpl,'Mason Guidance','day','labour',0,0,'W7'),
      (brick_tpl,'Miscellaneous Charges','lot','miscellaneous',0,0,NULL);
  END IF;

  -- Compound Wall Construction Project ------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.project_templates WHERE name = 'Compound Wall Construction Project') THEN
    INSERT INTO public.project_templates (name, project_type, description, default_daily_questions, closure_checklist, default_risks)
    VALUES (
      'Compound Wall Construction Project', 'compound_wall',
      'Compound wall construction using interlocking bricks.',
      '["Which work was done today?","How many running feet completed?","How many masons and helpers worked?","What materials were used?","Any site issue?","Any customer instruction?","Photos uploaded?","Tomorrow''s plan?"]'::jsonb,
      '["Final payment received","Handover photos uploaded","Customer review requested","Referral requested","Lessons learned recorded"]'::jsonb,
      '["Rain / weather delay","Labour shortage","Material shortage","Customer payment delay","Site access issue","Scope change"]'::jsonb
    ) RETURNING id INTO wall_tpl;

    INSERT INTO public.template_wbs_items (template_id, seq, code, name, default_unit) VALUES
      (wall_tpl, 1,'W1','Site Measurement',NULL),
      (wall_tpl, 2,'W2','Estimate and Approval',NULL),
      (wall_tpl, 3,'W3','Material Planning',NULL),
      (wall_tpl, 4,'W4','Foundation Work','rft'),
      (wall_tpl, 5,'W5','Brick Supply','bricks'),
      (wall_tpl, 6,'W6','Wall Construction','rft'),
      (wall_tpl, 7,'W7','Curing / Finishing',NULL),
      (wall_tpl, 8,'W8','Quality Check',NULL),
      (wall_tpl, 9,'W9','Handover',NULL),
      (wall_tpl,10,'W10','Payment Closure',NULL),
      (wall_tpl,11,'W11','Project Closure',NULL);

    INSERT INTO public.template_boq_items (template_id, name, unit, cost_category, default_cost_rate, default_selling_rate, linked_wbs_code) VALUES
      (wall_tpl,'Interlock Bricks','brick','material',0,18,'W5'),
      (wall_tpl,'Foundation Material','lot','material',0,0,'W4'),
      (wall_tpl,'Masonry Labour','day','labour',0,0,'W6'),
      (wall_tpl,'Helper Labour','day','labour',0,0,'W6'),
      (wall_tpl,'Transport','trip','transport',0,0,'W5'),
      (wall_tpl,'Curing / Finishing','lot','labour',0,0,'W7'),
      (wall_tpl,'Miscellaneous Charges','lot','miscellaneous',0,0,NULL);
  END IF;

  -- Rate Master seed from active products (idempotent on name) -------------
  INSERT INTO public.rate_master (name, unit, cost_category, standard_selling_rate, description)
  SELECT p.name, COALESCE(p.unit,'unit'), 'material', p.base_price,
         COALESCE(p.category,'') || ' ' || COALESCE(p.size,'')
  FROM public.products p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM public.rate_master r WHERE r.name = p.name);

  -- A few common service rates (selling rates; cost rates filled over time)
  INSERT INTO public.rate_master (name, unit, cost_category, standard_selling_rate)
  SELECT v.name, v.unit, v.cat, v.rate FROM (VALUES
    ('Loading per brick','brick','loading',0.50),
    ('Unloading per brick','brick','unloading',0.50),
    ('Mason guidance per day','day','labour',1200),
    ('Site support per day','day','labour',900)
  ) AS v(name,unit,cat,rate)
  WHERE NOT EXISTS (SELECT 1 FROM public.rate_master r WHERE r.name = v.name);
END $$;
