-- Leads structure V2: decompose `status` into clean axes + rename columns
--
-- WHAT THIS DOES (in-place, no data loss):
--   * status  -> lead_status      (7 new workflow-state values)
--   * stage   -> pipeline_stage    (8 new sales-journey values; enum -> text)
--   * NEW: lead_temperature (priority), factory_visit_status, lost_reason_code
--
-- The old `status` mixed workflow state with priority (hot/cold). We extract the
-- priority into lead_temperature BEFORE rewriting status, so no signal is lost.
--
-- Ordering matters: temperature & factory-visit are backfilled from the ORIGINAL
-- columns; pipeline_stage is rewritten from (old status + old stage) BEFORE the
-- status column itself is rewritten.
--
-- Safety: take a backup first (run separately, outside this migration):
--   CREATE TABLE public.leads_backup_20260531 AS SELECT * FROM public.leads;

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Drop the dependent view (recreated at the end against the new column)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.lead_stats;

-- ---------------------------------------------------------------------------
-- 1. Add the three genuinely-new columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT
    CHECK (lead_temperature IN ('hot', 'warm', 'cold')) DEFAULT 'warm';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS factory_visit_status TEXT
    CHECK (factory_visit_status IN (
      'not_discussed', 'invited', 'scheduled', 'visited', 'no_show', 'not_required'
    )) DEFAULT 'not_discussed';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason_code TEXT
    CHECK (lost_reason_code IN (
      'price_too_high', 'chose_kerala_competitor', 'chose_conventional_aac',
      'project_delayed', 'customer_not_reachable', 'no_genuine_requirement',
      'transport_delivery_cost', 'engineer_mason_not_convinced',
      'family_decision_delayed', 'other'
    ));

-- ---------------------------------------------------------------------------
-- 2. Backfill lead_temperature from the OLD status (priority signal)
-- ---------------------------------------------------------------------------
UPDATE public.leads SET lead_temperature = CASE
  WHEN status = 'hot'  THEN 'hot'
  WHEN status = 'cold' THEN 'cold'
  ELSE 'warm'
END;

-- ---------------------------------------------------------------------------
-- 3. Backfill factory_visit_status from the OLD stage
-- ---------------------------------------------------------------------------
UPDATE public.leads SET factory_visit_status = CASE
  WHEN stage::text IN ('factory_visit', 'factory_visit_pending') THEN 'scheduled'
  WHEN stage::text = 'factory_visit_completed'                    THEN 'visited'
  ELSE 'not_discussed'
END;

-- ---------------------------------------------------------------------------
-- 4. Convert stage enum -> TEXT (drop default first so the type change is clean)
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE public.leads ALTER COLUMN stage TYPE TEXT USING stage::text;

-- ---------------------------------------------------------------------------
-- 5. Rewrite stage VALUES (uses old status + old stage), then rename -> pipeline_stage
--    Mapping derived from approved table 11 + verified prod data.
-- ---------------------------------------------------------------------------
UPDATE public.leads SET stage = CASE
  WHEN status = 'lost'                       THEN 'closed_lost'
  WHEN status = 'converted'                  THEN 'order_won'
  WHEN status = 'new'                        THEN 'new_inquiry'
  WHEN status = 'cold' THEN
    CASE WHEN stage IN ('quote_sent','quotation_pending','factory_visit',
                        'factory_visit_pending','factory_visit_completed','negotiation')
         THEN 'decision_pending' ELSE 'new_inquiry' END
  WHEN status IN ('follow_up','hot') THEN
    CASE stage
      WHEN 'quote_sent'              THEN 'quote_shared'
      WHEN 'quotation_pending'       THEN 'quote_shared'
      WHEN 'factory_visit'           THEN 'factory_visit_proof'
      WHEN 'factory_visit_pending'   THEN 'factory_visit_proof'
      WHEN 'factory_visit_completed' THEN 'factory_visit_proof'
      WHEN 'negotiation'             THEN 'finalisation'
      WHEN 'order_confirmed'         THEN 'order_won'
      WHEN 'in_production'           THEN 'order_won'
      WHEN 'ready_dispatch'          THEN 'order_won'
      WHEN 'delivered'               THEN 'order_won'
      ELSE 'new_inquiry'
    END
  ELSE 'new_inquiry'
END;

ALTER TABLE public.leads RENAME COLUMN stage TO pipeline_stage;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_pipeline_stage_check CHECK (pipeline_stage IN (
    'new_inquiry', 'qualified_lead', 'quote_shared', 'factory_visit_proof',
    'decision_pending', 'finalisation', 'order_won', 'closed_lost'
  ));
ALTER TABLE public.leads ALTER COLUMN pipeline_stage SET DEFAULT 'new_inquiry';
UPDATE public.leads SET pipeline_stage = 'new_inquiry' WHERE pipeline_stage IS NULL;
ALTER TABLE public.leads ALTER COLUMN pipeline_stage SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Rewrite status VALUES (depends on old status only), then rename -> lead_status
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ALTER COLUMN status DROP DEFAULT;

UPDATE public.leads SET status = CASE
  WHEN status IN ('lost','converted')  THEN 'closed'
  WHEN status = 'new'                  THEN 'new_contact_pending'
  WHEN status IN ('follow_up','hot')   THEN 'follow_up_scheduled'
  WHEN status = 'cold'                 THEN 'nurture_later'
  ELSE 'new_contact_pending'
END;

ALTER TABLE public.leads RENAME COLUMN status TO lead_status;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_lead_status_check CHECK (lead_status IN (
    'new_contact_pending', 'contact_attempted', 'connected',
    'follow_up_scheduled', 'waiting_for_customer', 'nurture_later', 'closed'
  ));
ALTER TABLE public.leads ALTER COLUMN lead_status SET DEFAULT 'new_contact_pending';
ALTER TABLE public.leads ALTER COLUMN lead_status SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. (Re)create indexes + view.
--    NOTE: the `lead_stage` enum type is intentionally NOT dropped — the
--    pre-restructure backup table (leads_backup_v2_20260601) still has a `stage`
--    column of that type, so dropping it would require CASCADE (which would
--    corrupt the backup). The enum is now unused by `leads` and harmless; drop
--    it later, after the backup table is removed.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage   ON public.leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status      ON public.leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_temperature ON public.leads(lead_temperature)
  WHERE lead_temperature = 'hot';
CREATE INDEX IF NOT EXISTS idx_leads_factory_visit    ON public.leads(factory_visit_status);

-- Recreate the dashboard stats view against the renamed column
CREATE OR REPLACE VIEW public.lead_stats AS
SELECT
  lead_status,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE follow_up_date = CURRENT_DATE) AS due_today,
  COUNT(*) FILTER (WHERE follow_up_date < CURRENT_DATE) AS overdue
FROM public.leads
GROUP BY lead_status;

-- Documentation
COMMENT ON COLUMN public.leads.pipeline_stage IS 'Sales journey stage (V2): new_inquiry, qualified_lead, quote_shared, factory_visit_proof, decision_pending, finalisation, order_won, closed_lost';
COMMENT ON COLUMN public.leads.lead_status IS 'Current action state (V2): new_contact_pending, contact_attempted, connected, follow_up_scheduled, waiting_for_customer, nurture_later, closed';
COMMENT ON COLUMN public.leads.lead_temperature IS 'Priority (V2): hot/warm/cold';
COMMENT ON COLUMN public.leads.factory_visit_status IS 'Factory visit funnel (V2): not_discussed, invited, scheduled, visited, no_show, not_required';
COMMENT ON COLUMN public.leads.lost_reason_code IS 'Structured lost reason (V2); free-text lost_reason kept for notes';

COMMIT;
