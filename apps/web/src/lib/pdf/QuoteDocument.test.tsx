// @vitest-environment node
// renderToBuffer is the Node build of @react-pdf/renderer; under jsdom the
// browser build resolves instead and the export does not exist.

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { QuoteDocument, type QuoteDocumentData } from "./QuoteDocument";

type PdfRoot = Parameters<typeof renderToBuffer>[0];

const render = (data: QuoteDocumentData) =>
  renderToBuffer(
    React.createElement(QuoteDocument, { data }) as unknown as PdfRoot,
  );

const full: QuoteDocumentData = {
  quoteNumber: "MB-2026-0042",
  quotedOn: "8 Aug 2026",
  validUntil: "23 Aug 2026",
  company: {
    name: "Maiyuri Bricks",
    legalName: "Maiyuri Bricks Pvt Ltd",
    gstin: "33ABCDE1234F1Z5",
    address: "Thiruvallur, Tamil Nadu",
    phone: "044-1234567",
    email: "sales@maiyuri.com",
    website: "maiyuri.com",
  },
  customer: {
    name: "Murali",
    phone: "+919812345678",
    location: "Kanchipuram",
  },
  lines: [
    {
      product: "Interlocking Brick",
      unit: "piece",
      quantity: 5000,
      rate: 32,
      amount: 160_000,
      hsnCode: "681011",
    },
  ],
  total: 160_000,
  deliveryIncluded: true,
  distanceKm: 18,
  priceNote: null,
  taxNote: "GST extra, as per actual.",
  terms: {
    payment: "20% advance against this quotation; balance on delivery",
    delivery: "30 days from the date of advance payment",
    additional: [
      "The price is inclusive of loading, unloading and transportation.",
      "Road access suitable for an Eicher vehicle is required at the site.",
    ],
      special: [],
  },
  bank: {
    accountName: "Maiyuri Bricks",
    accountNumber: "510909010289320",
    ifsc: "CIUB0000389",
    bankName: "City Union Bank",
    branch: "Red Hills",
    upiNumber: "6383579119",
  },
  rep: { name: "Ganesh", phone: "919876543210" },
  footerNote: "Thank you for considering Maiyuri Bricks.",
  wallCost: {
    areaSqft: 1200,
    interlockIsCheapest: true,
    rows: [
      {
        label: "Maiyuri interlocking blocks",
        perSqft: 85,
        buildTotal: 102_000,
        deltaVsInterlock: 0,
      },
      {
        label: "Conventional red brick",
        perSqft: 139,
        buildTotal: 166_800,
        deltaVsInterlock: 64_800,
      },
    ],
  },
  objection: {
    headline: "Is it strong enough for two floors?",
    answer:
      "Every batch is tested to 7 N/mm² before it leaves the yard, above the IS requirement for load-bearing masonry.",
    reassurance: "Come and see the strength test yourself.",
  },
  nextStep: {
    headline: "Visit the factory this Saturday",
    description: "Twenty minutes, and you will handle the block yourself.",
  },
};

/** Every optional commercial fact stripped — the state of a fresh install. */
const bare: QuoteDocumentData = {
  ...full,
  quoteNumber: null,
  validUntil: null,
  company: {
    name: "Maiyuri Bricks",
    legalName: null,
    gstin: null,
    address: null,
    phone: null,
    email: null,
    website: null,
  },
  customer: { name: "Customer", phone: null, location: null },
  distanceKm: null,
  taxNote: null,
  terms: { payment: null, delivery: null, additional: [] },
  bank: null,
  rep: { name: null, phone: null },
  footerNote: null,
  wallCost: null,
  objection: null,
  nextStep: null,
};

describe("QuoteDocument", () => {
  it("renders a real PDF", async () => {
    const buffer = await render(full);
    expect(buffer.length).toBeGreaterThan(1000);
    // A PDF is only a PDF if it starts with the magic header.
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 20_000);

  it("keeps the commercial page clean and puts the argument on page two", async () => {
    const withArgument = await render(full);
    const minimal = await render({
      ...full,
      wallCost: null,
      objection: null,
      nextStep: null,
    });
    // Page 2 always exists (Why Maiyuri earns it), but the optional blocks add
    // to it — so the fuller document must be larger.
    expect(withArgument.length).toBeGreaterThan(minimal.length);
  }, 20_000);

  it("renders with every optional fact missing, rather than throwing", async () => {
    // The business has not entered a GSTIN, address or terms yet. The document
    // must still produce — omitting those blocks, not crashing or printing
    // "null" at a customer.
    const buffer = await render(bare);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.toString("latin1")).not.toContain("null");
  }, 20_000);

  it("renders multiple line items", async () => {
    const buffer = await render({
      ...full,
      lines: [
        ...full.lines,
        {
          product: "Solid Block",
          unit: "piece",
          quantity: 800,
          rate: 45,
          amount: 36_000,
          hsnCode: "681011",
        },
      ],
      total: 196_000,
    });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 20_000);
});
