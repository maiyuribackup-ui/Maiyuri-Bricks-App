-- Safety snapshot taken immediately BEFORE the Leads V2 restructure
-- (migration 20260531000001). Runs first (earlier timestamp) and commits on its
-- own, so it survives even if the restructure migration fails — giving us a
-- full-fidelity rollback source.
--
-- Rollback (if ever needed): the original status/stage values can be restored
-- from this table by id. Drop it after a safe observation period.

CREATE TABLE IF NOT EXISTS public.leads_backup_v2_20260601 AS
SELECT * FROM public.leads;

COMMENT ON TABLE public.leads_backup_v2_20260601 IS
  'Pre-V2-restructure snapshot of leads (taken 2026-06-01). Safe to drop after the V2 rollout is confirmed stable.';
