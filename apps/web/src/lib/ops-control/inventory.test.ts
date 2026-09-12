import { describe, it, expect } from "vitest";
import {
  deriveBuckets,
  availableFrom,
  reconcile,
  type InventoryMovement,
  type StockReservation,
} from "./inventory";

const TODAY = "2026-08-22";

const receipt = (qty: number, avail: string | null, date = TODAY): InventoryMovement => ({
  finished_good_id: "fg-8in",
  quantity: qty,
  movement_date: date,
  available_from: avail,
});

const reservation = (
  qty: number,
  avail: string | null,
  status: StockReservation["status"] = "active",
): StockReservation => ({
  finished_good_id: "fg-8in",
  quantity: qty,
  available_from: avail,
  status,
});

describe("deriveBuckets — PRD §4, the four buckets", () => {
  it("the headline case: 900 produced and reserved, curing 7 days", () => {
    // Coverage is complete, readiness is zero. Reporting one number would be
    // wrong by a week — this is the whole reason the buckets exist.
    const b = deriveBuckets(900, [receipt(900, "2026-08-29")], [reservation(900, "2026-08-29")], TODAY);
    expect(b.physicalOnHand).toBe(900);
    expect(b.curing).toBe(900);
    expect(b.readyPhysical).toBe(0);
    expect(b.reservedCuring).toBe(900);
    expect(b.reservedReady).toBe(0);
    expect(b.freeReady).toBe(0);
    expect(b.nextReadyFrom).toBe("2026-08-29");
  });

  it("crossing the curing boundary makes the same stock ready", () => {
    const movements = [receipt(900, "2026-08-29")];
    const reservations = [reservation(900, "2026-08-29")];
    const before = deriveBuckets(900, movements, reservations, "2026-08-28");
    const onTheDay = deriveBuckets(900, movements, reservations, "2026-08-29");

    expect(before.readyPhysical).toBe(0);
    expect(before.reservedReady).toBe(0);
    // available_from is inclusive: stock is dispatchable ON that date.
    expect(onTheDay.curing).toBe(0);
    expect(onTheDay.readyPhysical).toBe(900);
    expect(onTheDay.reservedReady).toBe(900);
    expect(onTheDay.nextReadyFrom).toBeNull();
  });

  it("separates free from reserved across both curing states", () => {
    const b = deriveBuckets(
      2000,
      [receipt(800, "2026-08-29"), receipt(1200, null, "2026-08-01")],
      [reservation(500, null), reservation(300, "2026-08-29")],
      TODAY,
    );
    expect(b.curing).toBe(800);
    expect(b.readyPhysical).toBe(1200);
    expect(b.reservedReady).toBe(500);
    expect(b.freeReady).toBe(700); // 1200 ready − 500 reserved
    expect(b.reservedCuring).toBe(300);
    expect(b.freeCuring).toBe(500); // 800 curing − 300 reserved
  });

  it("released and consumed reservations stop holding stock", () => {
    const b = deriveBuckets(
      1000,
      [receipt(1000, null, "2026-08-01")],
      [reservation(400, null, "released"), reservation(200, null, "consumed"), reservation(100, null)],
      TODAY,
    );
    expect(b.reservedReady).toBe(100);
    expect(b.freeReady).toBe(900);
  });

  it("Odoo is the ceiling: OC never invents stock Odoo does not report", () => {
    // OC's ledger says 900 are curing but Odoo reports 500 on hand — an
    // unsynced receipt or a real drift. We must not report negative ready
    // stock, and must not silently treat OC's figure as truth.
    const b = deriveBuckets(500, [receipt(900, "2026-08-29")], [], TODAY);
    expect(b.physicalOnHand).toBe(500);
    expect(b.curing).toBe(500);
    expect(b.readyPhysical).toBe(0);
    expect(b.freeReady).toBe(0);
  });

  it("a reservation is only ready to the extent ready stock backs it", () => {
    // 600 reserved as ready, but only 400 physically ready: promising 600
    // would be promising bricks that are not there.
    const b = deriveBuckets(400, [receipt(400, null, "2026-08-01")], [reservation(600, null)], TODAY);
    expect(b.reservedReady).toBe(400);
    expect(b.freeReady).toBe(0);
  });

  it("empty ledger reports Odoo's figure as free and ready", () => {
    const b = deriveBuckets(750, [], [], TODAY);
    expect(b).toMatchObject({
      physicalOnHand: 750,
      curing: 0,
      readyPhysical: 750,
      freeReady: 750,
      nextReadyFrom: null,
    });
  });

  it("issues reduce the ledger without ever being treated as curing", () => {
    const b = deriveBuckets(
      600,
      [receipt(1000, null, "2026-08-01"), receipt(-400, null, "2026-08-15")],
      [],
      TODAY,
    );
    expect(b.curing).toBe(0);
    expect(b.readyPhysical).toBe(600);
  });
});

describe("availableFrom", () => {
  it("adds the product's curing days", () => {
    expect(availableFrom("2026-08-22", 7)).toBe("2026-08-29");
  });
  it("handles month and year boundaries", () => {
    expect(availableFrom("2026-08-28", 7)).toBe("2026-09-04");
    expect(availableFrom("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("zero curing days means dispatchable the same day", () => {
    expect(availableFrom("2026-08-22", 0)).toBe("2026-08-22");
  });
  it("does not shift the date across the IST boundary", () => {
    // A local-timezone Date would make this land a day early.
    expect(availableFrom("2026-08-22", 1)).toBe("2026-08-23");
  });
});

describe("reconcile — PRD §86, drift is surfaced not absorbed", () => {
  it("reports agreement when the ledger matches Odoo", () => {
    const r = reconcile(1000, [receipt(1200, null), receipt(-200, null)]);
    expect(r).toMatchObject({ ledgerBalance: 1000, drift: 0, hasDrift: false });
  });

  it("reports the difference rather than adopting the ledger", () => {
    const r = reconcile(8000, [receipt(8300, null)]);
    expect(r.odooOnHand).toBe(8000);
    expect(r.ledgerBalance).toBe(8300);
    expect(r.drift).toBe(300);
    expect(r.hasDrift).toBe(true);
  });

  it("reports a negative drift when Odoo holds more than OC recorded", () => {
    const r = reconcile(1000, [receipt(900, null)]);
    expect(r.drift).toBe(-100);
    expect(r.hasDrift).toBe(true);
  });

  it("rounding noise is not an exception", () => {
    expect(reconcile(1000, [receipt(1000.005, null)]).hasDrift).toBe(false);
  });
});
