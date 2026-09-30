-- ============================================================================
-- Operations Control — atomic "one running demand sync" guarantee.
--
-- Review finding (Phase 2 deployment): the one-active-sync rule was enforced
-- only by a check-then-insert sequence in application code, which two
-- near-simultaneous requests can both pass. This partial unique index makes
-- the guarantee atomic at the database: at most ONE 'running' row per kind.
-- The application retires stale 'running' rows (crashed syncs, >10 min) as
-- 'error' before opening a new run, so a crash cannot hold the index forever;
-- the loser of a genuine race receives unique_violation and reports
-- "already running".
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_sync_runs_one_running
  ON public.oc_sync_runs (kind)
  WHERE status = 'running';
