---
name: superfone-reconciliation
description: Reconciles the Superfone call-history export against the app's call_recordings and leads tables to find recordings that never reached the app, customers with no lead record, and per-staff capture rates. USE WHEN user mentions 'Superfone', 'call history', 'call recordings audit', 'reconcile calls', 'missing recordings', OR asks why calls/recordings are not showing in the app.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Superfone Reconciliation

Audits the call-intelligence pipeline end to end:

```
Superfone (call happens, recording made)
  → staff forwards the .wav to the Telegram group
    → /api/telegram/webhook ingests it into call_recordings
      → worker transcribes + analyses + links to a lead
```

Every stage silently drops calls. This skill measures each drop precisely, so
"the pipeline is broken" becomes a number with a named cause.

## Inputs needed

| Input | Where from |
|---|---|
| Superfone export (`.xlsx`/`.csv`) | Superfone dashboard → Call History → export the period |
| `call_recordings` rows (`.csv`) | SQL below → Export CSV |
| `leads` rows (`.csv`) | SQL below → Export CSV |

Run in the Supabase SQL editor (project `pailepomvvwjkrhkwdqt`), export each as CSV.
Set the date to a few days before the Superfone window so late forwards are counted:

```sql
SELECT id, phone_number, lead_id, processing_status, created_at, original_filename
FROM call_recordings
WHERE created_at >= 'YYYY-MM-DD'
ORDER BY created_at;
```

```sql
SELECT id, name, contact, assigned_staff, pipeline_stage, created_at FROM leads;
```

If the Supabase MCP connector is live in the session, query directly instead and
save the results as CSV — same columns.

## Run it

```bash
python3 .claude/skills/superfone-reconciliation/scripts/reconcile.py \
  --superfone  <export.xlsx> \
  --recordings <call_recordings.csv> \
  --leads      <leads.csv> \
  --out        ./reconciliation-output
```

`--leads` is optional; without it the customer-coverage section is skipped.
Requires `pandas` + `openpyxl` (`pip install pandas openpyxl` if missing).

Produces in `--out`:

| File | Contents |
|---|---|
| `report.html` | Visual report — verdict, funnel, per-day chart, phases, staff split, fixes |
| `calls_never_ingested.csv` | Every recorded call with no matching app row |
| `customers_without_lead.csv` | Callers who exist nowhere in `leads`, with call counts |
| `summary.json` | All computed figures, for trending across months |

The console prints the same headline numbers — read them before opening the report.

## Then publish the report

Publish `report.html` with the Artifact tool so the user can read and share it.
It is self-contained and theme-aware; no edits needed.

## Interpreting the result

Work through these in order — each rules out a different cause:

1. **Split the window into phases.** The script prints capture rate per week. A
   sudden drop to ~0 across *all* staff is technical (webhook down, token rotated,
   worker dead). A consistently low rate is behavioural (recordings never forwarded).
   Never assume an outage explains the whole gap — check the weeks before it.
2. **Read the per-staff table.** Wide variance between people on the same system is
   the strongest signal there is, and it is nearly always a setup or training gap
   rather than intent. Check their Superfone auto-forward setting and group
   membership before drawing conclusions.
3. **Check `processing_status`** on rows that *did* arrive. Failures clustered on one
   date are an incident (expired API key, worker deploy); failures spread evenly are
   a chronic fault worth a code look.
4. **Check orphans** (`lead_id` null). Zero orphans means the matching logic is
   healthy and the problem is strictly arrival.

## Health-check blind spot this exists to cover

`stuck-recordings` in the health cron only sees rows that *arrived and stalled*.
A recording that is never forwarded creates no row, so the heartbeat reports
"0 stuck, all green" during total loss. Volume-versus-expected is the only check
that catches this — see `references/METHOD.md` for the proposed daily alert.

## Reference

`references/METHOD.md` — matching method, the filename-epoch offset problem,
phone normalisation rules, known data quirks, and the July 2026 baseline to
compare future months against.
