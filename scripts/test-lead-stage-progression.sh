#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="maiyuri-lead-stage-test-$$"
race_log="$(mktemp)"
stage_pid=""

cleanup() {
  if [ -n "${stage_pid:-}" ]; then
    kill "$stage_pid" >/dev/null 2>&1 || true
    wait "$stage_pid" >/dev/null 2>&1 || true
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -f "$race_log"
}
trap cleanup EXIT

docker run -d \
  --name "$container" \
  -e POSTGRES_PASSWORD=lead_stage_test \
  -v "$repo_root:/repo:ro" \
  postgres:16-alpine >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$container" \
      psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' \
      >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "PostgreSQL test container did not become ready" >&2
  docker logs "$container" >&2 || true
  exit 1
fi

docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /repo/supabase/tests/lead_stage_progression.sql

# Prove the real two-session race: a stage transaction supersedes the old UUID
# but pauses before commit; a stale completion must block and then affect zero
# rows once the cancellation commits.
docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    INSERT INTO public.leads (
      id, name, assigned_staff, pipeline_stage, next_action, follow_up_date
    ) VALUES (
      '10000000-0000-0000-0000-000000000003',
      'Concurrent Transition Test',
      '00000000-0000-0000-0000-000000000001',
      'new_inquiry', NULL, NULL
    );
    UPDATE public.leads
    SET pipeline_stage = 'qualified_lead'
    WHERE id = '10000000-0000-0000-0000-000000000003';
  " >/dev/null

old_item_id="$(docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -tA -U postgres -d postgres -c "
    SELECT id
    FROM public.work_items
    WHERE related_lead_id = '10000000-0000-0000-0000-000000000003'
      AND source_module = 'lead_stage_progression'
      AND status IN ('pending', 'in_progress', 'returned');
  ")"

docker exec -e PGAPPNAME=lead-stage-transition-race "$container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    BEGIN;
    UPDATE public.leads
    SET pipeline_stage = 'quote_shared'
    WHERE id = '10000000-0000-0000-0000-000000000003';
    SELECT pg_sleep(3);
    COMMIT;
  " >"$race_log" 2>&1 &
stage_pid=$!

stage_waiting=0
for _ in $(seq 1 50); do
  if [ "$(docker exec "$container" \
      psql -v ON_ERROR_STOP=1 -tA -U postgres -d postgres -c "
        SELECT count(*)
        FROM pg_stat_activity
        WHERE application_name = 'lead-stage-transition-race'
          AND wait_event = 'PgSleep';
      ")" = "1" ]; then
    stage_waiting=1
    break
  fi
  sleep 0.1
done

if [ "$stage_waiting" -ne 1 ]; then
  wait "$stage_pid" || true
  stage_pid=""
  printf '%s\n' "$(<"$race_log")" >&2
  echo "Stage transition session did not reach the race barrier" >&2
  exit 1
fi

stale_updates="$(docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -tA -U postgres -d postgres -c "
    WITH changed AS (
      UPDATE public.work_items
      SET status = 'completed', completed_at = clock_timestamp()
      WHERE id = '$old_item_id'
        AND status IN ('pending', 'in_progress', 'returned')
      RETURNING 1
    )
    SELECT count(*) FROM changed;
  ")"

wait "$stage_pid"
stage_pid=""

if [ "$stale_updates" != "0" ]; then
  echo "Stale completion changed $stale_updates superseded task rows" >&2
  exit 1
fi

race_state="$(docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -tA -F '|' -U postgres -d postgres -c "
    SELECT
      (SELECT status FROM public.work_items WHERE id = '$old_item_id'),
      count(*) FILTER (
        WHERE status IN ('pending', 'in_progress', 'returned')
      ),
      count(*) FILTER (
        WHERE id <> '$old_item_id'
          AND status IN ('pending', 'in_progress', 'returned')
      )
    FROM public.work_items
    WHERE related_lead_id = '10000000-0000-0000-0000-000000000003'
      AND source_module = 'lead_stage_progression';
  ")"

if [ "$race_state" != "cancelled|1|1" ]; then
  echo "Unexpected post-race state: $race_state" >&2
  exit 1
fi

echo "lead stage progression concurrency: PASS"

docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /repo/supabase/tests/lead_stage_progression_smoke.sql
