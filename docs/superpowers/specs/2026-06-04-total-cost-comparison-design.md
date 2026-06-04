# Total-Cost-of-Construction Comparison — Design Spec

**Date:** 2026-06-04
**Feature:** BusinessAnalyst #1 — the price-objection killer for Maiyuri Bricks.

## Problem

Maiyuri sells premium interlock brick into a price-anchored market. The #1
documented lost-reasons are `price_too_high`, `chose_kerala_competitor`,
`chose_conventional_aac`. A higher per-brick price loses on sticker comparison —
but an interlock wall is *cheaper to build overall* (little/no plastering, less
mortar/cement, faster labour). Reps have no tool to make that argument at the
moment of doubt.

## Goal

When a rep shares a Smart Quote, the customer sees a credible, personalized
"why interlock costs less to build" comparison (interlock vs red brick vs AAC,
₹/sq.ft of wall), in Tamil or English, that reframes price into total build cost.

## Non-goals (v1)

- No PDF/image generation — the shareable artefact is the existing quote link.
- No new WhatsApp infra — reuses the existing quote-link share.
- No deep i18n framework — a small bilingual string set for this feature only.

## Data model

### Global template — `wall_system_cost_config` (founder-owned)
Single active row. The 3×4 matrix of ₹/sq.ft of wall:

| line item       | interlock | red_brick | aac |
|-----------------|-----------|-----------|-----|
| masonry_units   | ▢         | ▢         | ▢   |
| mortar_cement   | ▢         | ▢         | ▢   |
| plastering      | 0 (dflt)  | ▢         | ▢   |
| labour          | ▢         | ▢         | ▢   |

Plus `is_seeded_placeholder` (boolean — true until founder saves real values),
`updated_by`, `updated_at`. Seeded with clearly-flagged placeholder TN values.

### Per-quote snapshot — `smart_quotes.wall_cost_config` (JSONB, nullable)
On quote generate, the global config is **snapshotted** onto the quote so:
1. the rep can personalize the numbers for that customer, and
2. a shared quote's numbers never change if the global default is later tuned.

The public page renders the quote's snapshot (falling back to global if null,
e.g. for quotes created before this feature).

## Compute (`src/lib/pricing/wall-cost.ts`, pure, unit-tested)

```
total(system)      = masonry_units + mortar_cement + plastering + labour   (₹/sqft)
buildCost(system)  = total(system) × wallAreaSqft
deltaVsInterlock(s)= { pct, rupees }   // how much MORE than interlock
```
Returns a `WallCostComparison` with per-system per-sqft + build totals + deltas,
and an `interlockIsCheapest` flag. `mergeWallCosts(global, override)` produces the
effective config for a quote.

## Surfaces

1. **Founder settings** (`/settings` → "Wall System Costs"): editable 3×4 grid
   (`WallCostSettings`), founder/owner only, with a "placeholder — verify before
   use" banner while `is_seeded_placeholder`.
2. **Public Smart Quote** (`/sq/[slug]`): a "Why interlock is cheaper to build"
   section (`WallCostComparison`) using the quote's wall area + snapshot.
   Rendered in Tamil when the lead/quote language preference is Tamil.
   Logged as an engagement event (reuse existing tracking).
3. **Staff quote view:** the same comparison, plus inline-editable cost cells
   that persist to the quote's `wall_cost_config` (personalization).
4. **WhatsApp:** the existing quote-link share; share text gains one line
   pointing to the build-cost comparison.

## APIs

- `GET/PUT /api/settings/wall-costs` — global config; PUT gated to founder/owner.
- `PATCH /api/smart-quotes/[id]` (or the existing quote update route) accepts
  `wall_cost_config` for per-quote personalization.
- Public `/api/sq/[slug]` payload: server computes the comparison from
  area + effective config and returns **only the results** (raw per-line config
  is not exposed publicly beyond what the comparison shows).

## Privacy / edge cases

- Raw global config never sent to the public endpoint — only computed results.
- Config unset/all-zero, or interlock not actually cheapest (misconfig) →
  the section hides the "cheaper" claim and degrades gracefully (or hides).
- No wall area on the quote → section hidden.

## i18n

`src/lib/pricing/wall-cost-i18n.ts` — EN + TA for: section title, the 4 line-item
labels, the three system names, and the one-liner. Public page picks language
from the lead/quote preference; staff view is English.

## Components

- `WallCostComparison` — display (bars + deltas + one-liner); shared public/staff.
- `WallCostSettings` — founder grid editor.

Both small, single-purpose, presentational; data/mutations owned by their pages.

## Verification

- Unit tests for `wall-cost.ts` (totals, deltas, merge, not-cheapest guard).
- `tsc --noEmit` + `next build` green.
- Migration applied to prod only after explicit authorization.
