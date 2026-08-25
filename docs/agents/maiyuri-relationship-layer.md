# Maiyuri Relationship Layer

This is a graph-style relationship layer implemented on ClickHouse, not a separate graph database.

## Purpose

Answer founder questions such as:

- Who did what today?
- Which Odoo leads/orders/invoices have action ownership?
- Which Todoist/WhatsApp movements connect to customer or sales execution?
- Which relationship path explains sales movement, delivery risk, cash risk, or profit leakage?

## Source-of-truth rule

This layer is **derived analytics only**.

| Business state | Source of truth |
|---|---|
| ERP leads, orders, invoices, deliveries, production, activities | Odoo cache / Odoo |
| Task activity and completion | Todoist |
| WhatsApp Business message movement | WhatsApp observer |
| Agent runs/briefs | Hermes cron + ClickHouse events |
| Finance/profit truth | Odoo posted accounting + Maiyuri Intelligence MCP |

## ClickHouse objects

```text
maiyuri_events.entity_nodes
maiyuri_events.entity_edges
maiyuri_events.actor_activity_daily
maiyuri_events.customer_journey_edges
```

## Current ontology nodes

- `Customer`
- `Lead`
- `SaleOrder`
- `Invoice`
- `ReceivableRisk`
- `OdooActivity`
- `Delivery`
- `ProductionRun`
- `Product`
- `TodoistActivity`
- `TodoistTask`
- `WhatsAppMessage`
- `WhatsAppChat`
- `Agent`
- `AgentRun`
- `Person`

## Current predicates

- `OWNS_LEAD`
- `ASSIGNED_ACTIVITY`
- `ACTS_ON`
- `PLACED_BY`
- `BILLED_TO`
- `HAS_RECEIVABLE_RISK`
- `DELIVERS_TO`
- `DELIVERED_BY`
- `PRODUCED_IN`
- `HAS_TODOIST_ACTIVITY`
- `ASSIGNED_TO`
- `SENT_MESSAGE`
- `MENTIONED_IN_WHATSAPP`
- `GENERATES`

## Sync command

```bash
/home/ram/.hermes/scripts/maiyuri_relationship_layer_sync.sh
```

Real script:

```text
/home/ram/maiyuri-clickhouse/scripts/sync-relationship-layer.py
```

Schema:

```text
/home/ram/maiyuri-clickhouse/initdb/002_relationship_layer.sql
```

## Verification queries

```bash
cd /home/ram/maiyuri-clickhouse
./scripts/ch.sh "SELECT entity_type, count() FROM maiyuri_events.entity_nodes FINAL GROUP BY entity_type ORDER BY count() DESC"
./scripts/ch.sh "SELECT predicate, source_system, count() FROM maiyuri_events.entity_edges FINAL GROUP BY predicate, source_system ORDER BY count() DESC"
./scripts/ch.sh "SELECT * FROM maiyuri_events.actor_activity_daily ORDER BY day DESC, activity_count DESC LIMIT 20"
```

## Ontology position

Maiyuri already had a strong finance/profit ontology through Maiyuri Intelligence MCP (`profit-kg-v1.1`). This relationship layer extends ontology usage into execution:

```text
Person → Action/Activity → Lead/Order/Invoice/Task/Message → Customer/Profit/Risk
```

So ontology is now used in two layers:

1. **Profit ontology** — Odoo accounting, invoice profit, cost views, delivery/cash risk.
2. **Execution ontology** — who did what, on which business object, with what risk/action implication.

## Why no Graph DB yet

ClickHouse is enough for current needs: daily activity, owner accountability, journey snapshots, and compact reporting. Add a separate Graph DB only if we need interactive multi-hop path finding, relationship algorithms, or large semantic graph exploration beyond SQL views.
