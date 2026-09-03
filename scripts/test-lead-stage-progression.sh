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

docker exec "$container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /repo/supabase/tests/lead_stage_progression_smoke.sql
