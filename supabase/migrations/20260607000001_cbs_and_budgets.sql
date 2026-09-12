-- CBS Cost-Control Backbone — Phase 1
-- Creates: cbs_master (33 seeded codes), project_budgets (revision-safe 3-field design),
--          ALTER cost_entries (adds cbs_id, zone, approval_status)
-- Conventions: UUID PK, CHECK enums, TIMESTAMPTZ, update_updated_at trigger, RLS auth_all policy

-- ============================================================================
-- CBS MASTER  (company-wide reusable cost codes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cbs_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cbs_code    TEXT NOT NULL UNIQUE,          -- e.g. "05.01"
  category    TEXT NOT NULL,                 -- e.g. "Masonry"
  work_item   TEXT NOT NULL,                 -- e.g. "8 inch block material"
  cost_type   TEXT NOT NULL DEFAULT 'material'
                CHECK (cost_type IN (
                  'material','labour','equipment','subcontract',
                  'transport','overhead','consumables','other'
                )),
  unit        TEXT,                          -- Nos / sqft / kg / m³ / LS / trip
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cbs_master_category  ON public.cbs_master(category);
CREATE INDEX IF NOT EXISTS idx_cbs_master_is_active ON public.cbs_master(is_active);

CREATE TRIGGER cbs_master_updated_at
  BEFORE UPDATE ON public.cbs_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- PROJECT BUDGETS  (per-project CBS budget line items with revision support)
-- ============================================================================
-- DESIGN NOTE: Three-field budget pattern to support Phase 3 revisions:
--   base_budget_amount   = quantity × rate  (GENERATED — never editable directly)
--   revision_amount_total = cumulative ± from approved revisions (plain numeric)
--   current_budget_amount = base + revision_amount_total  (GENERATED — the live budget)
-- Variance report always uses current_budget_amount.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- RESTRICT: a CBS code that is in use by a budget line cannot be deleted.
  cbs_id                UUID NOT NULL REFERENCES public.cbs_master(id) ON DELETE RESTRICT,
  zone                  TEXT,                  -- "Ground Floor", "First Floor", "" etc.
  quantity              NUMERIC NOT NULL DEFAULT 0,
  unit                  TEXT,
  rate                  NUMERIC NOT NULL DEFAULT 0,
  -- Three-field revision-safe budget design
  base_budget_amount    NUMERIC GENERATED ALWAYS AS (quantity * rate) STORED,
  revision_amount_total NUMERIC NOT NULL DEFAULT 0,   -- cumulative ± from all approved revisions
  current_budget_amount NUMERIC GENERATED ALWAYS AS ((quantity * rate) + revision_amount_total) STORED,
  original_amount       NUMERIC NOT NULL DEFAULT 0,   -- snapshot locked on first approval
  revision_no           INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','approved')),
  -- approved_by stores the approver's EMAIL (from x-user-email header), not a
  -- user UUID — intentionally TEXT so historical approver identity survives
  -- even if the auth.users row is later removed.
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_budgets_project    ON public.project_budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_cbs        ON public.project_budgets(cbs_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_project_cbs ON public.project_budgets(project_id, cbs_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_status     ON public.project_budgets(status);

CREATE TRIGGER project_budgets_updated_at
  BEFORE UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- ALTER cost_entries — add CBS linkage, zone, and approval workflow
-- ============================================================================
-- cbs_id is nullable at DB level (old entries have no CBS).
-- UI requires CBS for new entries. Future migration enforces NOT NULL after
-- existing data is mapped.
-- ============================================================================
ALTER TABLE public.cost_entries
  -- RESTRICT: prevent deleting a CBS code that is referenced by cost entries.
  ADD COLUMN IF NOT EXISTS cbs_id UUID REFERENCES public.cbs_master(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS zone TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected'));

CREATE INDEX IF NOT EXISTS idx_cost_entries_cbs ON public.cost_entries(cbs_id);

-- ============================================================================
-- RLS — enable + authenticated-staff full access (service role bypasses)
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cbs_master','project_budgets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_all ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_auth_all ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'');',
      t, t);
  END LOOP;
END $$;

-- ============================================================================
-- SEED — 33 Standard Construction CBS Codes
-- ============================================================================
-- Using DO block for idempotency (re-runnable; won't duplicate).
-- ============================================================================
DO $$
BEGIN
  -- 01 Preliminaries
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('01.01', 'Preliminaries', 'Site establishment & mobilisation', 'overhead', 'LS')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('01.02', 'Preliminaries', 'Project management & supervision', 'overhead', 'month')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('01.03', 'Preliminaries', 'Watchman / site security', 'labour', 'month')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 02 Earthwork
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('02.01', 'Earthwork', 'Excavation & earth removal (sub)', 'subcontract', 'cum')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('02.02', 'Earthwork', 'Backfilling & compaction labour', 'labour', 'cum')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 03 Foundation
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('03.01', 'Foundation', 'PCC / lean concrete material', 'material', 'cum')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('03.02', 'Foundation', 'Rubble stone / aggregate material', 'material', 'cum')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('03.03', 'Foundation', 'Footing rebar & binding wire', 'material', 'kg')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('03.04', 'Foundation', 'Foundation labour (excavation + concrete)', 'labour', 'cum')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 04 RCC Structure
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('04.01', 'RCC Structure', 'Cement bags', 'material', 'bag')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('04.02', 'RCC Structure', 'TMT steel rebar', 'material', 'kg')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('04.03', 'RCC Structure', 'Aggregate & river sand', 'material', 'cum')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('04.04', 'RCC Structure', 'RCC work (shuttering + pour + cure)', 'subcontract', 'cum')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 05 Masonry
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('05.01', 'Masonry', '8 inch block material', 'material', 'Nos')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('05.02', 'Masonry', 'Block masonry labour', 'labour', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('05.03', 'Masonry', '4 inch block / brick material', 'material', 'Nos')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('05.04', 'Masonry', 'Mortar & masonry material consumables', 'consumables', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 06 Plastering
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('06.01', 'Plastering', 'Internal plastering labour', 'labour', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('06.02', 'Plastering', 'External plastering labour', 'labour', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 07 Flooring
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('07.01', 'Flooring', 'Tile / granite / marble material', 'material', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('07.02', 'Flooring', 'Flooring labour (tiles + grouting)', 'labour', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 08 Painting
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('08.01', 'Painting', 'Primer, putty & paint material', 'material', 'litre')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('08.02', 'Painting', 'Painting labour (interior + exterior)', 'labour', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 09 Electrical
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('09.01', 'Electrical', 'Wiring, conduits, switches & panels', 'material', 'LS')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('09.02', 'Electrical', 'Electrical installation labour', 'labour', 'LS')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 10 Plumbing
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('10.01', 'Plumbing', 'Pipes, fittings & sanitary ware', 'material', 'LS')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('10.02', 'Plumbing', 'Plumbing installation labour', 'labour', 'LS')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 11 Doors & Windows
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('11.01', 'Doors & Windows', 'Door frames, shutters & window frames', 'material', 'Nos')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('11.02', 'Doors & Windows', 'Door & window fixing labour', 'labour', 'Nos')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 12 External Works
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('12.01', 'External Works', 'Compound wall & gate (subcontract)', 'subcontract', 'rft')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('12.02', 'External Works', 'Driveway, pathway & landscaping (sub)', 'subcontract', 'sqft')
  ON CONFLICT (cbs_code) DO NOTHING;

  -- 13 Other / Sundry
  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('13.01', 'Other', 'Material transport & delivery charges', 'transport', 'trip')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('13.02', 'Other', 'Sundry / unclassified labour', 'labour', 'day')
  ON CONFLICT (cbs_code) DO NOTHING;

  INSERT INTO public.cbs_master (cbs_code, category, work_item, cost_type, unit) VALUES
    ('13.03', 'Other', 'Consumables & small tools', 'consumables', 'LS')
  ON CONFLICT (cbs_code) DO NOTHING;
END $$;
