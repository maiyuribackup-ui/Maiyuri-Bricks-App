# Eco-Vastu Intelligent Floor Plan Generator  
**Product Requirements Document (PRD)**

---

## 1. Product Overview

### 1.1 Product Name
Eco-Vastu Intelligent Floor Plan Generator

### 1.2 Objective
To generate **accurate, buildable, eco-friendly, and Vastu-compliant residential floor plans** from a rough site sketch and guided user inputs using a multi-agent AI architecture.

The system must:
- Avoid silent assumptions
- Ask only relevant clarifying questions
- Produce construction-ready outputs
- Enforce eco-friendly principles by default

---

## 2. Target Users

- Individual homeowners building independent houses
- Eco-conscious builders and contractors
- Small architecture firms
- (Future) Real estate developers

---

## 3. Core Design Principles

1. **Deterministic over creative**
2. **Eco-design is non-negotiable**
3. **Vastu guides but does not override legality**
4. **Every output must be buildable**
5. **Explainability is mandatory**

---

## 4. System Architecture (Hybrid)

### 4.1 Platform Roles

- **Vercel**
  - Frontend (Next.js)
  - User interaction
  - Lightweight agents
  - Orchestration controller

- **Railway**
  - Stateful AI agents
  - Multi-step reasoning
  - Rule engines
  - Long-running workflows

---

## 5. Agent Architecture

### 5.1 Agent List & Responsibilities

| # | Agent Name | Responsibility | Platform |
|--|-----------|---------------|----------|
| 1 | Diagram Interpretation Agent | Extract plot data from sketch | Railway |
| 2 | Regulation & Compliance Agent | Compute legal build envelope | Railway |
| 3 | Client Requirement Elicitation Agent | Ask functional questions | Vercel |
| 4 | Engineer Clarification Agent | Resolve technical assumptions | Railway |
| 5 | Vastu Compliance Agent | Apply vastu zoning rules | Railway |
| 6 | Eco-Design Agent | Enforce sustainability principles | Railway |
| 7 | Architectural Zoning Agent | Public/private spatial logic | Railway |
| 8 | Dimensioning Agent | Assign real room sizes | Railway |
| 9 | Engineering Plan Agent | Structural & service logic | Railway |
|10 | Design Validation Agent | Cross-check all constraints | Railway |
|11 | Narrative Agent | Explain design decisions | Vercel |
|12 | Visualization Prompt Agent | Generate render prompts | Vercel |

---

## 6. Canonical Data Contract

All agents read and write to a shared object:

```json
DesignContext {
  plot,
  regulations,
  requirements,
  engineering_inputs,
  vastu,
  eco,
  zoning,
  dimensions,
  engineering_plan,
  validation,
  outputs
}
7. Functional Requirements
7.1 Input Handling

Accept image or PDF plot sketches

Extract dimensions, orientation, road access

Flag unclear or missing data

7.2 Questioning System

Ask only unresolved questions

Categorize questions as:

Mandatory

Optional

Pause pipeline until answered

7.3 Design Constraints (Mandatory)

Central open-to-sky courtyard (mutram)

Veranda as transition space

Cross ventilation

Minimized west heat exposure

Rainwater harvesting provision

Expansion-ready structure

7.4 Compliance Requirements

Setback adherence

Staircase placement rules

Toilet zoning rules

Structural feasibility

7.5 Outputs

Dimensioned floor plan (JSON + text)

Design rationale

Eco-compliance summary

Vastu compliance summary

Visualization prompts

8. Execution Flow

User uploads sketch (Vercel)

Diagram Interpretation Agent (Railway)

Regulation & Compliance Agent (Railway)

Requirement Elicitation Agent (Vercel)

Engineer Clarification Agent (Railway)

Vastu Compliance Agent (Railway)

Eco-Design Agent (Railway)

Architectural Zoning Agent (Railway)

Dimensioning Agent (Railway)

Engineering Plan Agent (Railway)

Validation Agent (Railway)

Narrative & Visualization Agents (Vercel)

9. Non-Functional Requirements
9.1 Performance

UI responses < 1s

Background agents async

Retry logic for failed agents

9.2 Reliability

Partial state persistence

Resume from last completed agent

9.3 Scalability

Stateless frontend

Horizontally scalable agent services

10. Security Requirements

Auth via Clerk / Auth.js

Signed API calls between Vercel & Railway

No direct client access to Railway agents

11. Acceptance Criteria

 Missing dimensions trigger clarification

 No setback violations allowed

 Courtyard always present

 Eco principles never overridden

 Vastu conflicts explained clearly

 Engineering feasibility validated

 Outputs include reasoning

12. Explicit Out-of-Scope (v1)

AutoCAD / DXF generation

Structural load calculations

BOQ or cost estimation

Contractor marketplace

13. Future Extensions

G+1 / multi-unit layouts

Cost & carbon footprint estimation

CAD exports

Integration with material suppliers

14. Definition of Done

A user can upload a rough sketch and receive:

A buildable, eco-friendly, vastu-aligned plan

Clear explanations

No hidden assumptions

Confidence to proceed to construction