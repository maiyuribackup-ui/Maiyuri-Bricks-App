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
supabase/migrations/20260822120200_std_cost_reference_costs.sql  benchmarks + variance views
supabase/migrations/20260822120300_std_cost_reference_seed.sql   legacy benchmarks + verification flags
packages/shared/src/unit-economics.ts                            types, formulas, diff, zod schemas
apps/web/src/lib/unit-economics.ts                               server-side load/save/publish
apps/web/app/api/unit-economics/…                                GET overview · PUT draft · POST publish · versions
apps/web/app/(dashboard)/unit-economics/page.tsx                 the screen
apps/web/src/components/unit-economics/…                         editor, diff, publish, history
```

## Reference (benchmark) costs — reconciliation

Legacy sheet totals, manual benchmarks and past actuals are stored in
`std_cost_reference_costs`, **separately from the standard and never inside
it**. The rule is structural, not a convention:

- `computeBundle()` takes no reference argument. There is no code path by which
  a benchmark can influence a computed cost.
- `v_std_cost_brick_type_computed` and the two frozen contract views do not
  reference the benchmark tables at all.
- The only operation defined between a computed cost and a reference is
  subtraction, and the residual is reported as **unexplained** rather than
  absorbed.

A computed cost moves only one way: correct a business input in the draft and
publish a new version. Never by adjusting a formula, and never by adding a
balancing factor.

### What the screen shows

```
Computed Cost:  ₹27.06
Legacy Sheet:   ₹32.83
Variance:      −₹5.77  (−17.6%)
⚠ Significant variance
```

Expanded, once a breakdown exists:

```
Raw material   −₹3.20
Labour         −₹1.45
Fixed overhead −₹1.13
  cement       −₹0.62   (inside raw material — detail, not added again)
Unexplained     ₹0.00
```

With no breakdown recorded, the whole variance shows as unexplained. That is
deliberate: a missing breakdown should look like a missing breakdown, not like a
reconciled zero.

### Two axes of breakdown

| Kind | Keys | Role |
|---|---|---|
| `cost_element` | material · labour · electricity · depreciation · fixed · other | Mutually exclusive, must sum to the reference total (enforced in the zod schema). Each maps 1:1 onto a computed number. **The unexplained residual is measured on this axis only.** |
| `raw_material` | any `rm_key` (cement, chemical, …) | A drill-down *inside* the material element. Never added to the cost-element sum — that would double-count material. |

### Views for the Intelligence Layer

- `v_std_cost_reference_variance` — one row per brick type per active
  benchmark: computed, reference, `variance_amount`, `variance_pct`,
  `explained_difference`, `unexplained_difference`, `has_component_breakdown`.
- `v_std_cost_reference_component_variance` — per component: reference amount,
  computed amount (NULL where there is no counterpart, e.g. `other`), and the
  difference.

Between them these answer "why is 8 CIB ₹5.77 below the old costing?" from
stored data, and expose the pattern across products (both CIB around −17.5%,
both MIB around −3.8%) for exception analysis. The narrative is the Intelligence
Layer's job; the app's job is to make the numbers unambiguous.

Note the percentages round to 1 dp in the UI and 2 dp in the views — same
figure, different display precision.

## Unconfirmed inputs

`std_cost_rm_prices.needs_verification` + `verification_note` mark an input that
is in use but not yet confirmed. The flag changes nothing about how the number
is used — that is the point. It records doubt so it can be chased, and it
travels forward on every publish so it cannot be lost.

Two inputs are flagged at go-live, both because §9 of the PRD contradicts itself
and both seeded to match the per-kg cost the standard has actually been costing
with:

| Material | Source says | In use | Why |
|---|---|---|---|
| `red_soil` | `4712.50 / 37050 kg (≈1.27/kg)` | 4712.50 / **3705 kg** = 1.2719/kg | 4712.50/37050 is 0.127 — off by 10× from the stated ≈1.27 |
| `red_soil_gravel` | `3600 / 28900-for-8 (≈0.80/kg)` | 3600 / **4500 kg** = 0.80/kg | matches the stated ≈0.80; no recipe consumes it, so no total depends on it |

When the real load weight is known: edit the draft, publish, and version history
shows exactly what changed and what it did to every brick cost.

## Go-live

The four legacy sheet totals are seeded as `legacy_excel` benchmarks, with no
component breakdown (the sheet never published one), so every rupee shows as
unexplained until someone supplies real figures:

| Brick type | Computed | Legacy sheet | Variance |
|---|---|---|---|
| 8 CIB | 27.06 | 32.83 | −5.77 (−17.6%) |
| 6 CIB | 26.24 | 31.80 | −5.56 (−17.5%) |
| 8 MIB | 34.77 | 36.12 | −1.35 (−3.7%) |
| 6 MIB | 27.94 | 29.04 | −1.10 (−3.8%) |

These are test cases for the reconciliation feature, not blockers. Deploy, then
the Intelligence Layer flips its standard-cost source from JSON snapshots to
`v_standard_costs_current`.
