-- Backlog cleanup: legacy-sent events become delivered, stale unsent events
-- become skipped, fresh ones stay pending, and the views run as the caller.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.assert_true(p_ok boolean, p_msg text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(p_ok, false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %', p_msg; END IF; RETURN 'ok: ' || p_msg; END $$;

-- Three existing events, reset to "trigger queued them, nothing ever ran".
WITH picked AS (SELECT id FROM public.process_events ORDER BY created_at, id LIMIT 3)
SELECT array_agg(id) AS ids FROM picked \gset
UPDATE public.process_event_deliveries
SET status = 'pending', attempts = 0, delivered_at = NULL, leased_by = NULL,
    lease_expires_at = NULL, last_error = NULL
WHERE event_id = ANY(:'ids'::uuid[]);
-- [1] old and sent by the legacy dispatcher, [2] old and never sent, [3] fresh
UPDATE public.process_events SET created_at = now() - interval '10 days',
  payload = payload || '{"dispatched_at":"2026-10-01T00:00:00Z"}' WHERE id = (:'ids'::uuid[])[1];
UPDATE public.process_events SET created_at = now() - interval '10 days',
  payload = payload - 'dispatched_at' WHERE id = (:'ids'::uuid[])[2];
UPDATE public.process_events SET created_at = now(),
  payload = payload - 'dispatched_at' WHERE id = (:'ids'::uuid[])[3];

\i supabase/migrations/20261017090000_process_delivery_backlog_cleanup.sql

SELECT public.assert_true(
  (SELECT bool_and(status = 'delivered') FROM public.process_event_deliveries WHERE event_id = (:'ids'::uuid[])[1]),
  'deliveries the legacy dispatcher already sent are recorded as delivered');
SELECT public.assert_true(
  (SELECT bool_and(status = 'skipped') FROM public.process_event_deliveries WHERE event_id = (:'ids'::uuid[])[2]),
  'stale unsent deliveries are skipped, not pushed');
SELECT public.assert_true(
  (SELECT bool_and(status = 'pending') FROM public.process_event_deliveries WHERE event_id = (:'ids'::uuid[])[3]),
  'fresh deliveries stay pending');
SELECT public.assert_true(
  (SELECT bool_and(c.reloptions @> ARRAY['security_invoker=true'])
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('process_dead_deliveries', 'process_delivery_summary')),
  'delivery views run with the caller''s permissions');

SELECT 'BACKLOG OK' AS result;
