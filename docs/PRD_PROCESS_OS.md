# PRD: Maiyuri Process OS & Executable Process Playbook

| | |
|---|---|
| **Product** | Maiyuri Bricks App |
| **Feature** | Process OS / Process Playbook |
| **Version** | v0.1 |
| **Primary users** | Managing Partner, Factory Manager, Sales/Project Engineer, Finance/Accounts, future supervisors/staff |
| **Implementation approach** | Extend the existing Maiyuri app and intelligence infrastructure. Do not build a separate application. |
| **Implementation plan** | [PROCESS_OS_IMPLEMENTATION_PLAN.md](PROCESS_OS_IMPLEMENTATION_PLAN.md) |

---

## 1. Executive Summary

Maiyuri Bricks currently has many recurring operating processes:

- new lead handling
- lead qualification
- quotation
- advance payment
- sales-to-factory handover
- production planning
- quality control
- delivery planning
- customer complaints
- machine breakdown
- procurement
- weekly reviews
- project execution
- safety incidents
- collections

Today, the process knowledge can exist across: people's memory, WhatsApp, documents, Odoo, checklists, verbal instructions, SOPs.

The goal of this feature is to convert these processes into a **single executable operating system inside the Maiyuri app**.

The system must answer two different questions:

- **Process Map** — "How does Maiyuri handle this process?"
- **My Work** — "What exactly do I need to do now?"

A process definition should therefore power: visual process diagrams, step-by-step checklists, role ownership, handovers, exit gates, SLA tracking, notifications, escalations, evidence collection, audit trails, AI coaching, process analytics.

The feature must **not** be implemented as static Mermaid diagrams or hard-coded React pages. Processes must be stored as structured, versioned definitions and rendered dynamically.

## 2. Product Vision

Create a Maiyuri Process OS where every recurring operating activity has:

1. a clear trigger
2. a clear owner
3. a clear checklist
4. a clear completion condition
5. a clear handover
6. measurable timing
7. evidence
8. automation
9. escalation
10. AI guidance

Long-term goal: **anyone joining Maiyuri should be able to open the app, identify the current business situation, and know exactly what to do next without depending on another employee's memory.**

## 3. Core Product Principle

The system should not merely document processes. It should **execute and enforce** them.

```
Process definition → Process map → Current stage → Tasks → Exit gates
→ Handover → Automation → Evidence → Audit → Intelligence
```

## 4. Primary Example

The first complete process to implement is **New Lead → Customer → Factory → Delivery**:

```
New WhatsApp Lead → Lead Created → First Response → Qualification → Plan Received
→ Technical Fit → Quote → Follow-Up → Customer Acceptance → Advance Verified
→ Factory Handover → Production / Stock Allocation → Quality Release
→ Delivery Planning → Dispatch → Delivery → Post-Delivery Follow-Up
```

This process must serve as the reference implementation for the Process OS.

## 5. Existing Infrastructure Requirement

Before implementing anything, inspect the entire existing Maiyuri repository. Identify and reuse: authentication, users, roles, permissions, app navigation, web UI, mobile/app UI, database, migration tooling, backend/API architecture, Odoo integration, lead/customer/order models, notification system, Telegram/WhatsApp integrations if already present, AI/intelligence services, audit/event framework, existing task/checklist functionality, existing project/workflow functionality.

Do not create parallel infrastructure where an existing reusable service already exists. Document any architectural assumptions before migration.

## 6. User Roles

**Managing Partner** — full visibility. Can view all processes, define/approve process versions, override gates where authorized, view escalations, view process analytics, inspect audit trails.

**Sales / Project Engineer** (example current owner: Srinivasan) — lead handling, qualification, plan collection, product/customer guidance, quotations, follow-up, commercial confirmation, sales handover, customer coordination.

**Factory Manager** (example current owner: Rajesh) — factory handover acceptance, production planning, stock allocation, quality readiness, delivery coordination, factory exceptions.

**Finance / Accounts** — payment verification, advance status, collections, finance gates.

**System / AI** — can observe, recommend, create suggested actions, trigger allowed automations, detect SLA breaches, assist users. **AI must not override controlled business gates without authorization.**

## 7. Main User Experience

Four primary views.

### 7.1 Process Library

Top-level menu **Processes**. Display process categories:

| Category | Processes |
|---|---|
| Sales | New Lead → Order · Lead Follow-Up · Factory Visit · Lost Lead · Technical Query |
| Factory | Order → Production · Daily Production · Quality Failure · Machine Breakdown · Raw Material Shortage |
| Delivery | Delivery Planning · Delivery Delay · Customer Postponement · Damage / Shortage |
| Finance | Advance Verification · Outstanding Collection · Expense Approval |
| Projects | New Project Setup · Daily Progress · Milestone Approval · Customer Handover |
| Safety | Accident · Near Miss · Unsafe Condition · Machine Maintenance |

Each process card shows: name, category, current version, owner function, number of stages, status.

### 7.2 Process Map

Opening a process displays an easy-to-understand visual flow (e.g. Lead → Qualification → Quote → Advance → Factory Handover → Production → Delivery).

Stages display: stage number, stage name, owner, status, decision/gate if applicable.

Statuses: `completed`, `current`, `upcoming`, `blocked`, `failed`, `skipped`, `cancelled`.

The map should be visually simple enough for non-technical factory staff. Avoid complex BPMN-style notation unless used internally.

### 7.3 My Work

The most important operational view. Every user sees only actionable work assigned to them.

```
Factory Handover — SO1042
Customer: Kumar · Product: 8-inch Earth Interlock · Quantity: 18,500 · Requested Delivery: 14 Sep

Complete now
☐ Check available stock
☐ Calculate production requirement
☐ Confirm raw-material availability
☐ Confirm production capacity
☐ Review current curing stock
☐ Confirm achievable delivery date

[Accept Handover]  [Raise Exception]
```

Users should not need to understand the full process engine to execute their work.

### 7.4 Current Case / Journey View

From customer, order, project or delivery screens, users see the active process:

```
✓ New Lead  ✓ Qualified  ✓ Plan Received  ✓ Quote  ✓ Advance
● Factory Handover
○ Production  ○ Quality Release  ○ Dispatch  ○ Delivered  ○ Aftercare
```

Embedded directly into relevant existing entity screens wherever practical.

## 8. Process Definition Model

Processes must be structured data. Create a reusable process definition engine. Minimum structure:

```yaml
process_id: SALES_TO_DELIVERY
name: Lead to Delivery
category: SALES
version: 1.0

stages:
  - id: NEW_LEAD
    name: New Lead
    owner_role: SALES_ENGINEER
    trigger:
      event: NEW_WHATSAPP_LEAD
    checklist:
      - CREATE_OR_MATCH_LEAD
      - ACKNOWLEDGE_CUSTOMER
      - CAPTURE_NAME
      - CAPTURE_LOCATION
      - CAPTURE_PROJECT_STAGE
      - CREATE_NEXT_ACTION
    sla:
      minutes: 15
    exit_gate:
      required:
        - CRM_LEAD_EXISTS
        - FIRST_RESPONSE_RECORDED
    transitions:
      - to: QUALIFICATION
```

Exact serialization format should follow the existing project conventions.

## 9. Core Process Components

Every stage should support:

- **Trigger** — what starts the stage (new lead, payment received, order confirmed, delivery failed, machine breakdown, customer complaint).
- **Owner** — which role owns the stage.
- **Checklist** — what tasks must be completed.
- **Exit Gate** — what must be true before the process can continue.
- **Evidence** — what may or must be attached (quotation, payment reference, photo, drawing, customer confirmation, lab report, delivery acknowledgment).
- **SLA** — how quickly the stage should be completed.
- **Escalation** — what happens if overdue or blocked.
- **Automation** — what the system does automatically.
- **Transition** — where the process can go next.

## 10. Database Model

Adapt naming to existing database conventions. Minimum entities:

| Entity | Purpose | Key fields |
|---|---|---|
| `process_definition` | Logical process identity | id, process_key, name, category, description, status, active_version_id, created_at, updated_at |
| `process_version` | Versioned definition (`DRAFT` / `ACTIVE` / `RETIRED`). Running cases keep the version they started with unless explicitly migrated. | id, process_definition_id, version, status, published_at, effective_from, effective_to, created_by, created_at |
| `process_stage` | Stage of a version. `stage_type`: `ACTION`, `DECISION`, `HANDOVER`, `WAIT`, `AUTOMATION`, `END` | id, process_version_id, stage_key, name, description, stage_type, sequence, owner_role, sla_minutes, configuration JSON |
| `process_transition` | Directed edge between stages | id, from_stage_id, to_stage_id, transition_key, condition, priority, configuration |
| `process_checklist_item` | Checklist item on a stage | id, stage_id, item_key, title, description, required, sequence, evidence_required, configuration |
| `process_gate` | Exit gate (e.g. advance_verified, stock_checked, quote_exists, QC_released) | id, stage_id, gate_key, gate_type, condition, failure_message, configuration |
| `process_automation` | `SEND_NOTIFICATION`, `CREATE_TASK`, `CREATE_ODOO_ACTIVITY`, `CALL_N8N_WEBHOOK`, `ASSIGN_USER`, `CREATE_HANDOVER`, `UPDATE_STATUS` | id, stage_id, event, action_type, configuration, enabled |
| `process_instance` | One live case (e.g. Lead #234 through Lead-to-Delivery) | id, process_definition_id, process_version_id, entity_type, entity_id, status, current_stage_id, started_at, completed_at, cancelled_at, created_by |
| `process_stage_instance` | One stage occurrence within a case | id, process_instance_id, process_stage_id, status, assigned_role, assigned_user_id, started_at, due_at, completed_at, completed_by, blocked_reason |
| `process_task` | Checklist task occurrence | id, stage_instance_id, checklist_item_id, title, status, assigned_user, required, completed_at, completed_by, metadata |
| `process_evidence` | Attached evidence | id, process_instance_id, stage_instance_id, task_id, evidence_type, source_type, source_id, url/path, metadata, added_by, added_at |
| `process_handover` | First-class handover (`PENDING` / `ACCEPTED` / `REJECTED` / `CANCELLED`) | id, process_instance_id, stage_instance_id, from_role, from_user, to_role, to_user, status, requested_at, accepted_at, rejected_at, rejection_reason, payload JSON, created_at |
| `process_event` | Immutable audit stream (`PROCESS_STARTED`, `STAGE_STARTED`, `TASK_COMPLETED`, `GATE_FAILED`, `HANDOVER_SENT`, `HANDOVER_ACCEPTED`, `SLA_BREACHED`, `PROCESS_COMPLETED`, …) | id, process_instance_id, event_type, actor_type, actor_id, payload, created_at |

## 11. Formal Handover Model

A handover must not be considered complete because one employee sent a WhatsApp message.

Sales → Factory handover includes: customer, order, SKU/product, confirmed quantity, payment status, requested delivery date, site location, contact person, architect/builder if relevant, plans/attachments, special requirements, commitments already made, notes.

Sales initiates the handover. Factory must **Accept** or **Reject / Raise Exception**. Example rejection:

```
Reason:        INSUFFICIENT_CURING_STOCK
Proposed date: 17 Sep
Comment:       "Current 8-inch available + curing stock cannot support 14 Sep quantity."
```

This returns actionable information to sales.

## 12. Reference Process: New WhatsApp Lead → Delivery

Implement this completely in V0.1.

| # | Stage | Owner | Actions | Exit |
|---|---|---|---|---|
| 1 | New Lead | Sales Engineer | Trigger: new WhatsApp message from unknown/new prospect. Create or match CRM lead, acknowledge prospect, capture basic contact details, identify lead source, create next action. SLA configurable from process configuration. | CRM lead exists and first response recorded |
| 2 | Qualification | Sales | Location, project stage, project type, built-up area, plan availability, wall type, key concern, architect/engineer/builder, expected construction timeline. | Lead is `QUALIFIED`, `NURTURE`, or `DISQUALIFIED` (disqualification requires reason) |
| 3 | Plan / Technical Fit | Sales | Request drawing, identify wall requirements, select candidate product, flag structural/technical review if required, estimate quantity basis. | Suitable product/application basis established |
| 4 | Quotation | Sales | Create quotation in Odoo; confirm product, quantity, price, tax, transport, exclusions, validity, payment terms. | Valid quotation linked to lead |
| 5 | Follow-Up | Sales | Technical clarification, factory visit, quotation follow-up, architect discussion, commercial negotiation. System identifies stale qualified leads. | — |
| 6 | Customer Acceptance | Sales | — | Customer confirms intention to proceed. **Must not automatically imply factory commitment.** |
| 7 | Advance Verification | Finance / authorized role | Gate: advance/payment verified from authoritative system. Sales cannot bypass without explicit override permission. | `ADVANCE_VERIFIED = TRUE` |
| 8 | Factory Handover | Factory Manager | Owner changes Sales → Factory. Factory receives complete package; checks product, quantity, finished stock, reserved stock, curing stock, production requirement, raw material, capacity, requested delivery date. Factory ACCEPTS or RETURNS WITH EXCEPTION. | Factory accepts feasible plan |
| 9 | Production / Allocation | Factory | Determine available stock + curing stock + required production against order requirement. Create or link production plan. | — |
| 10 | Quality Release | Factory | Only QC-released stock may proceed as available delivery stock. | — |
| 11 | Delivery Planning | Factory | Confirm quantity, customer/site, vehicle, route, delivery date, site contact, unloading arrangement, payment/commercial release, stock release. | — |
| 12 | Dispatch | Factory | Record loaded quantity, vehicle, driver, dispatch time, documentation, loading damage if any. | — |
| 13 | Delivered | Factory / Driver | Capture actual delivered quantity, time, shortage, damage, customer acknowledgment. | — |
| 14 | Post-Delivery | Sales | Customer confirmation, issue follow-up, next batch/order, installation guidance, testimonial/project photo later. | — |

## 13. Workflow Engine Requirements

The backend must support: process creation, starting instances, stage transitions, required checklist validation, gate evaluation, assignment, completion, rejection, handover, SLA calculation, escalation, event recording, cancellation, process completion.

**Stage transition must happen transactionally. A gate failure must leave the case in a valid state.**

## 14. Role-Based Work Queues

Each role must have a work queue, e.g.

- **Rajesh** — 3 factory handovers awaiting acceptance · 1 production plan blocked · 2 deliveries due tomorrow · 1 quality exception
- **Srinivasan** — 5 new leads · 4 qualified leads requiring quote · 3 quotes stale > configured SLA · 2 handovers returned by factory

Users should manage operations from this queue.

## 15. Notifications

Reuse existing Maiyuri notification infrastructure. Events should be capable of creating notifications: handover assigned, handover rejected, SLA approaching, SLA breached, task assigned, exception raised, approval required, process completed.

Channels (per existing infrastructure/configuration): in-app, push, Telegram, WhatsApp, email. **Do not tightly couple process engine logic to one communication provider.**

## 16. AI / Intelligence Integration

Process definitions must be available to the Maiyuri Intelligence Layer. Expose controlled tools:

`get_process_definition` · `get_active_process` · `get_current_process_stage` · `get_user_process_tasks` · `get_process_blockers` · `get_process_handover` · `explain_next_action` · `get_process_history` · `get_process_sla_risks`

Example — user asks "What should I do with Kumar's order?" AI retrieves customer/order, active process, current stage, outstanding tasks, applicable Odoo facts, and answers:

> "Kumar's order is at Factory Handover. Advance has been verified. You need to verify available 8-inch stock, calculate the production gap and confirm whether the requested delivery date is feasible."

**AI must not invent the workflow from general knowledge. Use the actual active process definition.**

## 17. AI Coaching Mode

Allow the user to ask "Why do I have to do this?" The AI may explain the process rationale using the Maiyuri knowledge base, e.g.:

> "Stock verification is required before accepting the delivery date because a confirmed sales order is not the same as quality-released finished stock."

This connects Process OS + Maiyuri Intelligence Layer + SOP/Knowledge Wiki.

## 18. SOP Integration

SOP explains **how** work should be done. Process defines **when** work occurs, **who** owns it, and **how it moves**.

A process stage should be able to reference: SOP, knowledge article, training module, video, technical specification. E.g. stage `QUALITY_RELEASE` → `SOP-FACTORY-QC-001`. The user taps **"How do I do this?"** and sees the relevant SOP or AI explanation.

## 19. Process Builder / Administration

V0.1 does not require a drag-and-drop BPMN editor, but definitions must be data-driven. Initially support: structured admin form, YAML/JSON import, or controlled internal configuration.

Long-term: create stage, reorder stages, define owner, add checklist, define exit gates, set SLA, add automation, publish new version. Do not block V0.1 on sophisticated visual authoring.

## 20. Versioning

Process definitions must be versioned (e.g. Lead-to-Delivery v1.0 active from 1 Sep; v1.1 active from 1 Oct). Cases started under v1.0 remain on v1.0 unless explicitly migrated. **Do not mutate process history retroactively.**

## 21. Process Analytics

Capture enough structured information to later calculate: average stage duration, total cycle time, SLA compliance, process bottlenecks, handover rejection rate, most common blockers, task completion delay, process abandonment, rework loops.

Examples: "Average lead → quote: 2.3 days." "Factory handover acceptance median: 47 minutes." "18% of handovers are returned because delivery date is infeasible." This feeds the Intelligence Layer.

## 22. Process Exceptions

Processes must support exceptions — not one massive "happy path only." Examples: customer postpones, payment pending, technical approval required, insufficient stock, production failure, QC hold, delivery vehicle failure, customer unreachable.

Exception path should either branch, block, return to previous role, require escalation, or terminate the case. **Every exception needs a structured reason.**

## 23. Permissions

Enforce server-side.

- Sales **can** complete sales tasks and create handovers. Sales **cannot** mark payment verified unless authorized, nor bypass factory acceptance.
- Factory **can** accept/reject factory handover and complete production/delivery stages. Factory **cannot** alter customer commercial terms without permission.
- Managing Partner has controlled override. **Every override must create an audit event.**

## 24. Mobile UX

Heavily used by factory staff; mobile UX must be first-class. At narrow widths avoid a huge horizontal diagram as the main execution interface. Use: Previous ✓ / Current ● / Next ○ and a vertical checklist. Full process map may remain horizontally scrollable or switch to a vertical journey. Primary task buttons must be easy to tap.

## 25. Visual Design

Follow the existing Maiyuri design system. Process maps: clean, calm, highly readable, minimal colors, strong state distinction, simple language.

Visual state language: `✓` completed · `●` current · `!` blocked · `○` upcoming. No engineering-flowchart notation for normal staff.

## 26. Search

Search ("lead", "advance", "breakdown", "complaint") returns processes, SOPs, and active cases where permitted.

## 27. Process Templates Planned After V0.1

Design the engine to support (do **not** implement all in V0.1):

- **Sales:** New Lead → Order, Factory Visit, Lost Lead, Lead Re-Engagement
- **Factory:** Daily Production, Quality Failure, Machine Breakdown, Material Shortage
- **Delivery:** Standard Delivery, Delivery Delay, Customer Postponement, Shortage / Damage
- **Finance:** Advance Verification, Expense Approval, Outstanding Collection
- **Projects:** Project Kickoff, Daily Progress, Milestone Review
- **Safety:** Accident, Near Miss, Unsafe Condition

Implement architecture + reference process properly.

## 28. Auditability

Every meaningful action must be traceable: who, what, when, previous state, new state, evidence, reason. Process history viewable in a timeline:

```
09:04        New WhatsApp lead
09:07        Lead created by Srinivasan
09:11        First response
11 Sep       Quote created
13 Sep       Advance verified
13 Sep 14:21 Handover sent to Rajesh
13 Sep 14:43 Handover accepted
```

## 29. Integration With Odoo

Odoo remains source of transactional truth. Do not duplicate authoritative business states where avoidable.

| Object | Link |
|---|---|
| Lead | Odoo lead |
| Quotation | Odoo quotation |
| Order | Odoo order |
| Payment | verify from configured finance/Odoo source |
| Stock | read from authoritative inventory service |
| Production | link process stage to real production plan |
| Delivery | Odoo picking/delivery |

The process engine coordinates business activity; it does not replace the ERP.

## 30. n8n Integration

Use n8n for orchestration where appropriate (e.g. `FACTORY_HANDOVER_CREATED` → n8n → send Rajesh notification). However, **core gate logic must live in the application/process engine.** Do not make critical workflow correctness dependent on hidden n8n business rules.

## 31. API Requirements

Adapt endpoints to existing conventions.

| Group | Capabilities |
|---|---|
| Definitions | GET process definitions · GET process definition/version |
| Instances | POST start process · GET process instance · POST transition · POST complete task · POST raise blocker · POST cancel process |
| Handovers | POST create handover · POST accept handover · POST reject handover |
| Work | GET my tasks · GET my handovers · GET overdue work |
| Administration | Create/edit draft definition · Publish process version · Retire version |
| Audit | GET process history |

## 32. Domain Events

Where existing infrastructure supports domain events, emit:

`process.started` · `process.stage_started` · `process.task_completed` · `process.gate_failed` · `process.stage_completed` · `process.handover_requested` · `process.handover_accepted` · `process.handover_rejected` · `process.sla_warning` · `process.sla_breached` · `process.completed`

This keeps notification, analytics and AI integrations decoupled.

## 33. Testing

**Definition validation:** duplicate stage keys, missing transition targets, unreachable stages, no start stage, invalid owner role, circular transitions where prohibited, missing exit gate references.

**Runtime:** start process, complete task, gate enforcement, transition, handover acceptance, rejection, exception flow, cancellation, concurrency.

**Security:** unauthorized role cannot complete stage, unauthorized user cannot verify payment, unauthorized override rejected.

**Versioning:** old cases stay on old versions, new cases start current version.

**Audit:** every transition creates event.

**Odoo:** missing Odoo object handled, stale data handled, stock/payment gates fail safely.

**Notification:** correct recipients, no duplicates where idempotency expected.

## 34. Golden End-to-End Tests

- **Scenario A** — New lead → qualified → quoted → advance received → factory accepts → stock sufficient → delivery → complete.
- **Scenario B** — Advance verified → factory handover → stock insufficient → factory rejects requested date → sales receives exception → customer approves new date → factory accepts.
- **Scenario C** — Customer never pays advance. Process must not reach factory handover.
- **Scenario D** — Sales attempts to bypass payment gate. Server rejects.
- **Scenario E** — Quality release fails. Delivery cannot proceed.

## 35. Data Migration

Do not create fake process history for historical business records by default. For existing open orders/leads, support optional controlled initialization ("Start process at current known stage"). Mark `imported_existing_case = true` and record source/initialization timestamp.

## 36. Rollout

| Phase | Scope |
|---|---|
| 1 | Engine + database + one Lead-to-Delivery process |
| 2 | My Work + notifications + handovers |
| 3 | AI integration |
| 4 | Factory processes |
| 5 | Delivery/quality/safety/project processes |

## 37. V0.1 Acceptance Criteria

V0.1 is complete when:

1. Processes are stored as versioned structured definitions.
2. A visual Process Map renders from the definition.
3. Users have a My Work queue.
4. Lead-to-Delivery is fully implemented.
5. Advance verification acts as a real gate.
6. Factory handover is a formal accept/reject workflow.
7. Checklist completion is enforced.
8. Odoo facts can be used by gates.
9. Roles and permissions are enforced server-side.
10. Process history is auditable.
11. Notifications are triggered from workflow events.
12. Active process is visible from relevant customer/order UI.
13. AI can retrieve current stage and explain next action.
14. Old process instances remain tied to their process version.
15. The implementation works cleanly on mobile and web.
16. Existing app behavior is preserved.

## 38. Non-Goals for V0.1

Do not build: a full BPMN suite; Camunda/Temporal unless clearly required by the existing architecture; a separate workflow microservice without justification; a new notification system; a new authentication system; a new mobile application; Neo4j; a complex process designer; autonomous AI process modification.

Keep V0.1 small but architecturally correct.

## 39. Development Instructions for Claude Code

Before coding:

1. inspect the whole existing repository
2. identify existing architecture and reusable services
3. inspect current database/migrations
4. inspect current Odoo integration
5. inspect roles/auth
6. inspect notifications
7. inspect the intelligence-layer integration
8. inspect existing lead/order/project models
9. document the integration plan
10. identify migration risks

Then implement in milestones. Do not rewrite existing modules merely to fit this PRD. Prefer extending established patterns. Keep schema changes additive wherever practical. All migrations must be reversible or have an explicit safe rollback strategy. Do not modify production/main data during development. Run existing tests after every milestone.

## 40. Desired End State

Maiyuri should move from "Ask Rajesh what happens next" or "Check the WhatsApp message where Srinivasan explained it" to:

**Open Maiyuri → My Work → See exactly what must happen now.**

The Process OS becomes the canonical execution layer of Maiyuri Bricks:

- **Odoo** stores transactional truth.
- **The Knowledge Layer** explains company doctrine and SOPs.
- **The Process OS** determines who does what, when, under what conditions, and what happens next.
- **The Intelligence Layer** understands all three and helps people execute them correctly.
