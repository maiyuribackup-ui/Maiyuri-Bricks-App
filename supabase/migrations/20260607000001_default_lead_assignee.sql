-- Default new leads to Nithya when no assignee is provided.
--
-- All lead-creation paths (manual API, Telegram voice/text auto-create, future
-- sources) insert into public.leads, so a BEFORE INSERT trigger guarantees a
-- consistent default without touching each call site. Resolves Nithya by name
-- at insert time, so it keeps working if her user id changes. If no matching
-- user exists, assigned_staff stays NULL (lead pushes then fall back to
-- leadership) — safe degradation.

CREATE OR REPLACE FUNCTION public.set_default_lead_assignee()
RETURNS TRIGGER AS $$
DECLARE
  default_assignee uuid;
BEGIN
  IF NEW.assigned_staff IS NULL THEN
    SELECT id INTO default_assignee
    FROM public.users
    WHERE name ILIKE 'nithya%'
    ORDER BY created_at
    LIMIT 1;
    NEW.assigned_staff := default_assignee;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_default_lead_assignee ON public.leads;
CREATE TRIGGER trg_default_lead_assignee
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_lead_assignee();
