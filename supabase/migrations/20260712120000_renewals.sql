-- ============================================================================
-- Renewals & Compliance register — long-horizon dated obligations (insurance,
-- tax filings, licenses, vehicle FC, AMCs). The daily My Work generator turns
-- each entry into an assigned, approval-gated work item `remind_days_before`
-- its due date, then rolls the date forward one cycle on completion.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('insurance', 'tax', 'license', 'vehicle', 'amc', 'other')),
  due_date DATE NOT NULL,
  cycle TEXT NOT NULL DEFAULT 'yearly'
    CHECK (cycle IN ('yearly', 'half_yearly', 'quarterly', 'monthly', 'one_time')),
  remind_days_before INTEGER NOT NULL DEFAULT 30 CHECK (remind_days_before BETWEEN 0 AND 180),
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  document_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  -- idempotency: which due_date we already generated a work item for
  last_generated_for DATE,
  last_work_item_id UUID REFERENCES public.work_items(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_renewals_due
  ON public.compliance_renewals (due_date) WHERE status = 'active';

ALTER TABLE public.compliance_renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read renewals" ON public.compliance_renewals
  FOR SELECT TO authenticated USING (true);

-- updated_at trigger (reuses the shared helper if present, else defines it)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_compliance_renewals_updated_at ON public.compliance_renewals;
CREATE TRIGGER trg_compliance_renewals_updated_at
  BEFORE UPDATE ON public.compliance_renewals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
