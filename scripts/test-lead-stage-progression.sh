#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="maiyuri-lead-stage-test-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d \
  --name "$container" \
  -e POSTGRES_PASSWORD=lead_stage_test \
  -v "$repo_root:/repo:ro" \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$container" pg_isready -U postgres >/dev/null
docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /repo/supabase/tests/lead_stage_progression.sql

docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /repo/supabase/tests/lead_stage_progression_smoke.sql
