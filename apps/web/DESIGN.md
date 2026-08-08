---
name: Maiyuri Bricks
description: Warm, plain-spoken interfaces for a red-soil brick works — staff tools and customer quotes built on earth tones and hairline structure.
colors:
  red-soil: "#c0562f"
  red-soil-deep: "#a8481f"
  brick-red: "#7a2817"
  brick-red-dark: "#6d2212"
  cream: "#fbf5ea"
  surface: "#ffffff"
  border-warm: "#efe3d2"
  ink: "#4a3428"
  ink-muted: "#7d6653"
  ink-muted-soft: "#9c8676"
  signal-blue: "#3b82f6"
  signal-blue-deep: "#2563eb"
  slate-canvas: "#f8fafc"
  slate-ink: "#0f172a"
  slate-muted: "#64748b"
  slate-border: "#e2e8f0"
  status-good: "#3f7d4d"
  status-warning: "#b3781a"
  status-critical: "#c1453e"
  status-good-wash: "#e4f1e3"
  status-warning-wash: "#f8ecd4"
  status-critical-wash: "#fbe4df"
typography:
  display:
    fontFamily: "ui-serif, Georgia, Cambria, Times New Roman, serif"
    fontSize: "clamp(1.5rem, 4vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(1.625rem, 4vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.1em"
rounded:
  sm: "2px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  card: "16px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.red-soil}"
    textColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "10px 14px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.red-soil-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.status-warning-wash}"
    textColor: "{colors.status-warning}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
---

# Design System: Maiyuri Bricks

## Overview

**Creative North Star: "The Curing Yard"**

Bricks are laid out in rows and left alone until they are strong. Nothing is
rushed, nothing is shouted, and the material does the convincing. The interface
works the same way: warm earth tones, ordered rows, generous rhythm, and no
decoration that has not earned its place.

The system is warm and earthy before it is anything else — clay, soil and
daylight rather than steel and glass. Structure comes from hairline borders and
tonal shifts rather than drop shadows, so surfaces read as laid down rather than
floating. Colour is used sparingly: a single warm accent carries every action,
and the rest of the palette stays quiet enough that a number or a status can be
the loudest thing on screen.

Three surfaces exist and they are not identical. **OneHub** and the **customer
quote** share the warm world described here. The **staff dashboard** still runs
on an older blue-and-slate palette across 21 routes; it is documented below as
the incumbent Operate world, not as an aspiration. New warm-world work should
not be bolted onto a blue dashboard screen, and dashboard screens should not be
half-converted.

Confirmed rejections: generic SaaS (purple gradients, glassmorphism, floating
3D), discount-retailer urgency (red banners, shouty price badges, countdowns),
and cold industrial B2B (grey spec sheets with no warmth).

**Key Characteristics:**
- Warm neutrals (cream and clay) instead of grey
- One accent, used rarely, always meaning "act here"
- Hairline borders carry structure; shadows are reserved for what floats
- Generous vertical rhythm; one idea at a time
- Bilingual English/Tamil throughout customer-facing copy
- Built to be read on a phone in daylight and on a desktop at arm's length

## Colors

A warm earth palette — clay, cream and soil — with a separate cool palette
still in service on the staff dashboard.

### Primary

- **Red Soil** (`#c0562f`): the single interactive accent. Primary buttons,
  the active CTA, links that must be noticed, and the OneHub sidebar's active
  state. Its hover/pressed partner is **Red Soil Deep** (`#a8481f`).
- **Brick Red** (`#7a2817`): the brand voice, not an action. Wordmark,
  section headings, the OneHub sidebar gradient (with `#8a2f1c` at the top and
  `#6d2212` below). Never use it for a button; it reads as identity, not
  invitation.

### Neutral

- **Cream** (`#fbf5ea`): the warm page ground. Everything sits on this.
- **Surface** (`#ffffff`): cards, panels and any raised content block.
- **Warm Border** (`#efe3d2`): the hairline that does the structural work.
- **Ink** (`#4a3428`): primary text — a warm dark brown, never pure black.
- **Ink Muted** (`#7d6653`): secondary text, captions, disclaimers — anything
  set at body size. Clears AA on both Cream (4.97:1) and Surface (5.39:1).
- **Ink Muted Soft** (`#9c8676`): the lighter warm grey, for large text,
  dividers and icons only. It measures 3.18:1 and **must not carry body copy**.

### Secondary — the incumbent dashboard world

Still live across the 21 dashboard routes and its dark mode. Documented so it
is used consistently where it already rules, not extended into new work.

- **Signal Blue** (`#3b82f6`, deep `#2563eb`): dashboard primary action.
- **Slate Canvas** (`#f8fafc`), **Slate Ink** (`#0f172a`), **Slate Muted**
  (`#64748b`), **Slate Border** (`#e2e8f0`): the cool neutral ramp.

### Tertiary — status

Semantic only. These never stand in for the accent.

- **Good** (`#3f7d4d`) on wash `#e4f1e3`: completed, healthy, on track.
- **Warning** (`#b3781a`) on wash `#f8ecd4`: due today, medium priority.
- **Critical** (`#c1453e`) on wash `#fbe4df`: overdue, returned, failed.

### Named Rules

**The One Accent Rule.** Red Soil is the only colour that means "act". If two
things on a screen are Red Soil, one of them is wrong. Status colours report
state and are never borrowed for a button.

**The No Pure Black Rule.** Text is Ink (`#4a3428`) on warm surfaces and Slate
Ink (`#0f172a`) on cool ones. `#000000` appears nowhere.

**The Warm Ground Rule.** Warm-world surfaces sit on Cream, never on white or
grey. White is a card, not a page.

## Typography

**Display Font:** system serif stack (`ui-serif, Georgia, Cambria, Times New
Roman, serif`) — used only for OneHub headings and the wordmark.
**Body Font:** Inter (loaded via `next/font/google`), with a system-ui fallback.
**Label Font:** Inter at small sizes with wide tracking; no separate mono face.

**Character:** A quiet serif for the few places the brand speaks in its own
voice, and Inter everywhere work actually happens. The serif is a signature,
not a habit — it appears on greetings and section titles, never on data.

### Hierarchy

- **Display** (serif, 700, clamp 24–28px, 1.15): OneHub page greetings and the
  wordmark. Warm world only.
- **Headline** (Inter, 700, clamp 26–32px, 1.2, -0.01em): the top of a
  customer quote and major section openers.
- **Title** (Inter, 600, 18px, 1.4): card headings, work-item titles.
- **Body** (Inter, 400, 16px, 1.6): all running text. Keep measures near 65–75
  characters; the quote page caps its reading column at 720px.
- **Label** (Inter, 600, 11px, 0.1em, uppercase): section eyebrows, table
  headers, status chips.

### Named Rules

**The Numbers Are Tabular Rule.** Any column of figures — rates, totals,
quantities, counts — uses tabular numerals so digits line up down the column.

**The Serif Stays Upstairs Rule.** The serif face is for greetings, wordmarks
and section titles. Data, labels, forms and buttons are always Inter.

## Layout

Content sits in centred columns rather than full-bleed: 720px for reading
(customer quote body), 1040px for standard content, 1200px at most. The staff
dashboard runs wider, to 1152px, because tables need it.

Vertical rhythm steps 8 / 12 / 16 / 24 / 40px. Sections breathe at 48–64px on
desktop and compress to 32–40px on mobile; the quote page opens with 56px of
air above the price so nothing crowds the number.

Density differs by mode and this is deliberate. Operate surfaces (dashboard,
My Work, Quotes Inbox) pack rows tightly and expect scanning. The customer
quote is the opposite: one idea per screen, wide margins, nothing competing
with the price.

Phone and desktop are equally first-class. Every interactive control clears a
44px touch target. Horizontal strips (filter chips, video carousels) scroll and
snap on touch and gain arrow affordances only from 640px up. Tables never
force the page to scroll sideways — they scroll inside their own container.

## Elevation & Depth

**Flat by default; borders carry the structure.** A surface at rest has a
hairline border (`#efe3d2` on warm ground, `#e2e8f0` on cool) and no shadow.
Depth is a response, not a decoration.

### Shadow Vocabulary

- **Resting card** (`box-shadow: 0 1px 2px rgba(20,23,26,.05)`): the barest
  separation, dashboard cards only.
- **Hover lift** (`box-shadow: 0 4px 20px rgba(74,55,40,0.08)`): warm and
  diffuse, appears on hover for tappable cards.
- **Floating** (`box-shadow: 0 8px 24px -12px rgba(20,23,26,.14)`): modals,
  toasts, sticky action bars — things genuinely above the page.

### Named Rules

**The Flat-At-Rest Rule.** If a surface is not being hovered, focused, or
floating above the page, it has no shadow. A grid of resting cards shows a grid
of hairlines, not a field of drop shadows.

## Shapes

Corners are softly rounded, never sharp and never pill-shaped except where a
shape signals a token. Cards and panels use 16px; buttons, inputs and selects
use 12px; small chips and inline controls use 6–8px; status chips and avatars
go fully round.

Borders are always hairline (1px) and always tinted to their ground — warm
border on cream, slate border on white-cool. A 1px border in a neutral grey on
a warm surface is a defect.

Imagery is masked to the same 16px card radius. Thumbnails hold 16:9; the
brick and product photography is landscape by default.

## Components

### Buttons

- **Shape:** softly rounded (12px), minimum 44px tall.
- **Primary:** Red Soil ground, white text, 10px × 14px padding, semibold.
  One per screen region.
- **Hover / Focus:** ground darkens to Red Soil Deep; focus shows a visible
  2px ring. Transitions are 150ms ease-out.
- **Secondary:** white ground, Ink text, warm hairline border.
- **Disabled:** 60% opacity, cursor default, and — critically — the label still
  explains why elsewhere on screen rather than leaving a dead control.

### Chips

- **Style:** fully round, 11px semibold, 2px × 8px padding, coloured wash
  ground with matching darker text (never white text on a pale wash).
- **State:** filter chips invert to Brick Red ground with white text when
  active; status chips are read-only and carry their semantic pair.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** Surface white on Cream ground.
- **Shadow Strategy:** none at rest — see Elevation.
- **Border:** 1px Warm Border; switches to a warm rose tint when the card is
  in an attention state (overdue, returned, failed).
- **Internal Padding:** 16px, rising to 20–24px for feature cards.

### Inputs / Fields

- **Style:** white ground, 1px warm border, 12px radius, 10px × 12px padding.
- **Focus:** 2px accent ring, border transparent beneath it.
- **Error:** rose border with the message directly beneath the field, never as
  a tooltip.

### Navigation

- **OneHub sidebar:** vertical Brick Red gradient (`#8a2f1c` → `#6d2212`),
  white labels at 82% opacity, active item inverts to a Cream pill with Brick
  Red text. Fixed at 256px from 1024px up; below that it is hidden and the
  primary destination is promoted into the top bar.
- **Dashboard:** cool slate chrome with Signal Blue active states.

### Signature Component — the quote block

The customer quote leads its page: product, engineer-set rate, quantity and
total, in tabular figures, above everything else. It carries no shadow, sits on
Cream, and the total is the largest number on the page. Supporting sections
(objection answer, cost comparison, Chennai logic) follow it and never precede
it.

## Do's and Don'ts

### Do:

- **Do** put the number the reader came for first, at the top, in tabular
  figures — the quote block is the model.
- **Do** use Red Soil (`#c0562f`) for exactly one action per screen region.
- **Do** set text in Ink (`#4a3428`) on warm surfaces and give every control a
  44px touch target.
- **Do** carry status in a wash-plus-dark-text pair (`#e4f1e3`/`#3f7d4d`,
  `#f8ecd4`/`#b3781a`, `#fbe4df`/`#c1453e`).
- **Do** keep English and Tamil together on customer-facing copy, in
  conversational Tamil rather than literary.
- **Do** let a section render nothing when it has no content, rather than
  showing an empty shell.

### Don't:

- **Don't** introduce a second warm accent. `#C46A2B` and cream `#FBF7F2`
  appear in the Smart Quote tokens and are **drift, not design** — they are
  being unified onto `#c0562f` and `#fbf5ea`. Do not add more near-misses.
- **Don't** put a drop shadow on a resting surface.
- **Don't** use pure black, pure grey borders on warm grounds, or Brick Red on
  a button.
- **Don't** reach for urgency devices — countdowns, "BEST PRICE", flashing
  badges. The price is stated once, plainly, and stands.
- **Don't** present stock photography as Maiyuri's own work. There are almost
  no real project photographs; show none rather than a purchased one captioned
  as a local site.
- **Don't** extend the blue-and-slate dashboard palette into new surfaces, and
  don't half-convert an existing dashboard screen to the warm world.
