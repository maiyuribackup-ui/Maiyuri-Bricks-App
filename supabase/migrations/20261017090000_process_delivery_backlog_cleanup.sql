-- Process OS outbox: clear the backlog left before the delivery worker ships,
-- and make the delivery views honour RLS.
--
-- 20260914100000_process_event_deliveries was applied to production before
-- the worker code was deployed. Since then its trigger has queued a pending
-- notification + webhook row for every new event while the old dispatcher
-- kept sending those events itself (stamping payload.dispatched_at). Left
-- alone, the first worker run would re-send all of them, and push weeks-old
-- "stage due" notifications for events that were never sent.
--
--   * pending rows whose event the old dispatcher already sent -> delivered
--   * pending rows for events older than a day that were never sent -> skipped
--   * anything fresher stays pending and is delivered normally
--
-- The worker also skips any event carrying payload.dispatched_at, which covers
-- events the old code sends between this migration and the deploy.
--
-- The two views were created as plain (owner-run) views, which bypass RLS and
-- are readable with the anon key; security_invoker makes them use the
-- caller's permissions.
--
-- Data-only plus view options: no schema shape changes. Safe to re-run.

BEGIN;

UPDATE public.process_event_deliveries d
SET status = 'delivered',
    delivered_at = NULLIF(e.payload->>'dispatched_at', '')::timestamptz,
    attempts = GREATEST(d.attempts, 1),
    last_error = NULL
FROM public.process_events e
WHERE e.id = d.event_id
  AND d.status = 'pending'
  AND e.payload ? 'dispatched_at';

UPDATE public.process_event_deliveries d
SET status = 'skipped',
    last_error = 'backlog: stale before the delivery worker went live'
FROM public.process_events e
WHERE e.id = d.event_id
  AND d.status = 'pending'
  AND e.created_at < now() - interval '1 day';

ALTER VIEW IF EXISTS public.process_dead_deliveries SET (security_invoker = true);
ALTER VIEW IF EXISTS public.process_delivery_summary SET (security_invoker = true);

COMMIT;

-- ROLLBACK (manual): the status changes are a one-way backlog decision and are
-- not reverted. To restore the views' previous behaviour:
-- ALTER VIEW public.process_dead_deliveries RESET (security_invoker);
-- ALTER VIEW public.process_delivery_summary RESET (security_invoker);
