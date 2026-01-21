# AI Insights Upgrade – Smart Quote Enablement

## Maiyuri Bricks | Mandatory Changes to AI Output

### Purpose

The current AI insights are **CRM-oriented** (scores, factors, suggestions) but **not usable** for powering a personalized Smart Quote experience.

This document defines the **exact changes required** so AI insights can:

- Drive personalization
- Control narrative flow
- Enable intelligent CTA routing
- Support a Steve-Jobs–style Smart Quote presentation

---

## 1. Core Problem (Current State)

### What the AI produces today

- Generic factors (e.g., “High engagement”, “Budget concerns”)
- Abstract suggestions (e.g., “Follow up with pricing details”)
- CRM-centric outputs (scores, next actions)

### Why this fails

These outputs:

- Cannot personalize copy
- Cannot select which objections to show
- Cannot decide which CTA to route
- Cannot adapt tone or narrative
- Result in a **generic Smart Quote UI**

---

## 2. Target Outcome (Required State)

AI must produce a **SmartQuotePayload** that is:

- Narrative-ready
- Presentation-friendly
- Personalization-first
- Strictly structured (no free text blobs)

This payload will be the **single source of truth** for:

- Copy
- Section selection
- Objection handling
- CTA routing
- Language default

---

## 3. New Mandatory Output: SmartQuotePayload

AI must generate and store this object separately from general lead analysis.

### Required JSON Schema (Exact)

```json
{
  "language_default": "en|ta",
  "persona": "homeowner|builder|architect|unknown",
  "stage": "cold|warm|hot",
  "primary_angle": "health|cooling|cost|sustainability|design",
  "secondary_angle": "health|cooling|cost|sustainability|design",
  "top_objections": [
    {
      "type": "price|strength|water|approval|maintenance|resale|contractor_acceptance",
      "severity": "low|medium|high"
    }
  ],
  "route_decision": "site_visit|technical_call|cost_estimate|nurture",
  "personalization_snippets": {
    "en": {
      "p1": "Short, human sentence based on the call",
      "p2": "Second reinforcing sentence (optional)"
    },
    "ta": {
      "p1": "Natural Chennai Tamil version",
      "p2": "Natural Chennai Tamil version"
    }
  },
  "competitor_context": {
    "mentioned": true,
    "tone": "curious|comparing|doubtful|none"
  }
}
```
