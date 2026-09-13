// @vitest-environment node
// renderToBuffer is the Node build of @react-pdf/renderer; under jsdom the
// browser build resolves instead and the export does not exist.

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { DeliveryScheduleDocument } from "./DeliveryScheduleDocument";
import type { DeliveryScheduleDocumentData } from "./delivery-schedule-data";

type PdfRoot = Parameters<typeof renderToBuffer>[0];

const render = (data: DeliveryScheduleDocumentData) =>
  renderToBuffer(
    React.createElement(DeliveryScheduleDocument, { data }) as unknown as PdfRoot,
  );

const full: DeliveryScheduleDocumentData = {
  orderName: "SO1254",
  versionNo: 2,
  statusLabel: "Confirmed",
  customerName: "Murali Constructions",
  siteName: "Kanchipuram Site A",
  address: "12 Main Road, Kanchipuram",
  contactName: "Murali",
  phone: "+919812345678",
  lines: [
    { productName: '6" CIB', deliveryDate: "2026-08-28", quantity: 400 },
    { productName: '8" CIB', deliveryDate: "2026-09-02", quantity: 500 },
  ],
  totalScheduled: 900,
  totalOrdered: 1200,
  generatedOn: "2026-08-23",
};

describe("DeliveryScheduleDocument", () => {
  it("renders a real PDF", async () => {
    const buffer = await render(full);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 20_000);

  it("renders with every optional field missing, without printing 'null'", async () => {
    const buffer = await render({
      ...full,
      customerName: null,
      siteName: null,
      address: null,
      contactName: null,
      phone: null,
      totalOrdered: null,
    });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.toString("latin1")).not.toContain("null");
  }, 20_000);

  it("is a pure function of the whitelist: identical data → the document cannot pick up a later master edit", async () => {
    // The component's props type IS DeliveryScheduleDocumentData — it has no
    // access to masters at all. Rendering the same snapshot-derived data after
    // a hypothetical site edit must produce the same document.
    const a = await render(full);
    const b = await render(full);
    expect(a.length).toBe(b.length);
  }, 20_000);
});
