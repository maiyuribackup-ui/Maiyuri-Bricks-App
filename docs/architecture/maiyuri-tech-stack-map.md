# Maiyuri Tech Stack Knowledge Map v1

Canonical living map for Maiyuri Bricks technology, relationships, source-of-truth boundaries, and business value.

**Rule:** Every material new feature/agent/integration must consult this map before building and update it after implementation.

## Operating principle

```text
Existing infra first → source of truth respected → event/relationship logged → insight captured → value compounded
```

## Component registry

| Component | Type | Status | Value addition |
|---|---|---|---|
| Odoo ERP | erp | live | Authoritative business truth for revenue, orders, production, delivery, collections, and ERP activities. |
| Supabase App DB | operational_db | live | Operational app state and fast product workflows around sales/AI features. |
| Todoist | task_system | live | Execution discipline: owner, action, due date, completion trail. |
| WhatsApp Business Profile | communication_signal | live | Captures real sales/project movement from WhatsApp without requiring Ram to inspect every chat. |
| Maiyuri ClickHouse | event_analytics | live | High-speed memory of what happened, what changed, and how systems relate. |
| Relationship Layer | ontology_execution_layer | live | Connects Person/System/Agent/Action to Lead/Order/Invoice/Task/Customer/Risk/Capability. |
| Agent Insight Repository | learning_repository | live | Converts one-time reports into compound operational learning. |
| Hermes / Maiyuri Agentic OS | agent_runtime | live | Coordinates specialist agents into owner-action-deadline rhythm. |
| Maiyuri Intelligence MCP | semantic_business_intelligence | live | Authoritative tool layer for metric-backed reasoning and profit ontology. |
| Langfuse | ai_observability | live | Shows whether AI workflows are actually instrumented and healthy. |
| Maiyuri Bricks App | web_app | live/developing | Business operating interface and customer/sales workflow surface. |
| Tech Stack Knowledge Map | architecture_knowledge_base | v1-live | Prevents duplicate infra and makes every new feature reuse existing business capability. |

## Source-of-truth boundaries

| Source | Owns truth for | Do not use it for |
|---|---|---|
| Odoo ERP | Posted invoices, orders, MRP, inventory, delivery, ERP activities | Chat messages or Todoist completion truth |
| Supabase | App workflows, smart quotes, app-specific leads/calls | Posted revenue/accounting truth |
| Todoist | Task assignment, due dates, completion activity | ERP order/invoice truth |
| WhatsApp Business | Raw communication movement signals | Authoritative task/commercial state |
| ClickHouse | Event history and derived relationships | Transactional writes/source of truth |
| Insight Repository | Durable learning cards | Raw logs/full reports |
| Maiyuri Intelligence MCP | Governed metrics + profit ontology | Raw Odoo dumps or unverified claims |

## New feature reuse checklist

Before building any new tool/database/agent, answer:

1. Can Odoo be source of truth?
2. Can Supabase/App DB be reused instead of a new store?
3. Should the action be logged to ClickHouse?
4. Does relationship layer need new nodes/edges?
5. Does Insight Repository need a durable learning card?
6. Which existing agent/report should consume this?
7. What business capability/value does this strengthen?
8. What constraints/secrets/governance rules apply?

## Files

- `component-registry.json` — canonical machine-readable registry.
- `relationship-value-map.md` — human map of component relationships and value.
- `tech-stack-steward-agent.md` — agent contract.
- `../../maiyuri-clickhouse/initdb/002_relationship_layer.sql` — ontology schema.
- `../../maiyuri-clickhouse/scripts/sync-relationship-layer.py` — sync including tech stack.