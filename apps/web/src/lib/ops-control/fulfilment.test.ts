import { describe, it, expect } from "vitest";
import {
  remainingQty,
  uncoveredQty,
  commitmentStatus,
  revisionStatus,
  coverageStatus,
  checkOverschedule,
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
