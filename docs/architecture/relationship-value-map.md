# Maiyuri Relationship + Value Map

## System relationships

| From | Relationship | To | Value |
|---|---|---|---|
| Odoo ERP | FEEDS | Maiyuri Intelligence MCP | Odoo transactions feed governed metrics/profit tools |
| Odoo ERP | FEEDS | Relationship Layer | ERP leads/orders/invoices/activities become execution relationships |
| Supabase App DB | FEEDS | Maiyuri Bricks App | App DB powers product workflows |
| Supabase App DB | FEEDS | Agentic OS | Agents inspect app lead/task state |
| Todoist | FEEDS | ClickHouse | Snapshots and Activity Log create execution event history |
| Todoist | FEEDS | Relationship Layer | Tasks and actors become Person→Task relationships |
| WhatsApp Business | FEEDS | ClickHouse | Observed message movement logs into events |
| WhatsApp Business | FEEDS | Relationship Layer | Sender/message/chat become execution relationship nodes |
| ClickHouse | POWERS | Relationship Layer | Events and cache-derived facts materialize into nodes/edges |
| Relationship Layer | POWERS | Agentic OS | Agents use actor_activity_daily/customer_journey_edges |
| Agentic OS | WRITES_TO | Insight Repository | Specialist agents write durable learning cards |
| Tech Stack Map | FEEDS | Relationship Layer | Tech components/capabilities are synced as ontology nodes |
| Tech Stack Map | GOVERNS | Agentic OS | New feature agents must check stack map before building |
| Tech Stack Map | WRITES_TO | Insight Repository | Steward writes architecture reuse/drift insights |
| Langfuse | FEEDS | Agentic OS | AI Quality checks traces and instrumentation health |

## Value chain

```text
Odoo/Supabase/WhatsApp/Todoist
        ↓
ClickHouse Events
        ↓
Relationship Layer (Person→Action→Object→Customer→Risk)
        ↓
Specialist Agents (Sales, CFO, CoS, AI Quality, Daily Movement)
        ↓
Insight Repository (durable learning cards)
        ↓
Ram decisions / SOP improvement
        ↓
Stronger operating system
```

## Decision guard

A new tool/database/agent is justified **only** if it adds a missing capability that cannot be cleanly handled by:

- Odoo ERP
- Supabase App DB
- Todoist
- WhatsApp Business Profile
- ClickHouse + Relationship Layer
- Agent Insight Repository
- Maiyuri Intelligence MCP

If a new component is proposed, update this map and the component registry.