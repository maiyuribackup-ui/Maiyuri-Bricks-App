# Maiyuri Lead Identity Resolution

Links the same customer across three systems: **WhatsApp Business → Superfone call → Supabase/Odoo lead**.

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
| Resolution script | `/home/ram/maiyuri-clickhouse/scripts/resolve-lead-identities.py` |
| Sync wrapper | `/home/ram/.hermes/scripts/maiyuri_relationship_layer_sync.sh` |
| Query view | `maiyuri_events.resolved_leads` |
| Edge predicate | `LIKELY_SAME_AS` |
| Node type | `WhatsAppContact` |
| Edge source | `lead_resolution` |

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

The `maiyuri_relationship_layer_sync.sh` cron (`c9219846e7ba`, every 6h) runs three scripts in order:

```text
sync-relationship-layer.py          → Odoo/Todoist/WhatsApp/agent ontology
sync-tech-stack-to-relationship-layer.py → tech components
resolve-lead-identities.py          → WhatsApp↔lead identity resolution
```

## Limitations

1. **Phone number matching not yet used.** If both systems expose a phone number, that is a stronger signal than name. Future enhancement.
2. **Superfone names not directly ingested.** Currently matches WhatsApp→Odoo. Superfone→Supabase is handled separately by the reconciliation script. A full 3-way link (WhatsApp + Superfone + Supabase) needs Superfone contact export.
3. **No manual override yet.** A future "confirm/merge" UI or approval flow would let Ram correct wrong matches.
