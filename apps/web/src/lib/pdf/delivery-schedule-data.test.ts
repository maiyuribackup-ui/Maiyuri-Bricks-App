import { describe, it, expect } from "vitest";
import {
  buildDeliveryScheduleData,
  deliveryScheduleFilename,
  formatScheduleDate,
  type DeliveryScheduleDocumentData,
} from "./delivery-schedule-data";

const version = {
  version_no: 2,
  status: "confirmed",
  customer_snapshot: {
    order_name: "SO1254",
    odoo_partner_id: 77,
    customer_name: "Murali Constructions",
    site_name: "Kanchipuram Site A",
    address: "12 Main Road, Kanchipuram",
    gmaps_url: "https://maps.example/x",
    contact_name: "Murali",
    phone: "+919812345678",
  },
  lines: [
    { product_name: '8" CIB', delivery_date: "2026-09-02", quantity: 500 },
    { product_name: '6" CIB', delivery_date: "2026-08-28", quantity: 400 },
  ],
};

describe("buildDeliveryScheduleData", () => {
  it("builds from snapshot + lines, sorted by date, with totals", () => {
    const data = buildDeliveryScheduleData(version, {
      totalOrdered: 1200,
      generatedOn: "2026-08-23",
    });
    expect(data.orderName).toBe("SO1254");
    expect(data.versionNo).toBe(2);
    expect(data.statusLabel).toBe("Confirmed");
    expect(data.customerName).toBe("Murali Constructions");
    expect(data.lines.map((l) => l.deliveryDate)).toEqual([
      "2026-08-28",
      "2026-09-02",
    ]);
    expect(data.totalScheduled).toBe(900);
    expect(data.totalOrdered).toBe(1200);
  });

  it("PRD §15 — the whitelist type is the complete set of what the PDF may know", () => {
    const data = buildDeliveryScheduleData(version, {
      totalOrdered: null,
      generatedOn: "2026-08-23",
    });
    // Exhaustive key check: any new field must be a conscious decision here,
    // because trip numbers, other customers, vehicle utilisation, production
    // allocation, internal notes and labour must never appear.
    expect(Object.keys(data).sort()).toEqual(
      [
        "orderName",
        "versionNo",
        "statusLabel",
        "customerName",
        "siteName",
        "address",
        "contactName",
        "phone",
        "lines",
        "totalScheduled",
        "totalOrdered",
        "generatedOn",
      ].sort(),
    );
    expect(Object.keys(data.lines[0]).sort()).toEqual(
      ["productName", "deliveryDate", "quantity"].sort(),
    );
    const flat = JSON.stringify(data).toLowerCase();
    for (const banned of [
      "trip",
      "vehicle",
      "utilisation",
      "allocation",
      "labour",
      "internal",
      "reservation",
    ]) {
      expect(flat).not.toContain(banned);
    }
  });

  it("uses customer-facing status wording, never raw workflow states", () => {
    const label = (status: string) =>
      buildDeliveryScheduleData(
        { ...version, status },
        { generatedOn: "2026-08-23" },
      ).statusLabel;
    expect(label("sent")).toBe("Awaiting your confirmation");
    expect(label("revision_requested")).toBe("Under revision");
    expect(label("superseded")).toBe("Superseded by a later version");
    expect(label("draft")).toBe("Proposed");
  });

  it("a mutated site master cannot change an existing version's document", () => {
    // The builder receives ONLY the version. There is no site-master input to
    // mutate — but prove the behavioural claim: the same stored snapshot
    // yields the same document even when the live master has since changed.
    const before = buildDeliveryScheduleData(version, {
      totalOrdered: 1200,
      generatedOn: "2026-08-23",
    });
    // "The site master was edited": a NEW version would snapshot the new
    // address, but the existing version's snapshot is untouched by design.
    const mutatedMaster = { address: "99 Changed Street, Chennai" };
    const after = buildDeliveryScheduleData(version, {
      totalOrdered: 1200,
      generatedOn: "2026-08-23",
    });
    expect(after).toEqual(before);
    expect(after.address).toBe("12 Main Road, Kanchipuram");
    expect(after.address).not.toBe(mutatedMaster.address);
  });

  it("missing snapshot fields render as null, never undefined or empty strings", () => {
    const data = buildDeliveryScheduleData(
      { ...version, customer_snapshot: { order_name: "SO9", site_name: "" } },
      { generatedOn: "2026-08-23" },
    );
    expect(data.siteName).toBeNull();
    expect(data.customerName).toBeNull();
    expect(data.totalOrdered).toBeNull();
    const values: DeliveryScheduleDocumentData = data;
    expect(Object.values(values)).not.toContain(undefined);
  });
});

describe("deliveryScheduleFilename", () => {
  it("matches the PRD §87 shape", () => {
    expect(deliveryScheduleFilename("SO1254", 2)).toBe(
      "Maiyuri_Delivery_Schedule_SO1254_V2.pdf",
    );
  });
  it("strips unsafe characters from the order name", () => {
    expect(deliveryScheduleFilename("SO/12 54", 1)).toBe(
      "Maiyuri_Delivery_Schedule_SO1254_V1.pdf",
    );
  });
});

describe("formatScheduleDate", () => {
  it("formats without Date parsing (no IST shift)", () => {
    expect(formatScheduleDate("2026-08-28")).toBe("28 Aug 2026");
    expect(formatScheduleDate("2026-01-01")).toBe("1 Jan 2026");
  });
  it("returns the input unchanged when malformed", () => {
    expect(formatScheduleDate("not-a-date")).toBe("not-a-date");
  });
});
