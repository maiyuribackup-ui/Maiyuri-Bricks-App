# Maiyuri Agent Governance

## Authority levels

| Level | Permission | Phase 1 status |
|---|---|---|
| L0 Observe | Read-only analysis | Enabled |
| L1 Draft | Draft actions/messages | Enabled |
| L2 Propose | Propose governed action | Enabled |
| L3 Execute approved | Execute after Ram approval | Disabled except explicit approved actions |
| L4 Deterministic automation | Pre-approved guarded flows only | Existing workflows only |

## Communication rules

- Initial delivery channel: Telegram only.
- No public WhatsApp/team message unless Ram explicitly says send/share/post/notify/reply.
- Agents may draft WhatsApp messages but must not send them.

## Mutation rules

- New agent-created Todoist tasks require Ram approval.
- Agents may propose task title, owner, due date, and source reason.
- Odoo/Supabase business-critical mutations require governed approval.

## Source-of-truth rules

- Odoo: invoices, payments, accounting, manufacturing/ERP truth.
- Supabase: app leads, smart quotes, tasks, app workflow truth.
- Todoist: action tracking and assignees.
- Langfuse: AI trace quality.
- Maiyuri ClickHouse: event analytics/history only, never operational truth.
