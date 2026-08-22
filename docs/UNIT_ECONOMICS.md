# Unit Economics (Standard Cost) module

Replaces the "Mb Unit Economics" Google Sheet (sheet id
`1h538LH--cr3yiqDVaiXvU85ZxsgVvqBZ010QuXpAdbM`), which is retired read-only at
go-live with a banner pointing at the app.

**Where it lives:** `/unit-economics` in the web app (nav: founder, owner,
accountant).

## The model

| Concept | Rule |
|---|---|
| Draft | Exactly one, always. Any staff member edits it. Nothing downstream sees it. |
| Published version | Immutable, dated (`valid_from`). Only founder/owner publishes. |
| Revert | Refills the draft from an older version — history is never rewritten. |

Publishing freezes the draft and opens a fresh draft copied from it, atomically,
inside `publish_std_cost_draft()`.

## The one invariant

**No derived number is ever stored from user input.** `cost_per_kg` is a
generated column; every per-unit cost is computed in the SQL view
`v_std_cost_brick_type_computed` and mirrored, formula for formula, in
`packages/shared/src/unit-economics.ts` (`computeBundle`) so the editor can show
live numbers for an unsaved draft.

Those two implementations are pinned to the same expected values by
`packages/shared/src/unit-economics.test.ts`. If you change a formula, change it
in **both** places and update that test — that is the whole defence against the
"the sheet says chemical is ₹80/kg while its own inputs say ₹74" class of error.

```
material_cost_per_batch = Σ recipe: kg_per_batch × (purchase_amount / purchase_unit_kg)
material_cost_per_unit  = material_cost_per_batch / bricks_per_batch
labor_cost_per_unit     = labor_cost_per_batch / bricks_per_batch
overhead_per_unit       = electricity_per_unit + depreciation_per_unit
variable_cost_per_unit  = material + labor + overhead   (all per unit)
fixed_cost_per_unit     = Σ fixed_items.monthly_amount / monthly_production_basis
total_cost_per_unit     = variable_cost_per_unit + fixed_cost_per_unit
margin_per_unit         = sales_price − loading_unloading − transport − commission − total_cost_per_unit
bricks_per_cement_bag   = bricks_per_batch × 50 / recipe.cement.kg_per_batch
```

Full precision throughout; rounding happens at display and in the contract views
only.

## Frozen integration contract

The Maiyuri Intelligence Layer reads these two views. **Never rename the views
or their columns**, and never change `brick_type` values or `product_match`
patterns without a downstream handshake — they join onto Odoo product names.

- `public.v_standard_costs_current`
- `public.v_standard_rm_prices_current`

Both select the published version with the greatest `valid_from`. Both are
`security_invoker` views: the reader needs `SELECT` on the five `std_cost_*`
base tables. `service_role` and `authenticated` are granted in the migration; if
the Intelligence Layer reads as some other role, grant it `SELECT` on those
tables and add a `SELECT` policy — the views hand out no access of their own.

Full history stays queryable in the base tables (`std_cost_versions` joined to
its children).

## Permissions

| | Staff (any signed-in role) | Founder / owner |
|---|---|---|
| Read draft + history | ✅ | ✅ |
| Edit the draft | ✅ | ✅ |
| Publish / revert | ❌ | ✅ |
| `anon` | reads nothing (revoked) | — |

RLS is on with a SELECT-only policy for `authenticated`; every write goes
through the service-role client in `apps/web/app/api/unit-economics/*`, which is
where the role gate lives (`canPublishStandardCost`).

## Publish gating

- **Blocks** (`publishBlockers`): a brick type with no cement recipe line, a
  `total_cost_per_unit ≤ 0`, a recipe line whose material has no price row, no
  brick types, a non-positive production basis, a `valid_from` not after the
  current standard.
- **Warns, does not block** (`publishWarnings`): any total moving more than 15%
  against the published version.

## Files

```
supabase/migrations/20260822120000_std_cost_unit_economics.sql   tables, guards, views, RLS, publish()
supabase/migrations/20260822120100_std_cost_seed_v1.sql          go-live seed (v1) + first draft
packages/shared/src/unit-economics.ts                            types, formulas, diff, zod schemas
apps/web/src/lib/unit-economics.ts                               server-side load/save/publish
apps/web/app/api/unit-economics/…                                GET overview · PUT draft · POST publish · versions
apps/web/app/(dashboard)/unit-economics/page.tsx                 the screen
apps/web/src/components/unit-economics/…                         editor, diff, publish, history
```

## Go-live: two things to settle with Ram

**1. Two seeded inputs are guesses.** The PRD contradicts itself on both, so
each was seeded to match the per-kg cost the sheet actually costs with, and
needs the real load weight confirmed (one edit in the app, then publish):

| Material | PRD says | Seeded | Why |
|---|---|---|---|
| `red_soil` | `4712.50 / 37050 kg (≈1.27/kg)` | 4712.50 / **3705 kg** = 1.2719/kg | 4712.50/37050 is 0.127, off by 10× from the stated ≈1.27 |
| `red_soil_gravel` | `3600 / 28900-for-8 (≈0.80/kg)` | 3600 / **4500 kg** = 0.80/kg | matches the stated ≈0.80; no recipe consumes it, so no total depends on it |

**2. The computed totals do not match the sheet's.** The inputs below are the
sheet's own inputs — where the totals differ, the sheet's totals were stale.
Review before flipping the Intelligence Layer over:

| Brick type | Computed | Sheet | Delta |
|---|---|---|---|
| 8 CIB | 27.06 | 32.83 | −5.77 |
| 6 CIB | 26.24 | 31.80 | −5.56 |
| 8 MIB | 34.77 | 36.12 | −1.35 |
| 6 MIB | 27.94 | 29.04 | −1.10 |

Then tell Ram, and the Intelligence Layer flips its standard-cost source from
JSON snapshots to `v_standard_costs_current`.
