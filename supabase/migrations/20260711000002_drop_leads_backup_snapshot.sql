-- Security cleanup: drop the pre-V2 leads snapshot.
-- It had RLS disabled (fully readable with the anon key — flagged critical
-- by the Supabase security advisor). Its own table comment marked it safe
-- to drop once the V2 rollout was stable (rolled out 2026-06-01; live leads
-- table verified healthy at 1,013 rows before dropping). Owner approved.
DROP TABLE IF EXISTS public.leads_backup_v2_20260601;
