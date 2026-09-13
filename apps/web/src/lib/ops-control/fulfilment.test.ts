import { describe, it, expect } from "vitest";
import {
  remainingQty,
  uncoveredQty,
  commitmentStatus,
  revisionStatus,
  coverageStatus,
  checkOverschedule,
  computeCoverage,
  computeReadiness,
} from "./fulfilment";

describe("remainingQty / uncoveredQty (PRD §10)", () => {
  it("computes remaining and floors at zero", () => {
    expect(remainingQty(5000, 1500)).toBe(3500);
    expect(remainingQty(1000, 1200)).toBe(0); // over-delivered never negative
  });

  it("uncovered floors at zero on over-coverage (PRD example)", () => {
    // Remaining 4,000, reserved 2,000, allocation 3,000 -> coverage 5,000
    expect(uncoveredQty(4000, 2000, 3000)).toBe(0);
    expect(uncoveredQty(4000, 2000, 1000)).toBe(1000);
  });
});

describe("commitmentStatus — what the customer holds", () => {
  const base = { qtyOrdered: 5000, qtyDelivered: 0, hasConfirmedVersion: false, openVersionStatus: null as null };

  it("unscheduled when nothing exists", () => {
    expect(commitmentStatus(base)).toBe("unscheduled");
  });

  it("a draft that was never sent is still not a customer commitment", () => {
    expect(commitmentStatus({ ...base, openVersionStatus: "draft" })).toBe("unscheduled");
  });

  it("awaiting confirmation once sent", () => {
    expect(commitmentStatus({ ...base, openVersionStatus: "sent" })).toBe("awaiting_confirmation");
  });

  it("confirmed once an active confirmed version exists", () => {
    expect(commitmentStatus({ ...base, hasConfirmedVersion: true })).toBe("confirmed");
  });

  it("a draft REVISION does not un-confirm the customer's commitment", () => {
    // V1 confirmed, V2 draft: the customer still holds V1.
    expect(
      commitmentStatus({ ...base, hasConfirmedVersion: true, openVersionStatus: "draft" }),
    ).toBe("confirmed");
  });

  it("partially delivered and completed follow deliveries", () => {
    expect(commitmentStatus({ ...base, qtyDelivered: 1500, hasConfirmedVersion: true })).toBe("partially_delivered");
    expect(commitmentStatus({ ...base, qtyDelivered: 5000, hasConfirmedVersion: true })).toBe("completed");
  });
});

describe("revisionStatus — the working dimension", () => {
  it("maps the open version to its revision label", () => {
    expect(revisionStatus(null)).toBe("none");
    expect(revisionStatus("draft")).toBe("draft_revision");
    expect(revisionStatus("sent")).toBe("sent_revision");
    expect(revisionStatus("revision_requested")).toBe("revision_requested");
  });
});

describe("coverageStatus — absence of data is NOT zero", () => {
  it("null input (Phase 2) is not_evaluated, never uncovered", () => {
    expect(coverageStatus(null)).toBe("not_evaluated");
  });

  it("real zero inputs (Phase 3) ARE uncovered — the two are different facts", () => {
    expect(coverageStatus({ remaining: 5000, reserved: 0, productionAllocated: 0 })).toBe("uncovered");
  });

  it("bands partial and full coverage", () => {
    expect(coverageStatus({ remaining: 5000, reserved: 1000, productionAllocated: 0 })).toBe("partially_covered");
    expect(coverageStatus({ remaining: 5000, reserved: 2000, productionAllocated: 3000 })).toBe("covered");
    expect(coverageStatus({ remaining: 0, reserved: 0, productionAllocated: 0 })).toBe("covered");
  });
});

describe("checkOverschedule (PRD §26)", () => {
  it("passes when the version total fits the remaining order", () => {
    expect(checkOverschedule(4000, 5000, 1000)).toEqual({ ok: true, excess: 0 });
  });

  it("reports the exact excess when over", () => {
    // remaining = 4,000; scheduling 5,000 -> excess 1,000 (PRD's worked example)
    expect(checkOverschedule(5000, 5000, 1000)).toEqual({ ok: false, excess: 1000 });
  });
});

// ---------------------------------------------------------------------------
// Phase 3: coverage vs readiness. The PRD's worked example is the spec.
// ---------------------------------------------------------------------------

describe("computeCoverage — PRD §10", () => {
  it("900 produced and reserved against a 900 requirement is fully covered", () => {
    const c = computeCoverage({ qtyOrdered: 900, qtyDelivered: 0, reserved: 900, productionAllocated: 0 });
    expect(c).toMatchObject({ remaining: 900, uncovered: 0, status: "covered" });
  });

  it("traces the shortfall: allocated 950 against 1,200 leaves 250 uncovered", () => {
    const c = computeCoverage({ qtyOrdered: 1200, qtyDelivered: 0, reserved: 0, productionAllocated: 950 });
    expect(c.uncovered).toBe(250);
    expect(c.status).toBe("partially_covered");
  });

  it("counts reservations and production allocation together", () => {
    const c = computeCoverage({ qtyOrdered: 1000, qtyDelivered: 200, reserved: 500, productionAllocated: 300 });
    expect(c.remaining).toBe(800);
    expect(c.uncovered).toBe(0);
    expect(c.status).toBe("covered");
  });

  it("over-coverage never reports as negative uncovered", () => {
    const c = computeCoverage({ qtyOrdered: 500, qtyDelivered: 0, reserved: 900, productionAllocated: 0 });
    expect(c.uncovered).toBe(0);
  });

  it("nothing reserved and nothing produced is uncovered", () => {
    const c = computeCoverage({ qtyOrdered: 900, qtyDelivered: 0, reserved: 0, productionAllocated: 0 });
    expect(c.status).toBe("uncovered");
    expect(c.uncovered).toBe(900);
  });
});

describe("computeReadiness — covered is not ready", () => {
  const curing = (qty: number, from: string) => ({ quantity: qty, available_from: from, status: "active" });
  const readyRes = (qty: number) => ({ quantity: qty, available_from: null, status: "active" });

  it("fully covered but zero ready while curing, with the date it changes", () => {
    const r = computeReadiness([curing(900, "2026-08-29")], 900, "2026-08-22");
    expect(r).toMatchObject({ readyNow: 0, curing: 900, readyFrom: "2026-08-29", fullyReady: false });
  });

  it("the same reservation is ready ON the available_from date", () => {
    const r = computeReadiness([curing(900, "2026-08-29")], 900, "2026-08-29");
    expect(r).toMatchObject({ readyNow: 900, curing: 0, readyFrom: null, fullyReady: true });
  });

  it("reports the EARLIEST date when batches cure separately", () => {
    const r = computeReadiness([curing(300, "2026-09-05"), curing(600, "2026-08-29")], 900, "2026-08-22");
    expect(r.readyFrom).toBe("2026-08-29");
    expect(r.curing).toBe(900);
  });

  it("partial readiness is not full readiness", () => {
    const r = computeReadiness([readyRes(400), curing(500, "2026-08-29")], 900, "2026-08-22");
    expect(r.readyNow).toBe(400);
    expect(r.fullyReady).toBe(false);
  });

  it("released reservations hold nothing ready", () => {
    const r = computeReadiness([{ quantity: 900, available_from: null, status: "released" }], 900, "2026-08-22");
    expect(r.readyNow).toBe(0);
  });

  it("a fully delivered line is trivially ready", () => {
    expect(computeReadiness([], 0, "2026-08-22").fullyReady).toBe(true);
  });
});
