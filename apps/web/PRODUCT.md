# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two first-class contexts, confirmed as equally important — neither is an
afterthought:

- **Sales engineers on phones** (Srinivasan, Rajesh) — at customer sites, in
  the factory, on the move. They work leads, take and forward calls, set quote
  prices, and follow up over WhatsApp.
- **Founder and production supervisor on desktop** — reviewing dashboards,
  approvals, production plans, reports and quote engagement.

Roles carried in the codebase: `founder`, `owner`, `production_supervisor`,
`accountant`, `sales`, `driver`, `staff`.

**Customers are unauthenticated third-party users**, not staff. They never see
the dashboard; they receive a link and land on a public surface (`/sq/<slug>`
Smart Quote, `/feedback/<token>`). They are typically homeowners, builders or
architects around Chennai and northern Tamil Nadu.

## Product Purpose

An operating system for a brick manufacturing business: it carries a customer
from first enquiry through quote, order, production, and delivery, and keeps
the team's daily work visible in one place.

Success is that no enquiry is forgotten, every quote is priced by a human and
followed up, and production and deliveries match what was promised.

## Positioning

Confirmed claims a neighbouring supplier could not truthfully copy:

1. **Locally made, properly cured.** Tested red soil, machine compaction, and
   full curing before dispatch — against imported mud interlock bricks that
   travel far, crack in transit, and vary batch to batch.
2. **Honest delivered pricing.** The quoted rate includes transport to the
   customer's site; no surprise add-ons at delivery.
3. **Proof you can see.** Factory visits, a demo wall, water and strength
   tests, and delivery photographs.

Explicitly *not* claimed as positioning: response speed. The product does
enforce a 30-minute first-response rule and analyses every recorded call, but
the business does not present speed as its differentiator. Treat it as an
internal capability, not a customer-facing claim.

## Operating Context

- **Odoo ERP** (`crm.maiyuri.com`) is the system of record for orders,
  invoices and stock. The app syncs from it and must never become the master.
- **WhatsApp is the primary customer channel.** Quotes, follow-ups and
  confirmations happen there; in-app actions frequently end in a WhatsApp
  hand-off.
- **Telegram carries call recordings.** Staff forward Superfone call `.wav`
  files into a group; the app ingests, transcribes and analyses them.
- **Factory visits are a real sales step**, with sample bricks, a water test
  and a demo wall.
- Work spans the yard, customer sites and the office, so the same task is
  often started on a phone and reviewed on a desktop.

## Capabilities and Constraints

Surfaces in this app (`apps/web`):

- **Staff dashboard** (21 routes): leads, quotes, rate-card, production,
  deliveries, planning, projects, approvals, tasks, expenses, analytics,
  business-health, KPI, coaching, knowledge, daily-report, observability,
  settings, help.
- **OneHub** (`/onehub`) — the internal Start Here portal: SOPs, checklists,
  links, reminders, My Work queue, videos.
- **Public customer surfaces** — Smart Quote (`/sq/<slug>`) and feedback
  (`/feedback/<token>`), both reached by shared link, no login.

Durable constraints confirmed by the owner:

- **A human engineer sets every price.** The app must never auto-quote a
  customer. Product, quantity and rate are entered in the app and are
  authoritative; sharing is blocked until they exist.
- **Odoo remains the source of truth** for orders, invoices and stock.
- **WhatsApp-first contact** — designs should assume the conversation
  continues there.

Undecided / not confirmed:

- **Bilingual English + Tamil is implemented throughout** (customer pages,
  OneHub, SOPs, quote copy, with conversational rather than literary Tamil),
  but the owner did not confirm it as a binding constraint in this interview.
  Treat existing Tamil as real and preserve it; ask before extending bilingual
  coverage to new surfaces or before dropping it from an existing one.

## Brand Commitments

- Name: **Maiyuri Bricks**.
- Taglines in active use: *"Built on Strength. Rooted in Trust."*, *"நம் மண்.
  நம் வீடு. நம் அறிவு."* (Our soil. Our home. Our wisdom.), and *"உழைப்பே
  உயர்வு தரும்"* (Hard work builds greatness).
- **Mayur**, a peacock mascot, is the OneHub guide character
  (`/onehub/mayur-avatar.png`, `mayur-hero.png`, `mayur-celebrate.png`).
- Product vocabulary: interlock bricks, red soil, curing, delivered price,
  factory visit.

## Evidence on Hand

Real, in production:

- ~1,000 leads, 640+ call recordings with transcripts and AI analysis, and
  1,800+ Odoo sync log entries.
- Live product catalogue and a rate card with per-km delivered price bands.
- Published SOPs and a new-joiner checklist in OneHub.
- Brand imagery for OneHub (Mayur artwork, logo mark).

Absences future work must **not** fabricate:

- **There are almost no real project photographs.** Production holds a single
  Smart Quote image, and the customer-facing proof section was shipping stock
  photography from Unsplash captioned as "Adyar residence" and "Velachery
  home". Do not present stock imagery as Maiyuri's own work; either use real
  photographs or show none.
- No testimonials, case studies, press coverage, certifications or awards have
  been confirmed. Do not invent them.
- No published pricing exists outside the rate card and engineer-set quotes.

## Product Principles

1. **A human owns the price.** Automation may gather, draft and remind, but a
   person decides what a customer pays.
2. **Nothing waits on a screen nobody opens.** Work surfaces where the person
   already is — phone in the yard, WhatsApp with the customer, desktop for
   review.
3. **Show, don't assert.** The business wins on evidence — cured bricks, a
   demo wall, delivery photos — so the product should prefer showing proof to
   making claims.
4. **One task, one place.** A staff member should never navigate a hierarchy
   to find what they owe today.
5. **The phone and the desk are equal.** Any surface a field engineer uses
   must be as complete on a phone as on a monitor.

## Accessibility & Inclusion

No formal standard was established as a requirement. Product-specific needs
observed and worth preserving:

- Tamil-first readers among both staff and customers; existing Tamil copy is
  conversational, not literary.
- Field use on mid-range Android phones, outdoors, on variable mobile data —
  favour large tap targets, high contrast in daylight, and tolerance of slow
  or dropped connections.
