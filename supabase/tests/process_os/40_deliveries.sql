-- Process event delivery outbox (migration 20260914100000_process_event_deliveries).
-- Runs after 10_smoke (which leaves events behind). Requires the migration.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION public.expect_fail(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'UNEXPECTED SUCCESS'; EXCEPTION WHEN others THEN RETURN 'expected: ' || SQLERRM; END $$;
CREATE OR REPLACE FUNCTION public.assert_true(p_ok boolean, p_msg text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(p_ok, false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %', p_msg; END IF; RETURN 'ok: ' || p_msg; END $$;

-- 1. Every existing event has exactly one delivery row per destination (backfill + trigger).
SELECT public.assert_true(
  (SELECT count(*) FROM public.process_events) > 0, 'smoke suite left events to work with');
SELECT public.assert_true(
  NOT EXISTS (SELECT 1 FROM public.process_events e
              WHERE (SELECT count(*) FROM public.process_event_deliveries d WHERE d.event_id = e.id) <> 2),
  'each event has two delivery rows');

-- 2. Uniqueness: a second row for the same event + destination is refused.
SELECT id AS any_event FROM public.process_events ORDER BY created_at LIMIT 1 \gset
SELECT public.expect_fail(format(
  'INSERT INTO public.process_event_deliveries (event_id, process_instance_id, destination) SELECT %L::uuid, process_instance_id, ''webhook'' FROM public.process_events WHERE id = %L::uuid',
  :'any_event', :'any_event')) AS unique_event_destination;
SELECT public.expect_fail(format(
  'INSERT INTO public.process_event_deliveries (event_id, process_instance_id, destination) SELECT %L::uuid, process_instance_id, ''carrier_pigeon'' FROM public.process_events WHERE id = %L::uuid',
  :'any_event', :'any_event')) AS destination_check;

-- 3. A new event automatically gets pending delivery rows in the same transaction.
SELECT process_instance_id AS inst FROM public.process_events WHERE id = :'any_event' \gset
BEGIN;
SELECT public.process_log_event(:'inst'::uuid, NULL, 'process.test_event', NULL, '{"k":"v"}'::jsonb) AS new_event \gset
SELECT public.assert_true(
  (SELECT count(*) FROM public.process_event_deliveries WHERE event_id = :'new_event' AND status = 'pending') = 2,
  'trigger enqueues both destinations as pending');
SELECT public.assert_true(
  (SELECT payload FROM public.process_events WHERE id = :'new_event') = '{"k":"v"}'::jsonb,
  'event payload untouched by delivery bookkeeping');
COMMIT;

-- Reset everything to pending so the claim tests start from a known state.
UPDATE public.process_event_deliveries SET status = 'pending', attempts = 0, leased_by = NULL,
  lease_expires_at = NULL, next_attempt_at = now() - interval '1 minute', last_error = NULL, delivered_at = NULL;
SELECT count(*) AS total FROM public.process_event_deliveries \gset

-- 4. Claim leases rows, bumps attempts, and a second worker gets nothing.
SELECT count(*) AS w1_claimed FROM public.process_claim_deliveries('w1', 1000, 60) \gset
SELECT public.assert_true(:w1_claimed = :total, 'worker 1 claims every due delivery');
SELECT public.assert_true(
  (SELECT count(*) FROM public.process_event_deliveries WHERE status = 'leased' AND leased_by = 'w1' AND attempts = 1 AND lease_expires_at > now()) = :total,
  'claimed rows are leased to w1 with attempts = 1');
SELECT public.assert_true(
  (SELECT count(*) FROM public.process_claim_deliveries('w2', 1000, 60)) = 0,
  'a live lease cannot be stolen by another worker');

-- 5. Settle: delivered / skipped / failed with retry; wrong worker refused.
SELECT id AS d1 FROM public.process_event_deliveries WHERE destination = 'notification' ORDER BY created_at, id LIMIT 1 \gset
SELECT id AS d2 FROM public.process_event_deliveries WHERE destination = 'webhook' ORDER BY created_at, id LIMIT 1 \gset
SELECT id AS d3 FROM public.process_event_deliveries WHERE destination = 'webhook' ORDER BY created_at, id OFFSET 1 LIMIT 1 \gset
SELECT public.assert_true(
  public.process_settle_delivery(:'d1', 'w2', 'delivered') IS NULL,
  'a worker that does not hold the lease cannot settle it');
SELECT public.assert_true(
  (public.process_settle_delivery(:'d1', 'w1', 'delivered'))->>'status' = 'delivered',
  'lease holder settles as delivered');
SELECT public.assert_true(
  (SELECT delivered_at IS NOT NULL AND leased_by IS NULL FROM public.process_event_deliveries WHERE id = :'d1'),
  'delivered row records delivered_at and drops the lease');
SELECT public.assert_true(
  (public.process_settle_delivery(:'d2', 'w1', 'skipped'))->>'status' = 'skipped',
  'webhook without configuration is recorded as skipped');
SELECT public.assert_true(
  (public.process_settle_delivery(:'d3', 'w1', 'failed', 'HTTP 500 from n8n', 120))->>'status' = 'failed',
  'failure keeps the row retryable');
SELECT public.assert_true(
  (SELECT next_attempt_at > now() + interval '100 seconds' AND last_error = 'HTTP 500 from n8n' FROM public.process_event_deliveries WHERE id = :'d3'),
  'failed row schedules the retry and keeps the error');
SELECT public.expect_fail(format('SELECT public.process_settle_delivery(%L, ''w1'', ''maybe'')', :'d3')) AS outcome_check;

-- 6. Delivered and skipped rows are never claimed again; a failed row is claimable once due.
UPDATE public.process_event_deliveries SET status = 'pending', leased_by = NULL, lease_expires_at = NULL, next_attempt_at = now()
  WHERE id NOT IN (:'d1', :'d2', :'d3');
SELECT public.assert_true(
  NOT EXISTS (SELECT 1 FROM public.process_claim_deliveries('w3', 1000, 60) WHERE id IN (:'d1', :'d2', :'d3')),
  'delivered, skipped and not-yet-due rows are not claimed');
UPDATE public.process_event_deliveries SET next_attempt_at = now() - interval '1 second' WHERE id = :'d3';
SELECT public.assert_true(
  EXISTS (SELECT 1 FROM public.process_claim_deliveries('w3', 1000, 60) WHERE id = :'d3'),
  'a failed row is claimed once its retry time has passed');

-- 7. Expired lease is reclaimable and counts as another attempt.
UPDATE public.process_event_deliveries SET lease_expires_at = now() - interval '1 second' WHERE id = :'d3';
SELECT attempts AS before_attempts FROM public.process_event_deliveries WHERE id = :'d3' \gset
SELECT public.assert_true(
  EXISTS (SELECT 1 FROM public.process_claim_deliveries('w4', 1000, 60) WHERE id = :'d3' AND leased_by = 'w4' AND attempts = :before_attempts + 1),
  'an expired lease is reclaimed by another worker');

-- 8. Dead letter after max attempts.
UPDATE public.process_event_deliveries SET attempts = max_attempts WHERE id = :'d3';
SELECT public.assert_true(
  (public.process_settle_delivery(:'d3', 'w4', 'failed', 'gave up', 60))->>'status' = 'dead',
  'failure at max attempts dead-letters the delivery');
SELECT public.assert_true(
  NOT EXISTS (SELECT 1 FROM public.process_claim_deliveries('w5', 1000, 60) WHERE id = :'d3'),
  'dead deliveries are never claimed');
SELECT public.assert_true(
  EXISTS (SELECT 1 FROM public.process_dead_deliveries WHERE id = :'d3'),
  'dead deliveries are observable through the view');

-- 9. Errors are bounded at the database too.
SELECT public.expect_fail(format('UPDATE public.process_event_deliveries SET last_error = repeat(''x'', 600) WHERE id = %L', :'d1')) AS error_bounded;

-- 10. Per-instance claim only returns that case's deliveries.
UPDATE public.process_event_deliveries SET status = 'pending', leased_by = NULL, lease_expires_at = NULL, next_attempt_at = now();
SELECT public.assert_true(
  NOT EXISTS (SELECT 1 FROM public.process_claim_deliveries('w6', 1000, 60, :'inst'::uuid) WHERE process_instance_id <> :'inst'::uuid),
  'instance-scoped claim stays inside the case');

SELECT 'DELIVERIES OK' AS result;
