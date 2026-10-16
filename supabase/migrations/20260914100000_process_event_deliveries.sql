-- Process OS: durable per-destination delivery of process events (outbox).
--
-- Before this migration the dispatcher stamped payload.dispatched_at on the
-- event BEFORE calling push / Telegram / the n8n webhook, ignored delivery
-- errors and never checked the webhook's HTTP status — a crash or a 500 lost
-- the notification for good. Now every event gets one delivery row per
-- destination, created in the same transaction as the event (trigger), and
-- workers claim rows with an atomic lease, call the outside world with no
-- transaction open, then settle the row as delivered / failed (retry with
-- backoff) / skipped / dead.
--
-- process_events stays the immutable audit stream: nothing here edits it.
-- Additive and safe to re-run; historical events remain readable.

BEGIN;

-- =============================================================================
-- 1. Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.process_event_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.process_events(id) ON DELETE CASCADE,
  process_instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  destination TEXT NOT NULL CHECK (destination IN ('notification', 'webhook')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'leased', 'delivered', 'failed', 'dead', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 100),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  leased_by TEXT CHECK (leased_by IS NULL OR length(leased_by) <= 120),
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  -- Sanitised by the worker; bounded here so nothing large or secret-bearing
  -- can be persisted by accident.
  last_error TEXT CHECK (last_error IS NULL OR length(last_error) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, destination)
);
CREATE INDEX IF NOT EXISTS idx_process_event_deliveries_due
  ON public.process_event_deliveries (next_attempt_at)
  WHERE status IN ('pending', 'failed', 'leased');
CREATE INDEX IF NOT EXISTS idx_process_event_deliveries_instance
  ON public.process_event_deliveries (process_instance_id, status);
CREATE INDEX IF NOT EXISTS idx_process_event_deliveries_status
  ON public.process_event_deliveries (status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_process_event_deliveries_updated ON public.process_event_deliveries;
CREATE TRIGGER trg_process_event_deliveries_updated
  BEFORE UPDATE ON public.process_event_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.process_event_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read process_event_deliveries" ON public.process_event_deliveries;
CREATE POLICY "auth read process_event_deliveries" ON public.process_event_deliveries
  FOR SELECT TO authenticated USING (true);
-- Writes only through the functions below (service role) — no INSERT/UPDATE
-- policy for authenticated.

-- =============================================================================
-- 2. Enqueue on every new event, inside the event's own transaction, so the
--    business state and its pending deliveries commit (or roll back) together.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_event_deliveries_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.process_event_deliveries (event_id, process_instance_id, destination)
  VALUES (NEW.id, NEW.process_instance_id, 'notification'),
         (NEW.id, NEW.process_instance_id, 'webhook')
  ON CONFLICT (event_id, destination) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.process_event_deliveries_enqueue() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_process_events_enqueue_deliveries ON public.process_events;
CREATE TRIGGER trg_process_events_enqueue_deliveries
  AFTER INSERT ON public.process_events
  FOR EACH ROW EXECUTE FUNCTION public.process_event_deliveries_enqueue();

-- =============================================================================
-- 3. Backfill existing events (transition from payload.dispatched_at).
--    Events the old dispatcher marked are recorded as delivered — that is the
--    best knowledge we have and re-sending them would duplicate. Events it
--    never marked become pending and will be delivered by the new worker.
--    payload.dispatched_at is read here once and never written again.
-- =============================================================================
INSERT INTO public.process_event_deliveries
  (event_id, process_instance_id, destination, status, delivered_at, attempts)
SELECT e.id, e.process_instance_id, d.destination,
       CASE WHEN e.payload ? 'dispatched_at' THEN 'delivered' ELSE 'pending' END,
       CASE WHEN e.payload ? 'dispatched_at'
            THEN NULLIF(e.payload->>'dispatched_at', '')::timestamptz END,
       CASE WHEN e.payload ? 'dispatched_at' THEN 1 ELSE 0 END
FROM public.process_events e
CROSS JOIN (VALUES ('notification'), ('webhook')) AS d(destination)
ON CONFLICT (event_id, destination) DO NOTHING;

-- =============================================================================
-- 4. Claim: atomic lease of due deliveries (SKIP LOCKED, single statement).
--    Attempts are counted at claim time so a crashed worker still consumes an
--    attempt; the row becomes reclaimable once its lease expires.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_claim_deliveries(
  p_worker TEXT,
  p_limit INTEGER DEFAULT 50,
  p_lease_seconds INTEGER DEFAULT 120,
  p_instance_id UUID DEFAULT NULL
) RETURNS SETOF public.process_event_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_worker IS NULL OR length(p_worker) = 0 OR length(p_worker) > 120 THEN
    RAISE EXCEPTION 'INVALID_WORKER: worker id is required';
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT d.id
    FROM public.process_event_deliveries d
    WHERE (p_instance_id IS NULL OR d.process_instance_id = p_instance_id)
      AND (
        (d.status IN ('pending', 'failed') AND d.next_attempt_at <= now())
        OR (d.status = 'leased' AND d.lease_expires_at IS NOT NULL AND d.lease_expires_at < now())
      )
    ORDER BY d.next_attempt_at, d.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.process_event_deliveries d
  SET status = 'leased',
      leased_by = p_worker,
      lease_expires_at = now() + make_interval(secs => GREATEST(5, LEAST(COALESCE(p_lease_seconds, 120), 3600))),
      attempts = d.attempts + 1,
      last_attempt_at = now()
  FROM due
  WHERE d.id = due.id
  RETURNING d.*;
END $$;
REVOKE ALL ON FUNCTION public.process_claim_deliveries(TEXT, INTEGER, INTEGER, UUID) FROM PUBLIC;

-- =============================================================================
-- 5. Settle: only the lease holder may record the outcome. Failure schedules
--    the retry (backoff chosen by the worker, bounded here) or dead-letters
--    once max_attempts is reached.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_settle_delivery(
  p_delivery_id UUID,
  p_worker TEXT,
  p_outcome TEXT,
  p_error TEXT DEFAULT NULL,
  p_retry_after_seconds INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_row public.process_event_deliveries%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('delivered', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_OUTCOME: %', p_outcome;
  END IF;
  SELECT * INTO v_row FROM public.process_event_deliveries
  WHERE id = p_delivery_id AND status = 'leased' AND leased_by = p_worker
  FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN NULL; -- lease lost (expired and reclaimed) or already settled
  END IF;

  IF p_outcome = 'delivered' THEN
    UPDATE public.process_event_deliveries
    SET status = 'delivered', delivered_at = now(), leased_by = NULL,
        lease_expires_at = NULL, last_error = NULL
    WHERE id = p_delivery_id;
  ELSIF p_outcome = 'skipped' THEN
    UPDATE public.process_event_deliveries
    SET status = 'skipped', leased_by = NULL, lease_expires_at = NULL, last_error = NULL
    WHERE id = p_delivery_id;
  ELSE
    UPDATE public.process_event_deliveries
    SET status = CASE WHEN v_row.attempts >= v_row.max_attempts THEN 'dead' ELSE 'failed' END,
        leased_by = NULL,
        lease_expires_at = NULL,
        last_error = left(p_error, 500),
        next_attempt_at = now() + make_interval(
          secs => GREATEST(1, LEAST(COALESCE(p_retry_after_seconds, 60), 86400)))
    WHERE id = p_delivery_id;
  END IF;
  RETURN (SELECT to_jsonb(d) FROM public.process_event_deliveries d WHERE d.id = p_delivery_id);
END $$;
REVOKE ALL ON FUNCTION public.process_settle_delivery(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;

-- =============================================================================
-- 6. Observability: dead letters and a per-status summary.
-- =============================================================================
CREATE OR REPLACE VIEW public.process_dead_deliveries AS
  SELECT d.id, d.event_id, d.process_instance_id, d.destination, d.attempts,
         d.last_error, d.last_attempt_at, d.created_at, e.event_type
  FROM public.process_event_deliveries d
  JOIN public.process_events e ON e.id = d.event_id
  WHERE d.status = 'dead';

CREATE OR REPLACE VIEW public.process_delivery_summary AS
  SELECT destination, status, count(*) AS deliveries,
         min(next_attempt_at) FILTER (WHERE status IN ('pending', 'failed')) AS oldest_due
  FROM public.process_event_deliveries
  GROUP BY destination, status;

COMMIT;

-- ROLLBACK (manual):
-- DROP VIEW public.process_delivery_summary; DROP VIEW public.process_dead_deliveries;
-- DROP FUNCTION public.process_settle_delivery(UUID, TEXT, TEXT, TEXT, INTEGER);
-- DROP FUNCTION public.process_claim_deliveries(TEXT, INTEGER, INTEGER, UUID);
-- DROP TRIGGER trg_process_events_enqueue_deliveries ON public.process_events;
-- DROP FUNCTION public.process_event_deliveries_enqueue();
-- DROP TABLE public.process_event_deliveries;
