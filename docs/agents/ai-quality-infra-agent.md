# AI Quality & Infrastructure Agent

## Purpose
Observes Langfuse AI traces, Maiyuri ClickHouse pipeline health, Docker infrastructure, and Hermes gateway — surfaces anomalies, degradation, and risks to Ram daily.

## Authority
- Read-only observer and reporter
- No mutations to any system
- No automatic Docker restarts, config changes, or trace modifications
- Escalates risks with severity and recommended action

## What it monitors

### 1. Langfuse AI Trace Health
- **Trace volume** — total traces, traces/day vs previous day
- **Error rate** — traces with error-level observations
- **Latency** — P50/P95 trace duration
- **Stale traces** — no new traces > 24h
- **Data source**: `langfuse-docker-clickhouse-1` at `127.0.0.1:9002` / `8124`

### 2. Maiyuri Business Event Pipeline
- **Event volume** — agent events/day in `maiyuri_events.events`
- **Pipeline gaps** — hours with zero events
- **Error events** — entries in `maiyuri_events.event_errors`
- **Data source**: `maiyuri-clickhouse` at `127.0.0.1:8125` / `9003`

### 3. Docker Infrastructure
- **Container uptime** — all running containers, any restarted/flapping
- **Health checks** — unhealthy containers
- **Exited containers** — stopped unexpectedly
- **Data source**: `docker ps -a`

### 4. Host Health
- **Disk usage** — `/` and `/home` usage %
- **Memory** — available memory, swap usage
- **Load average** — vs CPU cores
- **Gateway uptime** — `hermes-gateway.service` status

### 5. Cron Job Health
- **Failed jobs** — last status = error
- **Stale jobs** — haven't run in expected window
- **New Agentic OS agents** — first-run success/failure

## Cadence
Daily at **9:00 PM IST** (7:30 PM server time)

## Format
Telegram markdown, compact:
```
🔍 *AI & Infra Daily*

*Langfuse* — 31 traces (↑12), 0 errors, P95: 2.1s
*Maiyuri Events* — 20 events today, 5 unique types
*Docker* — 32/32 healthy ✓
*Host* — disk 69%, mem 21G avail, load 1.5
*Cron* — 21/21 last run ok

⚠️ No new Langfuse traces in 8h — check Vercel
```
Then only flag items needing action.

## Model
`google/gemma-4-31b-it:free` via OpenRouter (free tier, 262K ctx, reasoning-capable)
## Todoist Tracking (added 2026-08-25)

Todoist state is synced to Maiyuri ClickHouse every 6 hours via `sync-todoist-events.sh`.

### Tracked events in `maiyuri_events.events`:
| Event | Frequency | Content |
|---|---|---|
| `todoist.snapshot.daily` | every 6h | total, overdue, due_today, future, no_due |
| `todoist.project.snapshot.daily` | every 6h | per-project task counts + overdue |
| `todoist.overdue.warning` | every 6h (if overdue>0) | overdue count, %, top 3 projects |
| `todoist.snapshot.delta` | every 6h | day-over-day task count

### Sync pipeline:
```text
Todoist REST API → sync-todoist-events.py → maiyuri_events.events (ClickHouse)
                                              ↑
                              AI Quality Agent reads for health check
```

### Cron: `0 1,7,13,19 * * *` (every 6h, script-only, no LLM tokens)
