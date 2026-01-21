Below is the **updated PRD v1.0** with your requested changes:

- ✅ **No PDF** (removed completely)
- ✅ **Customer language toggle: English / Tamil**
- ✅ **Admin ability to upload images per page** (per lead or global templates)
- ✅ **Visual UI guidelines** (premium, calm, mobile-first)
- ✅ **Dedicated Design Agent** to generate UI spec + component tokens for Claude to implement

---

# 📘 PRD v1.0 — Smart Quote System (No PDF)

## Maiyuri Bricks — AI-Personalized Smart Quotation (Web Experience)

---

## 1) Objective

Build a **mobile-first Smart Quote web experience** that is **unique per lead** and **personalized from uploaded call transcript** to increase conversion.

### Success Definition

- Higher CTA click rate vs normal quotation flow
- More bookings (site visit / technical call / cost estimate)
- Better follow-up quality (because AI captures objections + motivation)

---

## 2) Core UX Principles

1. **Progressive disclosure** (don’t reveal everything early)
2. **One CTA on screen** (routing happens behind)
3. **Premium calm tone** (no shouting, no hard selling)
4. **Belief → proof → action** (in that order)
5. **Language comfort** (English/Tamil toggle)

---

## 3) User Journeys

### 3.1 Internal User (Sales/Admin)

1. Open Lead Details
2. Upload transcript (already exists in your system)
3. Click **Generate Smart Quote**
4. System generates a **unique link** for that lead
5. Copy link / share via WhatsApp
6. Optionally edit images per page (template-level or lead-level overrides)

### 3.2 Customer (Lead)

1. Opens link
2. Sees Entry page (hero image + emotional framing)
3. Can toggle **English / Tamil**
4. Reads personalized flow (based on transcript)
5. Clicks single CTA
6. Routed to: site visit / technical call / cost estimate / nurture

---

## 4) Product Requirements

### 4.1 Lead Details Page (Internal App)

Add a new section: **Smart Quote**

**Buttons**

- `Generate Smart Quote`
- `Copy Link`
- `Open Smart Quote`
- `Send on WhatsApp` (optional shortcut)

**Rules**

- If transcript missing → button disabled + tooltip: “Upload transcript to personalize”
- If already generated → show existing link + “Regenerate” (admin-only)

**Outputs stored**

- smart_quote_id (UUID)
- generated link
- AI summary fields (persona, stage, angle, objections)

---

## 5) Smart Quote Experience (Customer Web)

### 5.1 Pages (Block-based)

Each page is a **block container**. Blocks are selected by AI strategy.

**Default v1 pages**

1. **Entry Page** (always)
2. **Chennai Climate Logic** (always)
3. **Smart Cost Range** (always)
4. **Objection Handling** (AI picks top 1–2)
5. **Final CTA** (always)

### 5.2 Language Toggle (English / Tamil)

- Toggle visible in top-right: `EN | தமிழ்`
- Default language logic:
  - If transcript language detected Tamil → default Tamil
  - Else default English

- Must be instant toggle, no reload (client-side swap from server-provided strings)

### 5.3 Single CTA (Mandatory)

CTA text changes by route, but UI shows one primary action.

Example:

- “See if this suits your plot”
- “Talk to a specialist”
- “Get a smart cost estimate”

---

## 6) Image Management (Admin Upload per Page)

### 6.1 Requirements

Allow admin to upload **one hero image per page**.

**Image sources**

- Template (default): used for all leads
- Lead override: optional per lead (for VIP leads / custom)

### 6.2 Admin UI (Internal)

On Lead Details → Smart Quote section:

- Page list:
  - Entry Page → [Upload Image] [Preview]
  - Climate Page → [Upload Image] [Preview]
  - Cost Page → [Upload Image] [Preview]
  - Objection Page → [Upload Image] [Preview]
  - CTA Page → [Upload Image] [Preview]

Store:

- image_url_template (global)
- image_url_override (per lead)
- fallback image if none uploaded

### 6.3 Image Rules

- Aspect ratio: **16:9** (desktop), **4:5** safe crop (mobile)
- Resolution: minimum **1600px wide**
- Compression: WebP preferred
- No text on images (copy overlays are in UI)

---

## 7) Data Model

### 7.1 `smart_quotes`

- smart_quote_id (UUID, primary)
- lead_id (FK)
- link_slug (random, unguessable)
- created_at
- language_default (`en`|`ta`)
- persona
- stage
- primary_angle
- secondary_angle
- route_decision
- top_objections (json array)
- risk_flags (json array)
- page_config (json) — which blocks to render

### 7.2 `smart_quote_images`

- id
- smart_quote_id (nullable if template)
- page_key (`entry|climate|cost|objection|cta`)
- scope (`template|lead_override`)
- image_url
- created_at

### 7.3 `smart_quote_events`

- id
- smart_quote_id
- event_type (`view|scroll|section_view|cta_click|lang_toggle`)
- section_key
- payload (json)
- timestamp

---

## 8) AI Pipeline

### 8.1 Pipeline Steps

1. Language detect + transcript normalization
2. Extract lead insights into strict JSON
3. Decide page strategy (blocks + route)
4. Generate bilingual copy (EN + TA)
5. Generate objection response copy (only top 1–2)
6. Return final `page_config` + `copy_map`

### 8.2 Strict JSON Output (Final)

```json
{
  "language_default": "en",
  "persona": "homeowner",
  "stage": "warm",
  "primary_angle": "health",
  "secondary_angle": "cooling",
  "scores": {
    "interest": 0,
    "urgency": 0,
    "price_sensitivity": 0,
    "trust": 0
  },
  "top_objections": [{ "type": "water", "severity": "medium" }],
  "risk_flags": [],
  "route_decision": "technical_call",
  "page_config": {
    "pages": [
      {
        "key": "entry",
        "blocks": [
          "hero_headline",
          "belief_breaker",
          "trust_anchor",
          "cta_teaser"
        ]
      },
      {
        "key": "climate",
        "blocks": [
          "chennai_logic",
          "breathability",
          "controlled_mystery",
          "micro_cta"
        ]
      },
      {
        "key": "cost",
        "blocks": [
          "range_frame",
          "range_value",
          "drivers",
          "soft_compare",
          "micro_cta"
        ]
      },
      {
        "key": "objection",
        "blocks": ["top_objection_answer", "reassurance", "controlled_mystery"]
      },
      {
        "key": "cta",
        "blocks": ["single_cta", "route_explainer", "light_form"]
      }
    ]
  },
  "copy_map": {
    "en": { "entry.hero_headline": "...", "...": "..." },
    "ta": { "entry.hero_headline": "...", "...": "..." }
  }
}
```

---

## 9) Exact AI Prompts (Copy/Paste for Claude)

### Prompt A — Lead Insight Extraction (Strict)

**System**

```
You are an expert sales analyst for eco-friendly home construction in Chennai.
Extract intent, persona, objections, and readiness from the transcript.
Return ONLY valid JSON matching the schema provided. No extra keys. No explanations.
If information is missing, use null and reduce confidence scores. Never hallucinate.
```

**User**

```
SCHEMA (must match exactly):
{
  "language_detected": "en|ta|mixed|unknown",
  "persona": "homeowner|builder|architect|unknown",
  "stage": "cold|warm|hot",
  "scores": {"interest":0,"urgency":0,"price_sensitivity":0,"trust":0},
  "primary_angle": "health|cooling|cost|sustainability|design",
  "secondary_angle": "health|cooling|cost|sustainability|design",
  "top_objections": [{"type":"price|strength|water|approval|maintenance|resale","severity":"low|medium|high"}],
  "risk_flags": ["negative_sentiment","trust_issue","abusive","none"]
}

TRANSCRIPT:
<<<TRANSCRIPT_TEXT>>>

CITY: Chennai
```

---

### Prompt B — Strategy + Routing + Page Blocks

**System**

```
You are a conversion strategist for premium eco-friendly homes.
Decide the Smart Quote narrative and route using progressive disclosure.
One CTA only. Choose blocks per page. Preserve curiosity by withholding deep technical details.
Return ONLY JSON matching the schema.
```

**User**

```
LEAD_INSIGHTS_JSON:
<<<OUTPUT_FROM_PROMPT_A>>>

Output schema:
{
  "language_default": "en|ta",
  "route_decision": "site_visit|technical_call|cost_estimate|nurture",
  "page_blocks": {
    "entry": ["..."],
    "climate": ["..."],
    "cost": ["..."],
    "objection": ["..."],
    "cta": ["..."]
  }
}
```

---

### Prompt C — Copy Generator (Bilingual)

**System**

```
You are a premium brand copywriter for Maiyuri Bricks.
Write calm, confident, conversion-focused microcopy.
Avoid hype, avoid long paragraphs.
Must produce both English and Tamil versions.
No technical dumping. Keep curiosity.
Return ONLY JSON.
```

**User**

```
INPUT:
- Lead persona: <<<PERSONA>>>
- Primary angle: <<<PRIMARY_ANGLE>>>
- Secondary angle: <<<SECONDARY_ANGLE>>>
- Top objection(s): <<<TOP_OBJECTIONS>>>
- Route decision: <<<ROUTE_DECISION>>>

Create copy for these keys:
entry.hero_headline
entry.belief_breaker
entry.trust_anchor
entry.primary_cta

climate.section_headline
climate.core_insight
climate.micro_cta

cost.section_headline
cost.range_frame
cost.range_placeholder (use ₹X–₹Y)
cost.drivers
cost.micro_cta

objection.section_headline
objection.answer (only for top objection)
objection.reassurance

cta.section_headline
cta.primary_cta
cta.route_explainer
cta.form_labels (name, phone, locality)

Return schema:
{
  "en": { "key": "text", "...": "..." },
  "ta": { "key": "text", "...": "..." }
}
```

---

### Prompt D — Objection Answer (Architect Tone)

(Use if you want a stronger, separate objection generator)

**System**

```
You are a calm senior architect.
Answer the objection clearly in 5-7 lines.
No overselling. No jargon. Keep it reassuring.
End with an invitation for a short call to show details.
Return only text in the requested language.
```

**User**

```
Language: <<<en|ta>>>
Objection: <<<TYPE>>>
Context: Chennai eco-friendly home, earth-based interlocking blocks
```

---

## 10) UI Visual Guidelines (Non-Negotiable)

### 10.1 Layout

- Mobile-first, single column
- Max width on desktop: 900–1100px
- Generous spacing (premium feel)

### 10.2 Typography

- Headline: large, calm, 2 lines max
- Body: short lines, avoid dense paragraphs
- Use emphasis sparingly (bold only for key phrases)

### 10.3 Colors

- Earth-inspired palette:
  - clay / sand / warm neutral backgrounds
  - dark text, high contrast

- Avoid neon, avoid pure black backgrounds

### 10.4 Imagery

- Warm natural light, calm
- No construction mess
- No text embedded in images
- Prefer human presence subtly (family / sit-out)

### 10.5 Interaction

- Language toggle pinned top-right
- Sticky CTA button on mobile (optional, subtle)
- Smooth scroll, section progress indicator (optional)

### 10.6 Trust Signals (micro)

- “2–3 minutes”
- “No spam”
- “No pressure”
  Keep these consistent.

---

## 11) Design Agent Requirement (Must Use)

Add a dedicated “Design Agent” inside Claude workflow whose job is to generate UI spec.

### Design Agent Output Requirements

- Design tokens (spacing, typography scale, radii, shadows)
- Component list (Hero, Section, Card, CTA, Toggle, Form)
- Page wireframe (mobile + desktop)
- Accessibility notes (contrast, font size)
- Implementation hints for Next.js + Tailwind (or your stack)

### Design Agent Prompt (Exact)

**System**

```
You are a world-class product designer for premium mobile-first conversion pages.
Your job: produce an implementable UI spec (tokens + components + wireframes) for the Smart Quote flow.
Design must feel premium, calm, eco-friendly, modern Tamil inspiration.
Return structured markdown. No fluff.
```

**User**

```
Create UI spec for Smart Quote pages:
- entry, climate, cost, objection, cta
Include:
1) Design tokens (type scale, spacing, radii, shadows)
2) Component specs (props, states)
3) Wireframe description for mobile and desktop
4) Layout guidance for hero image + text overlay + CTA
5) Language toggle placement and behavior
6) Image slot rules per page
```

---

## 12) Implementation Notes (Claude-ready)

- Generate link: `/sq/{slug}` where slug is unguessable (>= 12 chars random)
- Customer page fetches by slug → returns:
  - images (template + override resolution)
  - page_config
  - copy_map (EN/TA)

- Events tracked via lightweight endpoint
- CTA form submits lead intent + preferred callback time (optional)

---

## 13) Acceptance Criteria

- Lead details page generates unique link per lead ✅
- Smart Quote shows EN/TA toggle and switches instantly ✅
- Admin can upload images per page (template + lead override) ✅
- AI produces strict JSON outputs and renders correct blocks ✅
- Single CTA routes invisibly based on AI decision ✅
- Events recorded (view, section_view, cta_click, lang_toggle) ✅

---

If you want, I can also output a **Claude Code “Master Build Prompt”** that stitches:

- backend schema
- endpoints
- UI components
- AI prompt runners
  into a single instruction for Claude to implement end-to-end in your codebase.
