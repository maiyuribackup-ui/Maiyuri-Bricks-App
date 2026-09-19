# Process OS — SQL smoke tests

Exercises the plpgsql engine (`supabase/migrations/20260912100000_process_os.sql`)
against a throwaway local Postgres. No Supabase project is touched.

```bash
# 1. local cluster (any Postgres ≥ 15), e.g.
initdb -D /tmp/pgproc/data -U postgres --auth=trust
pg_ctl -D /tmp/pgproc/data -o "-p 54329 -k /tmp" start
P="psql -h /tmp -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"

# 2. scaffold the tables the migrations depend on, then the real migrations
$P -f supabase/tests/process_os/00_scaffold.sql
$P -c "CREATE SCHEMA storage; CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);"
for f in 20260711000001_my_work 20260718120000_work_item_nudges 20260903120000_lead_stage_progression_tasks 20260912100000_process_os; do
  $P -f supabase/migrations/$f.sql
done

# 3. scenarios — every `expect_fail` row must print "expected: <CODE>: …",
#    never "UNEXPECTED SUCCESS"
psql -h /tmp -p 54329 -U postgres -f supabase/tests/process_os/10_smoke.sql
psql -h /tmp -p 54329 -U postgres -f supabase/tests/process_os/20_negative.sql
```

`10_smoke.sql` walks a case start → decision → advance gate → handover
rejected → re-sent → accepted → QC evidence → END, checks the lead-stage
trigger yields to a live instance, the SLA sweep is idempotent, and that a
case started on v1.0 stays on v1.0 after v1.1 is published.
`20_negative.sql` covers every FORBIDDEN / STALE_STAGE / GATE_FAILED /
REASON_REQUIRED guard (PRD §33 security + runtime cases).
