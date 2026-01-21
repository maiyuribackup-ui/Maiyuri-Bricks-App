````md
# Smart Quote v2 — Strict Feedback + AI Infusion Spec (for Claude Code)

## Page: /sq/[slug] (Customer-facing Smart Quote)

> Goal: Convert leads using a Steve Jobs–style guided presentation (emotion → belief → proof → clarity → action), personalized from transcript AI outputs.

---

## 0) Current Status (Strict Verdict)

### What’s on the page now (critical)

- Hero is a **plain gradient** with generic copy: “Build sustainably. Affordably. Beautifully.” (kills premium positioning).
- The word **“Affordably”** pushes a bargain mindset and increases price negotiation.
- No visible Chennai/Tamil architecture belief-breaker.
- No “Made for you” personalization.
- No proof teaser (images/projects).
- Objection handling is generic.
- Doesn’t feel like a Smart Quote; feels like a generic landing page.

### Non-negotiable change

This must become a **presentation-like experience** with:

- **Full-bleed hero image**
- **Short headline**
- **Personalized insights**
- **Chennai logic**
- **Proof**
- **Smart range**
- **Top objections**
- **Single CTA routed by AI**

---

## 1) Required UX Structure (Section Order)

Render sections in this exact order:

1. `hero`
2. `made_for_you`
3. `why_chennai_works`
4. `proof_teaser`
5. `smart_range`
6. `objection_handling`
7. `final_cta`

No extra sections. No “explore practices” links. No early “cost breakdown” pushing.

---

## 2) Copy Requirements (Replace Entire Hero Copy)

### Hero Copy (EN)

**H1:**  
“You’ve admired homes inspired by traditional Tamil architecture. Now you can build one in Chennai.”

**Sub:**  
“Not a heritage village. Not a resort. A real eco-friendly home designed for Chennai heat and city living.”

**Trust chips:**

- “2–3 minutes”
- “No spam”
- “No pressure”

**CTA button:**  
“See how this works for your plot”

### Hero Copy (TA) — simple Chennai Tamil

**H1:**  
“தமிழர் பாரம்பரிய வீட்டு வடிவத்தைப் போல்… இப்போது சென்னையிலும் உங்கள் வீடு.”

**Sub:**  
“பாரம்பரிய கிராமம் இல்லை. ரிசார்ட் இல்லை. சென்னையின் வெப்பம்-ஈரப்பதத்திற்கு பொருந்தும் நிஜமான இயற்கை வீடு.”

**Trust chips:**

- “2–3 நிமிடம்”
- “ஸ்பாம் இல்லை”
- “அழுத்தம் இல்லை”

**CTA:**  
“உங்கள் ப்ளாட்டுக்கு எப்படி வேலை செய்கிறது பார்க்கலாம்”

### Remove completely

- “Affordable / Affordably”
- “Sustainable doesn’t have to mean expensive”
- Any hard savings claims like “30% cheaper” unless backed by proof.

---

## 3) Design Requirements (Steve Jobs Style)

### Visual Rules

- Hero must use **full-bleed high-quality image** (admin uploaded).
- Overlay gradient for readability.
- Minimal words per section; 1 idea per screen.
- Premium whitespace (not empty space).

### Theme Tokens (implement in Tailwind theme or CSS vars)

```json
{
  "theme": {
    "colors": {
      "bg": "#FBF7F2",
      "surface": "#FFFFFF",
      "ink": "#161616",
      "muted": "#5B5B5B",
      "line": "#E8DED2",
      "accent": "#C46A2B",
      "accent2": "#8B4A22",
      "success": "#1E7F4D",
      "heroOverlayTop": "rgba(0,0,0,0.70)",
      "heroOverlayBottom": "rgba(0,0,0,0.35)"
    },
    "radius": {
      "card": 20,
      "button": 14,
      "chip": 999
    },
    "shadow": {
      "card": "0 10px 30px rgba(0,0,0,0.08)"
    },
    "typography": {
      "font_en": "Inter, system-ui, -apple-system, Segoe UI, Roboto",
      "font_ta": "\"Noto Sans Tamil\", Inter, system-ui, -apple-system, Segoe UI, Roboto",
      "scale": {
        "h1_desktop": 44,
        "h1_mobile": 34,
        "h2_desktop": 32,
        "h2_mobile": 26,
        "h3": 22,
        "body": 16,
        "small": 13,
        "micro": 12
      },
      "lineHeight": {
        "h1": 1.05,
        "h2": 1.15,
        "body": 1.6
      },
      "weight": {
        "h1": 700,
        "h2": 650,
        "h3": 600
      }
    },
    "layout": {
      "maxWidth": 1040,
      "sectionPaddingDesktop": 80,
      "sectionPaddingMobile": 48,
      "cardPaddingDesktop": 24,
      "cardPaddingMobile": 18,
      "minTap": 44
    },
    "motion": {
      "fadeUp": { "y": 8, "durationMs": 250 },
      "buttonHoverLiftPx": 1
    }
  }
}
```
````

---

## 4) AI Infusion — Required SmartQuotePayload (Must Add)

### Why

Current AI output is CRM-ish (score, factors). It cannot render personalization, objections, routing, or bilingual copy.

### You must generate a new object: `smartQuotePayload`

Store it with each smart quote record and return it from the `/sq/[slug]` API.

#### Required JSON Schema (Exact)

```json
{
  "smartQuotePayload": {
    "language_default": "en",
    "persona": "homeowner",
    "stage": "hot",
    "primary_angle": "health",
    "secondary_angle": "cooling",
    "top_objections": [
      { "type": "price", "severity": "high" },
      { "type": "water", "severity": "medium" }
    ],
    "route_decision": "cost_estimate",
    "personalization_snippets": {
      "en": {
        "p1": "From your call, it’s clear you want an eco-friendly home that feels cooler and healthier inside.",
        "p2": "Your main concern is budget, so we’ll show a smart range and what changes the number."
      },
      "ta": {
        "p1": "உங்கள் அழைப்பில் இருந்து தெரிகிறது—சென்னையின் வெப்பத்தில் குளிர்ச்சியாகவும் ஆரோக்கியமாகவும் இருக்கும் இயற்கை வீடு தான் உங்கள் முன்னுரிமை.",
        "p2": "உங்கள் முக்கிய கவலை பட்ஜெட் என்பதால், குழப்பம் இல்லாமல் ‘ஸ்மார்ட் ரேஞ்ச்’ மற்றும் எது செலவை மாற்றுகிறது என்பதைக் காண்பிக்கிறோம்."
      }
    },
    "competitor_context": {
      "mentioned": false,
      "tone": "none"
    }
  }
}
```

### Mapping rules from current AI output (minimum)

- If `factors` includes “Budget concerns” → add objection `{type:"price", severity:"high"}`
- If `nextAction` mentions pricing → `route_decision="cost_estimate"`
- If `suggestions` includes “Schedule factory visit” and no pricing nextAction → `route_decision="site_visit"`
- If competitor mentioned → `competitor_context.mentioned=true`

---

## 5) AI Prompts (Implement as separate step)

### Prompt A — Build SmartQuotePayload from existing analysis + transcript (STRICT JSON)

```json
{
  "prompt_id": "smart_quote_payload_v1",
  "system": "You are an expert conversion strategist for Maiyuri Bricks Smart Quote. Transform the input into SmartQuotePayload. Return ONLY valid JSON. No extra keys. Never hallucinate.",
  "user_template": "Input JSON:\n<<<LEAD_AI_JSON>>>\n\nReturn SmartQuotePayload schema exactly:\n{\n  \"language_default\":\"en|ta\",\n  \"persona\":\"homeowner|builder|architect|unknown\",\n  \"stage\":\"cold|warm|hot\",\n  \"primary_angle\":\"health|cooling|cost|sustainability|design\",\n  \"secondary_angle\":\"health|cooling|cost|sustainability|design\",\n  \"top_objections\":[{\"type\":\"price|strength|water|approval|maintenance|resale|contractor_acceptance\",\"severity\":\"low|medium|high\"}],\n  \"route_decision\":\"site_visit|technical_call|cost_estimate|nurture\",\n  \"personalization_snippets\":{\n    \"en\":{\"p1\":\"...\",\"p2\":\"...\"},\n    \"ta\":{\"p1\":\"...\",\"p2\":\"...\"}\n  },\n  \"competitor_context\":{\"mentioned\":true|false,\"tone\":\"curious|comparing|doubtful|none\"}\n}\n\nRules:\n- Use factors/suggestions to infer objections and routing.\n- If nextAction mentions pricing -> cost_estimate.\n- Keep p1/p2 short, calm, premium.\n- Tamil must be simple Chennai Tamil.\nReturn JSON only."
}
```

---

## 6) AI-Driven Page Configuration (Blocks + Section Render)

### Add `pageConfig` returned by API (used by UI renderer)

```json
{
  "pageConfig": {
    "sections": [
      { "key": "hero", "enabled": true },
      { "key": "made_for_you", "enabled": true },
      { "key": "why_chennai_works", "enabled": true },
      { "key": "proof_teaser", "enabled": true },
      { "key": "smart_range", "enabled": true },
      { "key": "objection_handling", "enabled": true, "maxObjections": 2 },
      { "key": "final_cta", "enabled": true }
    ]
  }
}
```

---

## 7) Section Content Requirements (What UI Must Show)

### `hero`

Inputs needed:

```json
{
  "hero": {
    "image_url": "heroImageUrl",
    "headline_key": "hero.h1",
    "subhead_key": "hero.sub",
    "trust_chips_keys": ["hero.chip1", "hero.chip2", "hero.chip3"],
    "cta_key": "hero.cta"
  }
}
```

### `made_for_you`

Use smartQuotePayload.personalization_snippets.

```json
{
  "made_for_you": {
    "title_key": "made.title",
    "bullets_from": "smartQuotePayload.personalization_snippets",
    "max_bullets": 2
  }
}
```

### `why_chennai_works`

Use 3 icon cards (fixed structure).

```json
{
  "why_chennai_works": {
    "headline_key": "chennai.h2",
    "cards": [
      {
        "icon": "thermometer",
        "title_key": "chennai.c1.t",
        "body_key": "chennai.c1.b"
      },
      {
        "icon": "wind",
        "title_key": "chennai.c2.t",
        "body_key": "chennai.c2.b"
      },
      {
        "icon": "shield",
        "title_key": "chennai.c3.t",
        "body_key": "chennai.c3.b"
      }
    ],
    "controlled_mystery_key": "chennai.mystery"
  }
}
```

### `proof_teaser`

Images are admin-uploaded; show 2–3.

```json
{
  "proof_teaser": {
    "images": "proofImageUrls[]",
    "caption_key": "proof.caption"
  }
}
```

### `smart_range`

Use ₹X–₹Y placeholder for now; later replace with computed.

```json
{
  "smart_range": {
    "headline_key": "cost.h2",
    "range_value": "₹X–₹Y",
    "chips_keys": ["cost.chip1", "cost.chip2", "cost.chip3"],
    "link_key": "cost.link"
  }
}
```

### `objection_handling`

Use top_objections max 2; accordion.

```json
{
  "objection_handling": {
    "headline_key": "obj.h2",
    "source": "smartQuotePayload.top_objections",
    "max_items": 2,
    "answer_style": "calm_senior_architect_5_to_7_lines",
    "end_line_key": "obj.endline"
  }
}
```

### `final_cta`

Title/CTA changes by route_decision. One button only.

```json
{
  "final_cta": {
    "route": "smartQuotePayload.route_decision",
    "titles": {
      "site_visit": "cta.site.title",
      "technical_call": "cta.tech.title",
      "cost_estimate": "cta.cost.title",
      "nurture": "cta.nurture.title"
    },
    "button_labels": {
      "site_visit": "cta.site.button",
      "technical_call": "cta.tech.button",
      "cost_estimate": "cta.cost.button",
      "nurture": "cta.nurture.button"
    },
    "form_fields": [
      "name",
      "phone",
      "locality_optional",
      "preferred_time_optional"
    ],
    "privacy_key": "cta.privacy"
  }
}
```

---

## 8) Bilingual Copy Map (Keys Required)

### API must return a `copyMap` with EN + TA

```json
{
  "copyMap": {
    "en": {
      "hero.h1": "You’ve admired homes inspired by traditional Tamil architecture. Now you can build one in Chennai.",
      "hero.sub": "Not a heritage village. Not a resort. A real eco-friendly home designed for Chennai heat and city living.",
      "hero.chip1": "2–3 minutes",
      "hero.chip2": "No spam",
      "hero.chip3": "No pressure",
      "hero.cta": "See how this works for your plot",
      "made.title": "Made for you (from your call)",
      "chennai.h2": "Built for Chennai. Inspired by timeless Tamil design.",
      "chennai.c1.t": "Cooler comfort",
      "chennai.c1.b": "Designed to reduce heat stress and improve indoor comfort.",
      "chennai.c2.t": "Breathable air",
      "chennai.c2.b": "Materials and design that support healthier indoor living.",
      "chennai.c3.t": "Built to last",
      "chennai.c3.b": "A long-term durability mindset, not short-term patchwork.",
      "chennai.mystery": "We’ll show the details calmly in a short call.",
      "proof.caption": "Real projects. Real comfort.",
      "cost.h2": "A smarter way to think about cost.",
      "cost.chip1": "Layout",
      "cost.chip2": "Finishes",
      "cost.chip3": "Logistics",
      "cost.link": "See what affects the range →",
      "obj.h2": "Your concerns, answered calmly.",
      "obj.endline": "We can show details in a 10-minute call.",
      "cta.site.title": "Shall we check this on your site?",
      "cta.site.button": "Book a site visit",
      "cta.tech.title": "Want a calm 10-minute walkthrough?",
      "cta.tech.button": "Schedule a call",
      "cta.cost.title": "Want a smart range for your plot?",
      "cta.cost.button": "Get my smart range",
      "cta.nurture.title": "Want only the updates that matter?",
      "cta.nurture.button": "Send me updates",
      "cta.privacy": "We’ll contact you only about your project. No spam."
    },
    "ta": {
      "hero.h1": "தமிழர் பாரம்பரிய வீட்டு வடிவத்தைப் போல்… இப்போது சென்னையிலும் உங்கள் வீடு.",
      "hero.sub": "பாரம்பரிய கிராமம் இல்லை. ரிசார்ட் இல்லை. சென்னையின் வெப்பம்-ஈரப்பதத்திற்கு பொருந்தும் நிஜமான இயற்கை வீடு.",
      "hero.chip1": "2–3 நிமிடம்",
      "hero.chip2": "ஸ்பாம் இல்லை",
      "hero.chip3": "அழுத்தம் இல்லை",
      "hero.cta": "உங்கள் ப்ளாட்டுக்கு எப்படி வேலை செய்கிறது பார்க்கலாம்",
      "made.title": "உங்களுக்காக (அழைப்பின் அடிப்படையில்)",
      "chennai.h2": "சென்னைக்காக வடிவமைப்பு. தமிழர் பாரம்பரிய அறிவால் ஊக்கம்.",
      "chennai.c1.t": "குளிர்ச்சியான சுகம்",
      "chennai.c1.b": "வெப்ப அழுத்தத்தை குறைத்து உள்ளக சுகத்தை மேம்படுத்தும் வடிவம்.",
      "chennai.c2.t": "சுவாசிக்கும் காற்று",
      "chennai.c2.b": "ஆரோக்கியமான உள்ளக வாழ்வுக்கு உதவும் பொருட்கள் மற்றும் வடிவமைப்பு.",
      "chennai.c3.t": "நீண்டகால நிலைத்தன்மை",
      "chennai.c3.b": "தற்காலப் பதச்சுருக்கள் இல்லை — நீண்டகால வாழ்வுக்கான அணுகுமுறை.",
      "chennai.mystery": "10 நிமிட அழைப்பில் இதன் விவரங்களை அமைதியாக விளக்குகிறோம்.",
      "proof.caption": "உண்மை வேலைகள். உண்மை சுகம்.",
      "cost.h2": "செலவை புத்திசாலித்தனமாக பார்க்கலாம்.",
      "cost.chip1": "லேஅவுட்",
      "cost.chip2": "ஃபினிஷ்",
      "cost.chip3": "லாஜிஸ்டிக்ஸ்",
      "cost.link": "ரேஞ்ச் எதனால் மாறுகிறது →",
      "obj.h2": "உங்கள் சந்தேகங்களுக்கு தெளிவான பதில்.",
      "obj.endline": "10 நிமிட அழைப்பில் விவரங்களை காட்டுகிறோம்.",
      "cta.site.title": "உங்கள் சைட்டில் பார்த்து உறுதி செய்யலாமா?",
      "cta.site.button": "சைட் விஸிட் பதிவு",
      "cta.tech.title": "10 நிமிடத்தில் அமைதியாக விளக்கலாமா?",
      "cta.tech.button": "அழைப்பு நேரம் அமைக்கவும்",
      "cta.cost.title": "உங்கள் ப்ளாட்டுக்கு ஒரு ஸ்மார்ட் ரேஞ்ச் வேண்டுமா?",
      "cta.cost.button": "என் ஸ்மார்ட் ரேஞ்ச்",
      "cta.nurture.title": "தேவையான அப்டேட்கள் மட்டும் வேண்டுமா?",
      "cta.nurture.button": "அப்டேட்கள் அனுப்பவும்",
      "cta.privacy": "உங்கள் திட்டத்துக்காக மட்டுமே தொடர்பு கொள்வோம். ஸ்பாம் இல்லை."
    }
  }
}
```

---

## 9) Tracking Events (Must Wire)

Track:

- `view`
- `section_view` (IntersectionObserver at 40% visibility)
- `lang_toggle`
- `cta_click`

Event payload format:

```json
{
  "event": {
    "smart_quote_id": "uuid",
    "type": "section_view",
    "section_key": "hero",
    "timestamp": "ISO",
    "meta": { "lang": "en" }
  }
}
```

---

## 10) Acceptance Checklist (Ship Only When True)

- [ ] Hero uses a real image (not plain gradient).
- [ ] “Affordable” removed everywhere.
- [ ] Tamil-architecture + Chennai belief-breaker is present.
- [ ] “Made for you” shows 1–2 real personalized bullets from SmartQuotePayload.
- [ ] Proof teaser shows 2–3 real images.
- [ ] Cost shown as range (₹X–₹Y) with “what affects range” chips.
- [ ] Objection handling shows max 2 objections from AI.
- [ ] Exactly ONE CTA button (label changes by route_decision).
- [ ] EN/தமிழ் toggle switches instantly and persists.
- [ ] Tracking events fire correctly.

---

## Final Instruction to Implementer

Do not iterate further on random UI tweaks until:

1. SmartQuotePayload exists and is returned by API.
2. The page renders using the payload (personalization + routing + objections).
3. Hero is image-first and premium.
