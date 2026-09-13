# Maiyuri Lead Identity Resolution

Links the same customer across three systems into one full picture:

```text
WhatsApp (name) ──┐
Superfone (name+phone) ──┼── one customer
Supabase/Odoo lead (name+phone+uuid) ──┘
```

## The three legs

| Leg | Source | Strongest signal | Linked by |
|---|---|---|---|
| WhatsApp → Odoo | `whatsapp.business.message.observed` events | name | fuzzy name match |
| Superfone → Supabase | reconciliation audit JSON (`lead_id`) | phone | `masked_phone` + `masked_phone+name` (authoritative) |
| Superfone → WhatsApp / Odoo | cross-link | name | fuzzy name match |

**Superfone is the anchor** — it carries real phone numbers. Where a phone signature is unique, we anchor a `Person` node on it and link everything else to that.

## Problem

A customer exists in multiple systems under slightly different names:

| System | Name source | Variation risk |
|---|---|---|
| WhatsApp Business | Manually saved contact name | High — nicknames, spelling, emojis, short forms |
| Superfone call | Voice-to-text / saved contact | Medium |
| Supabase/Odoo lead | Superfone voice message → lead | Low — same name as Superfone |

Because names vary slightly, the same customer can appear as 2–3 separate entities, splitting their full journey (call → quote → order → delivery).

## Solution

A fuzzy name-matching layer in ClickHouse that:

1. Extracts WhatsApp contact names from `whatsapp.business.message.observed` events
2. Gets lead names from the Odoo analytics cache (`crm_leads` + partners)
3. Computes multiple matching signals
4. Creates `WhatsAppContact` nodes + `LIKELY_SAME_AS` edges into the relationship layer

## Matching logic

```text
token_jaccard  × 1.0   — word overlap (primary)
trigram        × 0.7   — character overlap
first_name     + 0.2   — first word matches
subset         + 0.1   — one name fully contained in the other
```

**Threshold:** 0.45

**Short-name guard:** single-token names of ≤3 chars (e.g. "Ram", "Raj") require token_jaccard ≥ 0.8 — they are too generic to fuzzy-match against longer names.

## Artifacts

| Artifact | Location |
|---|---|
| Resolution script (WhatsApp→Odoo) | `/home/ram/maiyuri-clickhouse/scripts/resolve-lead-identities.py` |
| Resolution script (Superfone→Supabase) | `/home/ram/maiyuri-clickhouse/scripts/resolve-superfone-identities.py` |
| Sync wrapper | `/home/ram/.hermes/scripts/maiyuri_relationship_layer_sync.sh` |
| Unified query view | `maiyuri_events.customer_identity` |
| WhatsApp-lead view | `maiyuri_events.resolved_leads` |
| Edge predicate | `LIKELY_SAME_AS` (name), `SAME_PHONE` (phone) |
| Node types | `WhatsAppContact`, `SuperfoneContact`, `SupabaseLead`, `Person` |
| Edge source | `lead_resolution`, `superfone_resolution` |

## Query the unified identity

```sql
SELECT caller_name, from_type, lead_name, to_type, predicate, confidence, method
FROM maiyuri_events.customer_identity
ORDER BY confidence DESC
```

## Query resolved leads

```sql
SELECT whatsapp_name, lead_name, confidence, method, lead_type
FROM maiyuri_events.resolved_leads
ORDER BY confidence DESC
```

## Confidence labels

| Score | Label |
|---|---|
| ≥ 0.85 | High — same customer |
| 0.60 – 0.85 | Medium — likely same, verify |
| < 0.60 | Low — needs manual verification |

## How it runs

The `maiyuri_relationship_layer_sync.sh` cron (`c9219846e7ba`, every 6h) runs five scripts in order:

```text
sync-relationship-layer.py               → Odoo/Todoist/WhatsApp/agent ontology
sync-tech-stack-to-relationship-layer.py → tech components
resolve-lead-identities.py               → WhatsApp↔Odoo fuzzy name match
resolve-superfone-identities.py          → Superfone↔Supabase phone+name match
sync-superfone-call-log.py               → persistent call CDR history + per-call lead resolution
```

## Superfone Call Log

A persistent CDR table (`maiyuri_events.superfone_calls`) holds every Superfone call with its lead resolution:

```sql
-- "Was a call made but no corresponding lead exists?"
SELECT call_date, customer_name, call_status, phone_masked
FROM maiyuri_events.superfone_orphan_calls
ORDER BY call_date DESC
```

```sql
-- Daily reconciliation from persistent history
SELECT call_date, total_calls, orphan_calls, answered
FROM maiyuri_events.superfone_reconciliation_daily
ORDER BY call_date DESC
```

```sql
-- Full call resolution with lead status
SELECT start_time, customer_name, match_status, lead_status
FROM maiyuri_events.superfone_call_resolution
WHERE call_date = today()
```

Current state: 602 calls, 502 matched (83%), 93 orphan (15%), 7 ambiguous (1%).

## Limitations

1. **Phone number matching not yet used.** If both systems expose a phone number, that is a stronger signal than name. Future enhancement.
2. **Superfone names not directly ingested.** Currently matches WhatsApp→Odoo. Superfone→Supabase is handled separately by the reconciliation script. A full 3-way link (WhatsApp + Superfone + Supabase) needs Superfone contact export.
3. **No manual override yet.** A future "confirm/merge" UI or approval flow would let Ram correct wrong matches.
