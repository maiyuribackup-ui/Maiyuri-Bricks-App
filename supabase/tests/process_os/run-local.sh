#!/usr/bin/env bash
# Reset a local Postgres and run every Process OS SQL suite once.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres supabase/tests/process_os/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
P="psql -v ON_ERROR_STOP=1 -q"
psql -q -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE;" >/dev/null
psql -q -c "DROP ROLE IF EXISTS anon; DROP ROLE IF EXISTS authenticated; DROP ROLE IF EXISTS service_role;" >/dev/null 2>&1 || true
$P -f supabase/tests/process_os/00_scaffold.sql
$P -c "CREATE SCHEMA storage; CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);"
for f in 20260711000001_my_work 20260718120000_work_item_nudges 20260903120000_lead_stage_progression_tasks 20260912100000_process_os; do
  $P -f "supabase/migrations/$f.sql" 2>&1 | grep -v NOTICE || true
done
fail=0
for suite in 10_smoke 20_negative; do
  out=$(psql -v ON_ERROR_STOP=1 -f "supabase/tests/process_os/$suite.sql" 2>&1) || { echo "$out" | tail -20; echo "$suite: psql error"; fail=1; }
  n=$(echo "$out" | grep -c "expected:" || true)
  if echo "$out" | grep -q "UNEXPECTED SUCCESS"; then echo "$out" | grep -B3 "UNEXPECTED SUCCESS"; echo "$suite: UNEXPECTED SUCCESS"; fail=1; fi
  echo "$suite: $n guards verified"
done
def=$(cd apps/web && bun scripts/dump-process-definition.ts LEAD_TO_DELIVERY)
out=$(psql -v ON_ERROR_STOP=1 -v def="$def" -f supabase/tests/process_os/30_golden.sql 2>&1) || { echo "$out" | tail -25; echo "30_golden: psql error"; fail=1; }
if echo "$out" | grep -q "UNEXPECTED SUCCESS"; then echo "$out" | grep -B3 "UNEXPECTED SUCCESS"; fail=1; fi
echo "30_golden: $(echo "$out" | grep -c 'ok: ') assertions, $(echo "$out" | grep -c 'expected:') guards, $(echo "$out" | grep -c 'GOLDEN OK') final"
exit $fail
