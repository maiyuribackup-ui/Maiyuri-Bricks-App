import { describe, it, expect } from "vitest";
import { normalizePhone, parseCsv, detectColumn, reconcile } from "./superfone";

describe("normalizePhone", () => {
  it("matches numbers regardless of +91 / 0 / spacing", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("098765-43210")).toBe("9876543210");
    expect(normalizePhone("919876543210")).toBe("9876543210");
  });
  it("returns '' for empty/garbage input", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("n/a")).toBe("");
  });
});

describe("parseCsv", () => {
  it("parses headers, quoted fields, and skips blank rows", () => {
    const csv =
      'Caller,Phone,Time\n"Ravi, K",+91 98765 43210,2026-06-01\n\nAnu,9000000000,2026-06-02\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["Caller", "Phone", "Time"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["Ravi, K", "+91 98765 43210", "2026-06-01"]);
  });
});

describe("detectColumn", () => {
  it("finds the phone column by header pattern", () => {
    const headers = ["Caller Name", "Mobile Number", "Duration"];
    expect(detectColumn(headers, [/phone/i, /mobile/i, /number/i])).toBe(1);
  });
});

describe("reconcile", () => {
  const leadPhones = new Set(["9876543210"]);

  it("flags callers with no matching lead, busiest first", () => {
    const calls = [
      { phone: "+91 98765 43210", name: "Ravi" }, // has a lead
      { phone: "9000000001", name: "Anu" }, // no lead
      { phone: "0900-000-0001", name: "Anu" }, // same caller again
      { phone: "9000000002" }, // no lead, single
    ];
    const r = reconcile(calls, leadPhones);
    expect(r.totalCalls).toBe(4);
    expect(r.uniqueCallers).toBe(3);
    expect(r.matched).toBe(1);
    expect(r.callsWithoutLead.map((g) => g.phone)).toEqual([
      "9000000001",
      "9000000002",
    ]);
    expect(r.callsWithoutLead[0].calls).toBe(2);
  });

  it("keeps the most recent call timestamp per caller", () => {
    const r = reconcile(
      [
        { phone: "9000000001", at: "2026-06-01" },
        { phone: "9000000001", at: "2026-06-05" },
      ],
      new Set(),
    );
    expect(r.callsWithoutLead[0].lastCallAt).toBe("2026-06-05");
  });
});
