# Reconciliation method & data quirks

Why the matching works the way it does, and what breaks it.

## The core problem: three different clocks

Every recorded call has three timestamps, and no two agree:

| Timestamp | Source | Meaning |
|---|---|---|
| `Start Time` | Superfone export column | when the call started, in the export's own timezone |
| epoch in filename | `Superfone_Recording_..._1784609686000.wav` | when the call started, in **Superfone's internal clock** |
| `created_at` | `call_recordings` row | when a human forwarded it to Telegram — hours later |

**Never match on `created_at`.** Forwarding lag was a median of 1.6 hours and a
maximum of 173 hours in July 2026, so day-bucketing by `created_at` reports a late
forward as both a loss on the call day and a phantom surplus on the forward day.

The filename epoch is the reliable key — it identifies the call itself. The catch
is that it does not line up with the export clock.

## The offset is real, constant, and must be re-detected every run

In July 2026 the filename epoch (read as UTC) sat exactly **9.5 hours** behind the
export's `Start Time` — verified on 57 of 63 rows. That is not IST (+5:30) and not
any obvious timezone; it is an artefact of how Superfone stamps files versus how it
renders exports.

Because it is unexplained, it is not stable. `reconcile.py` therefore grid-searches
0–15h in 15-minute steps and picks the offset that aligns the most rows, then prints
what it found:

```
Clock offset detected     : +9.5h  (57/63 app rows aligned)
```

**Always read that line.** If the alignment ratio drops below ~70% the script warns,
and the per-call numbers should not be trusted until you understand why. A changed
offset (Superfone updated its export) is benign — the search absorbs it. A collapsed
alignment usually means something else changed: a new filename format, a different
export locale, or recordings arriving from a source other than Superfone.

### When offset detection fails

The script falls back to phone-only matching and warns loudly. In that mode a
customer who called five times and had one recording ingested counts as fully
captured, so **loss is understated**. Fix the root cause rather than shipping the
fallback numbers:

1. Check the filenames still contain a 13-digit epoch (`_\d{13}\.wav`).
2. Check the export's date column still parses (`dd/mm/yy hh:mm AM/PM`).
3. Widen `OFFSET_SEARCH_HOURS` if Superfone moved to a far-off clock.

## Phone normalisation

Match on the **last 10 digits**. The same customer appears as `9791225192`,
`+919791225192`, and `0 9791225192` across the three systems. Numbers that do not
reduce to 10 digits (e.g. `+974 3099 7878`, a Qatar number) are kept in the report
but will not match a lead — they are genuine data, not errors.

## What counts as "recorded"

A Superfone row has a recording when the `Recording` column renders as `Link`.
Answered calls without a link (13 of 343 in July 2026) are excluded from the
denominator — there is nothing to forward, so they are not a pipeline failure.

Missed, cancelled, line-busy and unanswered calls are counted in "calls handled"
but never in "recorded".

## Known quirks

- **Duplicate ingests.** The same file occasionally arrives twice (2 rows in July
  2026), usually a staff member forwarding again after no visible confirmation.
  Harmless, but it inflates raw row counts — match on phone + call time, not row count.
- **Leads CSV row count.** `wc -l` overstates it; several lead records contain
  embedded newlines in free-text fields. Trust the parser, not the line count.
- **`processing_status` values.** `completed` / `failed` / `pending` /
  `downloading` / `transcribing`. Anything not `completed` after an hour is stuck.
- **Filename name field is unreliable** for customer identity — it is whatever the
  caller was saved as on the handset (`Wrongly_called`, `Company`, `Bangalore`).
  Use the phone number as the key and treat the name as a display label.

## July 2026 baseline

Compare future runs against this. Anything worse warrants investigation; the
capture rate should be climbing toward 100%.

| Measure | Jul 2026 |
|---|---|
| Calls handled | 630 |
| Recorded | 331 |
| Reached the app | 62 (**19%**) |
| Talk time lost | 6.7 of 10.0 hrs |
| Customers with no lead | 68 (104 calls) |
| Orphan recordings | 0 |
| Processing success | 55 of 63 (87%) |
| Capture — Srinivasan | 33% |
| Capture — Rajesh | 2% |

Phases within the month, which is the finding that mattered:

| Window | Capture | Cause |
|---|---|---|
| 1–21 Jul | 14% | recordings never forwarded |
| 22–25 Jul | 2% | Telegram bot webhook hijacked to an external server |
| 26 Jul–1 Aug | 40% | after the webhook fix — forwarding gap remains |

**The lesson:** the outage was the visible event, but it accounted for a minority of
the loss. Always compare the weeks *before* an incident before attributing a gap to it.

## The monitoring gap this skill exists to cover

`stuck-recordings` in the health cron queries rows that arrived and stalled. A
recording that is never forwarded creates no row, so the check cannot see it — the
heartbeat reported "Recordings: 0 processed / 24h · 0 stuck ✅" through a month of
81% loss.

The durable fix is a volume check rather than a state check:

- Pull the day's answered-call count from Superfone (API or a scheduled export).
- Compare against `SELECT count(*) FROM call_recordings WHERE created_at::date = today`.
- Alert when capture falls below a threshold (start at 70%) or when a staff
  member's daily capture is zero while they handled recorded calls.

Until Superfone recordings are pulled automatically rather than hand-forwarded,
run this reconciliation monthly and diff `summary.json` against the previous run.
