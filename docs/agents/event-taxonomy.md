# Maiyuri Agent Event Taxonomy

Events are written to the isolated Maiyuri ClickHouse stack:

```text
/home/ram/maiyuri-clickhouse
http://127.0.0.1:8125
maiyuri_events.events
```

## Required event fields

- `event_name`
- `source`
- `surface`
- `environment`
- `properties_json`
- optional `trace_id`

## Phase 1 events

| Event | Source | Purpose |
|---|---|---|
| `agent.sales_followup.brief_generated` | `agent.sales_followup` | Sales brief produced |
| `agent.sales_followup.stale_lead_detected` | `agent.sales_followup` | Lead/follow-up stale |
| `agent.sales_followup.ownership_mismatch_detected` | `agent.sales_followup` | Supabase owner vs Todoist assignee mismatch |
| `agent.cfo_profit.brief_generated` | `agent.cfo_profit` | CFO manufacturing profitability brief produced |
| `agent.cfo_profit.profitability_blocked` | `agent.cfo_profit` | Profit cannot be trusted due COGS/BOM/valuation issue |
| `agent.chief_of_staff.brief_generated` | `agent.chief_of_staff` | Combined brief produced |
| `agent.chief_of_staff.escalation_detected` | `agent.chief_of_staff` | Ram intervention needed |

## Properties convention

Use small JSON payloads only; do not write raw customer PII, full transcripts, secrets, or large reports.

## Manual smoke

From repo root:

```bash
set -a
source /home/ram/maiyuri-clickhouse/.env
set +a
export MAIYURI_CLICKHOUSE_HTTP_URL=http://127.0.0.1:8125
export MAIYURI_CLICKHOUSE_USER="$CLICKHOUSE_USER"
export MAIYURI_CLICKHOUSE_PASSWORD="$CLICKHOUSE_PASSWORD"
npx --yes tsx apps/web/scripts/maiyuri-agent-smoke.ts
```

Verify:

```bash
cd /home/ram/maiyuri-clickhouse
./scripts/ch.sh "SELECT event_name, count() FROM maiyuri_events.events WHERE event_name LIKE 'agent.%' GROUP BY event_name"
```
