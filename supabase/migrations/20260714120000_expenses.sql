-- ============================================================================
-- Reimbursement / Petty Cash module
--
-- Field staff hold a petty-cash FLOAT (money transferred to them). They record
-- expenses against it; the office tops it up (reimburses). Balance is ALWAYS
-- computed live = Σ top-ups − Σ claims(status in pending|approved); never cached.
--
--  expense_types          master: what kinds of spend exist (Petrol, Food, …)
--  expense_vehicle_rates  master: per-km rate per vehicle (petrol amount = km×rate)
--  petty_cash_topups      admin credits to a staffer's float
--  expense_claims         the debits (rich; petrol carries route/km/customer)
--
-- Follows the Renewals conventions: TEXT+CHECK enums, shared set_updated_at()
-- trigger, RLS on with a permissive authenticated-read policy (writes go
-- through the service-role client in the API, which is the real gate).
-- ============================================================================

-- shared updated_at helper (idempotent — also defined by earlier migrations)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------- masters ----

CREATE TABLE IF NOT EXISTS public.expense_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- maps to cost_entries.cost_category so approved project expenses post cleanly
  cost_category TEXT NOT NULL DEFAULT 'miscellaneous'
    CHECK (cost_category IN ('material','labour','machine','transport','fuel',
      'loading','unloading','subcontract','repair','overhead','miscellaneous')),
  kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','petrol')),
  requires_project BOOLEAN NOT NULL DEFAULT false,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_vehicle_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  per_km_rate NUMERIC NOT NULL DEFAULT 0 CHECK (per_km_rate >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- ledger -----

CREATE TABLE IF NOT EXISTS public.petty_cash_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_topups_user
  ON public.petty_cash_topups (user_id);

CREATE TABLE IF NOT EXISTS public.expense_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expense_type_id UUID NOT NULL REFERENCES public.expense_types(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  -- petrol trip detail (null for standard expenses)
  vehicle_rate_id UUID REFERENCES public.expense_vehicle_rates(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_name TEXT,
  from_location TEXT,
  to_location TEXT,
  km NUMERIC CHECK (km IS NULL OR km >= 0),
  per_km_rate_applied NUMERIC, -- snapshot of the rate at submit time
  -- workflow
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  cost_entry_id UUID REFERENCES public.cost_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_claims_user_status
  ON public.expense_claims (user_id, status);
CREATE INDEX IF NOT EXISTS idx_expense_claims_pending
  ON public.expense_claims (created_at) WHERE status = 'pending';

-- ---------------------------------------------------------------- RLS --------

ALTER TABLE public.expense_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vehicle_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read expense_types" ON public.expense_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read expense_vehicle_rates" ON public.expense_vehicle_rates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read petty_cash_topups" ON public.petty_cash_topups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read expense_claims" ON public.expense_claims
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------- triggers ---

DROP TRIGGER IF EXISTS trg_expense_types_updated_at ON public.expense_types;
CREATE TRIGGER trg_expense_types_updated_at
  BEFORE UPDATE ON public.expense_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_expense_vehicle_rates_updated_at ON public.expense_vehicle_rates;
CREATE TRIGGER trg_expense_vehicle_rates_updated_at
  BEFORE UPDATE ON public.expense_vehicle_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_expense_claims_updated_at ON public.expense_claims;
CREATE TRIGGER trg_expense_claims_updated_at
  BEFORE UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------- seeds ------

INSERT INTO public.expense_types (name, cost_category, kind, requires_project, icon, sort_order)
SELECT * FROM (VALUES
  ('Petrol / Fuel',       'fuel',          'petrol',   false, '⛽', 10),
  ('Food & Refreshments', 'miscellaneous', 'standard', false, '🍽️', 20),
  ('Materials purchase',  'material',      'standard', true,  '🧱', 30),
  ('Tools & Consumables', 'miscellaneous', 'standard', false, '🔧', 40),
  ('Toll & Parking',      'transport',     'standard', false, '🅿️', 50),
  ('Other',               'miscellaneous', 'standard', false, '📌', 60)
) AS v(name, cost_category, kind, requires_project, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.expense_types);

INSERT INTO public.expense_vehicle_rates (label, per_km_rate)
SELECT * FROM (VALUES
  ('Two-wheeler', 4),
  ('Car / Van',   12)
) AS v(label, per_km_rate)
WHERE NOT EXISTS (SELECT 1 FROM public.expense_vehicle_rates);
