# Maiyuri Bricks Agentic AI Operating Architecture Plan

> **For Hermes:** This is a plan-mode architecture document. Do not implement until Ram approves the design and sequencing.

**Goal:** Build a world-class, governed multi-agent operating system for Maiyuri Bricks, starting with a Chief of Staff Orchestrator Agent, then Sales Leads Follow-up Agent, then CFO Manufacturing Profitability Agent.

**Architecture:** A hub-and-spoke agent system where specialist agents observe, reason, and recommend inside their domains while the Chief of Staff Orchestrator coordinates priorities, prevents duplicate noise, enforces governance, and presents Ram with decision-ready actions. Operational systems remain source-of-truth; agents use Odoo, Supabase, Todoist, Langfuse, and ClickHouse as inputs, not as uncontrolled mutation targets.

**Tech Stack:** Hermes Agent, Maiyuri Intelligence MCP, Supabase, Odoo, Todoist, WhatsApp/Telegram gateway, Langfuse, isolated Maiyuri ClickHouse (`/home/ram/maiyuri-clickhouse`), GitHub/Vercel, cron jobs, governed action proposals.

---

## 1. Executive Thesis

Maiyuri does not need more random bots. Maiyuri needs an **AI management layer** that behaves like a disciplined executive operating team.

The operating problem today is not absence of tools. We already have many systems:

- Odoo for ERP/accounting/production source of truth.
- Supabase app for lead, task, quote, production, delivery, and UI workflows.
- Todoist for action tracking.
- WhatsApp/Telegram for communication.
- Maiyuri Intelligence MCP for governed business intelligence.
- Langfuse for AI trace observability.
- ClickHouse for high-speed event analytics.

The problem is that Ram is still the human orchestrator who has to ask:

- What changed?
- What matters?
- Who owns it?
- What is overdue?
- What should happen next?
- What needs escalation?

The agentic architecture should move Maiyuri from:

```text
tool-assisted management
```

to:

```text
system-driven operating rhythm
```

---

## 2. Core Design Principles

### 2.1 Agents are accountable roles, not chat personalities

Each agent owns a business function and produces a structured output:

```text
Signal → Diagnosis → Owner → Action → Deadline → Escalation → Learning
```

### 2.2 Chief of Staff is the only coordinator

Specialist agents should not compete for Ram's attention. They report to the Chief of Staff Orchestrator, which compresses the signal.

### 2.3 Observe by default, mutate only through governance

Agents may:

- read data,
- analyze,
- draft,
- propose actions,
- create internal recommendations.

Agents must not directly:

- send WhatsApp/team messages,
- mutate Odoo,
- mutate Supabase business-critical records,
- approve financial/business rules,
- expose secrets,
- create noisy tasks without deterministic criteria.

Side effects go through either:

1. deterministic guarded automation, or
2. `propose_action → Ram approval → execute_approved_action`.

### 2.4 Source-of-truth discipline

| Domain | Source of truth | Analytics/history |
|---|---|---|
| invoices, payments, accounting | Odoo | ClickHouse summaries, MCP reports |
| leads, smart quotes, app workflows | Supabase | ClickHouse events, Langfuse traces |
| tasks/follow-ups | Todoist / app tasks | ClickHouse SLA events |
| AI call quality | Langfuse | ClickHouse aggregates |
| business rules/claims | Maiyuri Intelligence governed knowledge | MCP provenance |

ClickHouse is never the operational source of truth. It is the history/intelligence layer.

### 2.5 Ram-facing outputs must be decision-ready

Default output shape:

```text
1. CEO signal
2. Top 3 actions
3. Top risk
4. Decision needed
5. What changed since last check
```

No raw dumps unless Ram asks.

---

## 3. Target Agent Roles

## 3.1 Chief of Staff Orchestrator Agent

### Mission

Act as Ram's operating chief of staff for Maiyuri Bricks. Coordinate specialist agents, compress signals, enforce governance, and maintain the business rhythm.

### Responsibilities

- Own daily/weekly operating cadence.
- Pull specialist briefs into one priority list.
- Detect conflicts between Sales, Finance, Factory, and AI Quality signals.
- Convert analysis into owner/action/deadline.
- Decide what should be escalated to Ram now vs held for daily brief.
- Prevent duplicate reports and noisy alerts.
- Track whether previous actions were completed.
- Route asks to the correct specialist.

### Inputs

- Sales Agent brief.
- CFO Agent brief.
- Future Factory/Delivery Agent brief.
- AI Quality Agent brief.
- Todoist pending items.
- Odoo/MCP management brief.
- ClickHouse event deltas.
- Ram's direct priorities.

### Outputs

Daily format:

```text
## 🦚 Maiyuri Chief of Staff Brief

### CEO Signal
<one-line truth>

### Today’s Top 3 Actions
1. Owner → action → deadline → expected outcome
2. ...
3. ...

### Escalations
- <only if Ram must intervene>

### Decisions Needed
- Decision:
- Recommendation:

### What Changed Since Yesterday
- ...
```

### Guardrails

- Never post to WhatsApp groups unless Ram explicitly says send/share/post/notify/reply.
- Never let specialist agents send competing daily reports directly to Ram unless configured.
- Never mix Ram personal finance into Maiyuri business finance.
- Keep all actions grounded in source systems.

### First version success criteria

- Produces morning and night executive briefs.
- Includes Sales + CFO sections.
- Limits actions to top 3.
- Clearly separates `action`, `risk`, and `decision`.
- Can say “no urgent escalation” when nothing matters.

---

## 3.2 Sales Leads Follow-up Agent

### Mission

Own lead conversion discipline: every lead/quote should have a next action, owner, and deadline.

### Responsibilities

- Detect stale leads.
- Detect stale smart quotes/quotations.
- Identify hot/warm leads needing action today.
- Find leads with no owner/next action.
- Draft follow-up messages for Ram/sales team.
- Track follow-up SLA.
- Separate lead generation issues from conversion discipline issues.

### Inputs

Ram-approved ownership rule: use **both** Supabase owner fields and Todoist assignees. When they conflict, surface the mismatch as a data/ownership hygiene issue instead of guessing.

- Supabase `leads`, `smart_quotes`, `call_recordings`, `notes`, `tasks`, `nudge_history`.
- Todoist Maiyuri tasks and assignees.
- WhatsApp action-item extraction results where deterministic.
- ClickHouse lead lifecycle events.
- Langfuse traces for Smart Quote and nudge AI quality.

### Outputs

Daily 7 AM format:

```text
## Sales Follow-up Brief

### Summary
- Overdue follow-ups:
- Due today:
- Unassigned/no-owner:
- High-intent stale quotes:

### Top 15 Actions
1. Owner → lead/customer → action → deadline → reason
...

### Escalation Bucket
- Unassigned or no response after X days

### Draft Replies
- Only when useful; not auto-sent.
```

### Scoring

Recommended lead priority score:

```text
priority = intent + recency + quote_value + buying_signal - staleness_penalty - missing_data_penalty
```

### Mutations

Ram-approved rule for this agentic system: **new agent-created Todoist tasks require Ram approval first**.

The Sales Agent may draft task proposals with owner/action/deadline, but must not create them until Ram approves. Existing separately-authorized deterministic WhatsApp @mention automation remains governed by its own guardrails and should not be expanded without approval.

### First version success criteria

- Produces top 15 actions, not a dump.
- Groups by owner.
- Highlights overdue and unassigned.
- Uses `owner → action → deadline` consistently.
- Does not send messages automatically.

---

## 3.3 CFO Manufacturing Profitability Agent

### Mission

Act like a strong manufacturing-company finance head for Maiyuri Bricks: protect real profitability, cash, accounting truth, customer-wise margins, invoice-wise margins, product-wise unit economics, COGS reliability, BoM costing, and management controls.

This agent is responsible for Maiyuri Bricks business profitability, not Ram's personal finance. It should not merely track a fixed profit target. It should explain whether the company is truly profitable, where profit is leaking, and which customer/product/order/invoice needs action.

### Non-negotiable finance rules

- Revenue = posted customer invoices only.
- Quotations and sale orders are pipeline/booked demand, not revenue.
- Preserve Factory vs Projects split where data allows.
- Delivery P&L is separate.
- Untagged analytic entries are audit failures.
- Never mix Ram personal finance with Maiyuri finance.
- Never give invoice-wise profit unless posted COGS/direct-cost lines exist and pass the Maiyuri Intelligence COGS accuracy gate.
- Never give a single cost-per-brick number without stating the cost view: variable production, full factory, delivered/project, or accounting COGS.

### Manufacturing finance responsibilities

- Monthly real profitability report: posted revenue, COGS, gross profit, direct costs, overhead allocation, operating profit, receivables/cash risk.
- Customer-wise profitability: revenue, COGS/direct costs, delivery/project costs, margin, collection risk, repeatability.
- Invoice-wise profitability: use `get_invoice_profit(invoice_name)` and block profit when COGS is missing/dirty.
- Order/site profitability: use order/site profitability tools where invoices, delivery, and cash risk must be connected.
- Product-wise profitability: compare selling price, Odoo product cost, BoM expected cost, standard cost, and management unit economics.
- COGS audit: check posted COGS lines, valuation sanity, negative/zero/impossible costs, missing accounts, and cost-method mismatch.
- BoM audit: check components, output quantity/UoM, raw material costs, work-center operation costs, labor assumptions, and scrap/wastage.
- Manufacturing overhead: separate direct labor, variable production cost, fixed factory overhead, admin/sales overhead, and delivery/project cost.
- Collections discipline: overdue receivables and DSO risk remain first-class because profit without collection is cash risk.
- Data hygiene: flag untagged Factory/Projects entries, missing COGS, dirty BoMs, missing vendor bills, or broken valuation.

### Finance/accounting skillset expected

The CFO Manufacturing Profitability Agent must reason like a manufacturing finance person with knowledge of:

- management accounting vs statutory/accounting profit,
- COGS and inventory valuation,
- BoM standard cost vs actual cost,
- raw material price variance,
- labor and work-center costing,
- fixed overhead absorption by normal capacity,
- gross margin, contribution margin, EBITDA/operating-profit style views,
- customer profitability, invoice profitability, product profitability,
- receivables and cash conversion,
- audit hygiene and account/analytic tagging.

### Inputs

- Odoo invoices/payments/accounting via Maiyuri Intelligence MCP.
- `get_invoice_profit(invoice_name)` for invoice-wise accounting profit with COGS accuracy gate.
- `get_cogs_graph_schema()` for correct invoice-wise profit data model.
- Profit graph / profit lens tools for customer/product/order/factory/delivery/cash profitability.
- Odoo sale orders/quotations as pipeline only.
- Standard costs and unit economics tools.
- Odoo BoM, product cost, work-center, manufacturing, and stock valuation signals where available.
- ClickHouse business events.
- Supabase estimates/smart quotes for pipeline context only.

### Outputs

Daily CFO format:

```text
## Maiyuri Manufacturing CFO Brief

### Financial Truth
- Posted invoice revenue:
- Collections received:
- Open receivables:
- Overdue receivables:

### Profitability Signals
- Invoice/customer/product/order margin signals:
- COGS/BOM confidence:
- Delivery/project leakage:

### Top 3 Money Actions
1. Customer/vendor/account → action → owner → deadline → impact

### Data Hygiene
- Missing COGS / dirty BoM / missing tags / unreliable areas

### Decision Needed
- Decision:
- Recommendation:
```

Monthly CFO format:

```text
## Maiyuri Monthly Manufacturing Profitability Review

### 1. Profit Truth
- Posted revenue only:
- Accounting COGS confidence:
- Gross profit:
- Factory overhead / operating cost:
- Estimated operating profit:
- Cash/receivables risk:

### 2. Customer-wise Profitability
- Best customers by margin and collection quality:
- Risk customers by low margin/overdue receivables:

### 3. Invoice-wise Profitability
- Profitable invoices:
- Low/negative-margin invoices:
- Invoices blocked due to missing/dirty COGS:

### 4. Product / BoM / COGS Review
- Product cost vs BoM expected cost:
- Raw material cost issues:
- Labor/work-center mismatch:
- Valuation/accounting hygiene:

### 5. Management Actions
- Pricing/control actions:
- Accounting cleanup actions:
- Collections actions:
```

### First version success criteria

- Never reports quote/order pipeline as revenue.
- Always includes collections if receivables exist.
- Shows monthly profitability only with COGS/data-confidence labels.
- Produces customer-wise and invoice-wise profitability where COGS gates pass.
- Flags invoices/products where profit cannot be trusted because COGS/BOM/valuation is dirty.
- Ends with top 3 money actions.
- Flags data confidence/hygiene.

---

## 4. Future Agents, Not Phase 1

Do not start with these until the first three roles are stable.

### 4.1 Factory / Delivery Planning Agent

Own production/delivery risk, raw material runway, dispatch commitments, and production focus.

### 4.2 AI Quality Agent

Own Langfuse trace quality, AI errors, missing traces after deploys, prompt/tool improvement proposals.

### 4.3 Knowledge / SOP Agent

Convert recurring chaos into SOPs, business rules, MemoryOS updates, and training material.

---

## 5. System Architecture

```text
                           Ram
                            │
                            ▼
              Chief of Staff Orchestrator Agent
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
 Sales Follow-up Agent   CFO Manufacturing Profitability Agent   Future Factory/AI/SOP Agents
        │                   │                   │
        └──────────────┬────┴────┬──────────────┘
                       ▼         ▼
                 Governance + Memory
                       │
                       ▼
        Odoo / Supabase / Todoist / WhatsApp / Langfuse / ClickHouse
```

---

## 6. Data and Event Architecture

### 6.1 Operational reads

Agents read through stable interfaces:

- Maiyuri Intelligence MCP for Odoo and governed business intelligence.
- Supabase/app APIs for lead/app data.
- Todoist for action inventory.
- Langfuse ClickHouse for AI traces.
- Maiyuri ClickHouse for business events.

### 6.2 Event logging

Every agent run should write a lightweight event to `maiyuri_events.events`:

```json
{
  "event_name": "agent.sales_followup.brief_generated",
  "source": "agent.sales_followup",
  "surface": "hermes-cron",
  "environment": "production",
  "properties_json": {
    "overdue_count": 5,
    "actions_count": 12,
    "escalations_count": 2
  }
}
```

### 6.3 Agent run event names

```text
agent.chief_of_staff.brief_generated
agent.chief_of_staff.escalation_detected
agent.sales_followup.brief_generated
agent.sales_followup.stale_lead_detected
agent.sales_followup.unassigned_lead_detected
agent.cfo_profit.brief_generated
agent.cfo_profit.overdue_receivable_detected
agent.cfo_profit.profit_leakage_detected
agent.cfo_profit.data_hygiene_warning
```

### 6.4 Trace correlation

When an agent uses an AI model call, record the Langfuse `trace_id` into ClickHouse event `trace_id` where available.

---

## 7. Governance Model

### 7.1 Agent authority levels

| Level | Permission | Example |
|---|---|---|
| L0 Observe | read-only analysis | detect stale leads |
| L1 Draft | draft messages/actions | draft WhatsApp follow-up |
| L2 Propose | propose governed action | propose task/activity/note update |
| L3 Execute approved | execute after Ram approval | update order internal note |
| L4 Deterministic automation | pre-approved guarded flows only | WhatsApp @mention → Todoist task |

Phase 1 agents are L0-L2 only, except existing deterministic Todoist capture.

### 7.2 Public communication rule

No agent posts to WhatsApp/team groups unless Ram explicitly says:

```text
send / share / post / notify / reply in the group
```

### 7.3 Financial rule gate

CFO Agent must pass finance validation:

- posted invoices only for revenue,
- pipeline labelled as pipeline,
- data confidence stated,
- no personal finance mixing.

---

## 8. Phase Plan

## Phase 0: Architecture approval

**Objective:** Get Ram's approval on agent roles, authority, and first cadence.

**Deliverable:** This document.

**Acceptance criteria:**

- Ram approves initial three agents.
- Ram confirms daily cadence.
- Ram confirms no public auto-messaging.

---

## Phase 1: Agent contracts and data contracts

**Objective:** Define exact input/output JSON contracts for the three agents.

**Files to create:**

- `docs/agents/chief-of-staff-agent.md`
- `docs/agents/sales-followup-agent.md`
- `docs/agents/cfo-profit-agent.md`
- `docs/agents/agent-governance.md`
- `docs/agents/event-taxonomy.md`

**Acceptance criteria:**

- Each agent has mission, inputs, outputs, authority level, and failure modes.
- Event taxonomy maps to ClickHouse table.
- Output schemas are machine-testable.

---

## Phase 2: Deterministic data collectors

**Objective:** Build read-only collectors before adding reasoning.

Collectors:

1. Sales collector
   - leads overdue,
   - due today,
   - no owner,
   - stale quote,
   - high-intent recent calls.

2. CFO manufacturing profitability collector
   - posted invoice revenue,
   - receivables and collections,
   - overdue customers,
   - invoice-wise profit via COGS accuracy gate,
   - customer-wise profitability,
   - product-wise cost/margin signals,
   - BoM/COGS/valuation hygiene,
   - pipeline context clearly labelled as pipeline,
   - data hygiene warnings.

3. Chief of Staff collector
   - prior actions,
   - open escalations,
   - agent brief summaries.

**Acceptance criteria:**

- Collectors are read-only.
- Tests cover empty data, stale data, and high-risk data.
- No WhatsApp/Odoo/Supabase mutation.

---

## Phase 3: First agent briefs

**Objective:** Generate structured briefs without scheduled automation.

Commands/tools should support manual run:

```text
run sales followup brief
run cfo profit brief
run chief of staff brief
```

**Acceptance criteria:**

- Sales brief outputs top 15 owner/action/deadline.
- CFO brief outputs manufacturing profitability truth, COGS/BOM confidence, and top 3 money actions.
- Chief of Staff combines both into top 3 company actions.
- All runs log to ClickHouse.

---

## Phase 4: Scheduled cadence

**Objective:** Add cron jobs after manual quality is proven.

Initial cadence:

| Time | Agent | Delivery |
|---|---|---|
| 7:00 AM IST | Sales Follow-up Agent | Ram private Telegram only |
| Morning, after Sales/CFO signals | Chief of Staff Orchestrator Agent | Ram private Telegram only |
| 8:00 PM IST | CFO Manufacturing Profitability Agent | Ram private Telegram only |
| 9:30 PM IST | Chief of Staff Orchestrator Agent | Ram private Telegram only |

**Acceptance criteria:**

- Jobs are self-contained.
- No public group delivery.
- If data source fails, report graceful degraded state.
- Each run logs event to ClickHouse.

---

## Phase 5: Action loop and accountability

**Objective:** Track whether recommended actions were completed.

Capabilities:

- convert approved actions into Todoist/app tasks,
- detect missed deadlines,
- escalate repeated misses,
- compare previous brief vs current outcome.

**Acceptance criteria:**

- The Chief of Staff brief includes `yesterday’s action status`.
- Repeated missed owner actions are escalated.
- Ram can approve a proposed action from the brief.

---

## 9. Agent Quality Metrics

Use ClickHouse + Langfuse to measure:

### Sales Agent

- actions generated,
- actions completed,
- overdue reduced,
- stale leads recovered,
- quote follow-up latency.

### CFO Agent

- overdue receivables surfaced,
- collection actions completed,
- data hygiene issues found,
- delivery/cost leakage warnings.

### Chief of Staff Agent

- number of escalations,
- duplicate/noisy items suppressed,
- prior action closure rate,
- Ram decision response rate.

### AI/system quality

- missing traces,
- LLM errors,
- slow agent runs,
- failed data sources.

---

## 10. Failure Modes and Controls

| Failure mode | Control |
|---|---|
| Too many alerts | Chief of Staff compression and top-3 limit |
| Wrong financial interpretation | CFO finance rules and validation gate |
| Public message accidentally sent | No public sends except explicit Ram instruction |
| Dirty source data | Data confidence section |
| Agent hallucinates actions | Every action must cite source signal |
| Duplicate tasks | Idempotency keys and source event IDs |
| Silent data failure | Degraded-mode report with source failure listed |
| Agents conflict | Chief of Staff resolves priority based on cash, customer, production risk |

---

## 11. First Implementation Slice Recommendation

Do **not** start by building all agents.

Start with this minimal vertical slice:

```text
Sales collector → Sales Follow-up brief → ClickHouse event log → Chief of Staff summary shell
```

Then add:

```text
CFO manufacturing profitability collector → CFO Profit brief → Chief of Staff combined actions
```

Only after manual quality is high, schedule cron delivery.

---

## 12. Ram Decisions Captured on 2026-08-25

1. Chief of Staff brief cadence: **morning and night**.
2. Sales Agent ownership source: **both Supabase owner and Todoist assignee**; mismatches become hygiene issues.
3. CFO Agent scope: **real manufacturing profitability**, not a fixed target tracker. It must analyze monthly profit, customer-wise profit, invoice-wise profit, COGS, BoM, product cost, overhead, valuation hygiene, collections, and manufacturing-accounting controls.
4. Delivery channel: **Telegram only** for initial outputs.
5. Task creation: **after Ram approval only**. Agents may propose tasks but must not create Todoist tasks automatically as part of this agentic system.

---

## 13. Approval Checklist

Before implementation, Ram should approve:

- [x] Initial agents: Chief of Staff, Sales Follow-up, CFO Manufacturing Profitability.
- [x] No public auto-messaging.
- [x] Initial delivery channel: Telegram only.
- [x] Chief of Staff is the only orchestrator.
- [x] CFO rule: posted invoices only as revenue.
- [x] CFO scope: real monthly/customer/invoice/product profitability with COGS/BOM/manufacturing-accounting depth.
- [x] Sales ownership source: Supabase owner + Todoist assignee.
- [x] Agent-created Todoist tasks require Ram approval.
- [ ] Start with manual briefs before cron.
- [ ] Log agent runs to isolated Maiyuri ClickHouse.

---

## 14. Definition of World-Class for Maiyuri

This architecture is world-class only if it produces:

```text
less chasing by Ram
more owner accountability
clean financial truth
higher lead conversion discipline
clear daily operating rhythm
measurable improvement loops
```

It is not world-class if it only creates more summaries.

The standard is:

```text
Every agent output must either remove confusion, assign ownership, protect cash, recover revenue, or improve the operating system.
```
