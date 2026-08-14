import { describe, it, expect } from "vitest";
import {
  buildArgument,
  buildQuoteDocumentData,
  buildWallCostBlock,
  formatQuoteDate,
  isExpired,
  quoteFilename,
  type QuoteDocumentSources,
} from "./quote-document-data";
import type { WallCostConfig } from "@maiyuri/shared";

const base: QuoteDocumentSources = {
  quote: {
    quote_number: "MB-2026-0042",
    valid_until: "2026-08-23",
    created_at: "2026-08-08T04:30:00.000Z",
    pricing_config: {
      default_product: "prod-1",
      default_area_sqft: 5000,
      quoted_rate: 32,
      show_transport: true,
      default_distance_km: 18,
      price_note: null,
      rep_phone: "919876543210",
    },
  },
  lead: {
    name: "Murali",
    contact: "+919812345678",
    site_location: "Kanchipuram",
    site_region: "West",
  },
  factory: {
    name: "Maiyuri Bricks",
    legal_name: "Maiyuri Bricks Pvt Ltd",
    gstin: "33ABCDE1234F1Z5",
    registered_address: "Thiruvallur, Tamil Nadu",
    address: "Factory pin address",
    contact_phone: "044-1234567",
    contact_email: "sales@maiyuri.com",
    website: "maiyuri.com",
    payment_terms: "20% advance against this quotation",
    delivery_terms: "30 days from the date of advance payment",
    additional_terms:
      "1.The price is inclusive of loading, unloading and transportation.\n\n2.Road access for an Eicher vehicle is required.",
    tax_note: "GST extra, as per actual.",
    bank_account_name: "Maiyuri Bricks",
    bank_account_number: "510909010289320",
    bank_ifsc: "CIUB0000389",
    bank_name: "City Union Bank",
    bank_branch: "Red Hills",
    upi_number: "6383579119",
    quote_footer_note: "Thank you.",
  },
  product: { name: "Interlocking Brick", unit: "piece", hsn_code: "681011" },
  rep: { name: "Ganesh", phone: "919876543210" },
};

/** Deep-clone helper so each test can mutate one branch safely. */
const withQuote = (
  pricing: Partial<NonNullable<QuoteDocumentSources["quote"]["pricing_config"]>>,
): QuoteDocumentSources => ({
  ...base,
  quote: {
    ...base.quote,
    pricing_config: { ...base.quote.pricing_config, ...pricing },
  },
});

describe("buildQuoteDocumentData", () => {
  it("prices from the engineer's rate, never recomputing", () => {
    const { data } = buildQuoteDocumentData(base);
    expect(data).not.toBeNull();
    expect(data?.lines).toHaveLength(1);
    expect(data?.lines[0]).toMatchObject({
      product: "Interlocking Brick",
      unit: "piece",
      quantity: 5000,
      rate: 32,
      amount: 160_000,
    });
    expect(data?.total).toBe(160_000);
  });

  it("refuses to build a document without an engineer rate", () => {
    const { data, reason } = buildQuoteDocumentData(
      withQuote({ quoted_rate: null }),
    );
    expect(data).toBeNull();
    expect(reason).toMatch(/rate/i);
  });

  it("refuses a zero or negative rate rather than quoting Rs. 0", () => {
    expect(buildQuoteDocumentData(withQuote({ quoted_rate: 0 })).data).toBeNull();
    expect(buildQuoteDocumentData(withQuote({ quoted_rate: -5 })).data).toBeNull();
  });

  it("refuses when the quoted product has been deleted", () => {
    const { data, reason } = buildQuoteDocumentData({ ...base, product: null });
    expect(data).toBeNull();
    expect(reason).toMatch(/product/i);
  });

  it("does not treat a brick count as a wall area", () => {
    // 4,000 bricks is not 4,000 sq.ft of wall. Pricing the comparison off the
    // piece count would print a wall cost that is simply wrong.
    const { data } = buildQuoteDocumentData({
      ...base,
      wallCostConfig: realCosts,
    });
    expect(data?.wallCost).toBeNull();
  });

  it("uses the quoted quantity as the wall area for a sq.ft product", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      product: { name: "Wall system", unit: "sqft" },
      wallCostConfig: realCosts,
    });
    expect(data?.wallCost?.areaSqft).toBe(5000);
  });

  it("carries the HSN/SAC code onto the line item", () => {
    const { data } = buildQuoteDocumentData(base);
    expect(data?.lines[0].hsnCode).toBe("681011");
  });

  it("leaves the HSN off when the product has none", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      product: { name: "Interlocking Brick", unit: "piece" },
    });
    expect(data?.lines[0].hsnCode).toBeNull();
  });

  it("states the tax treatment, because a bare total reads as final", () => {
    expect(buildQuoteDocumentData(base).data?.taxNote).toBe(
      "GST extra, as per actual.",
    );
  });

  it("splits other terms into lines and strips the business's own numbering", () => {
    // Their existing terms block reads "1.Payment : ...". The document numbers
    // the list itself, so a pasted "1." must not become "1. 1.".
    const { data } = buildQuoteDocumentData(base);
    expect(data?.terms.additional).toEqual([
      "The price is inclusive of loading, unloading and transportation.",
      "Road access for an Eicher vehicle is required.",
    ]);
  });

  it("prints the bank block so the advance can actually be paid", () => {
    const { data } = buildQuoteDocumentData(base);
    expect(data?.bank?.accountNumber).toBe("510909010289320");
    expect(data?.bank?.ifsc).toBe("CIUB0000389");
    expect(data?.bank?.upiNumber).toBe("6383579119");
  });

  it("drops the bank block entirely when no account is on file", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      factory: { ...base.factory, bank_account_number: null, upi_number: null },
    });
    // Half a payment box is worse than none — a customer would try to pay to it.
    expect(data?.bank).toBeNull();
  });

  it("keeps the block when only UPI is on file", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      factory: { ...base.factory, bank_account_number: null },
    });
    expect(data?.bank?.upiNumber).toBe("6383579119");
    expect(data?.bank?.accountNumber).toBeNull();
  });

  it("omits company facts the business has not entered — never invents them", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      factory: { name: "Maiyuri Bricks" },
    });
    expect(data?.company.gstin).toBeNull();
    expect(data?.company.address).toBeNull();
    expect(data?.company.legalName).toBeNull();
    expect(data?.terms.payment).toBeNull();
    expect(data?.terms.delivery).toBeNull();
    expect(data?.footerNote).toBeNull();
  });

  it("treats a blank string as absent", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      factory: { ...base.factory, gstin: "   ", payment_terms: "" },
    });
    expect(data?.company.gstin).toBeNull();
    expect(data?.terms.payment).toBeNull();
  });

  it("falls back to the factory pin address only when no registered address is set", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      factory: { ...base.factory, registered_address: null },
    });
    expect(data?.company.address).toBe("Factory pin address");
  });

  it("marks the total delivered unless the quote is explicitly ex-factory", () => {
    expect(buildQuoteDocumentData(base).data?.deliveryIncluded).toBe(true);
    expect(
      buildQuoteDocumentData(withQuote({ show_transport: false })).data
        ?.deliveryIncluded,
    ).toBe(false);
  });

  it("names an unidentified lead 'Customer' rather than printing null", () => {
    const { data } = buildQuoteDocumentData({ ...base, lead: null });
    expect(data?.customer.name).toBe("Customer");
    expect(data?.customer.phone).toBeNull();
  });

  it("falls back from site location to region", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      lead: { ...base.lead, site_location: null },
    });
    expect(data?.customer.location).toBe("West");
  });

  it("falls back to the quote's rep phone when the owner has none", () => {
    const { data } = buildQuoteDocumentData({
      ...base,
      rep: { name: "Ganesh", phone: null },
    });
    expect(data?.rep.phone).toBe("919876543210");
  });
});

const realCosts: WallCostConfig = {
  interlock: { masonry_units: 55, mortar_cement: 8, plastering: 0, labour: 22 },
  red_brick: { masonry_units: 48, mortar_cement: 18, plastering: 35, labour: 38 },
  aac: { masonry_units: 60, mortar_cement: 14, plastering: 32, labour: 30 },
  is_seeded_placeholder: false,
};

describe("buildWallCostBlock", () => {
  it("refuses to print the seeded placeholder costs", () => {
    // These numbers ship with the migration so the feature renders in dev.
    // On a document a customer forwards to a contractor they would be a
    // fabricated claim about construction economics.
    expect(
      buildWallCostBlock({ ...realCosts, is_seeded_placeholder: true }, 1200),
    ).toBeNull();
  });

  it("puts our system first, with no delta against itself", () => {
    const block = buildWallCostBlock(realCosts, 1200);
    expect(block?.rows[0].label).toBe("Maiyuri interlocking blocks");
    expect(block?.rows[0].deltaVsInterlock).toBe(0);
    expect(block?.rows).toHaveLength(3);
  });

  it("computes the difference over the whole wall", () => {
    const block = buildWallCostBlock(realCosts, 1200);
    const redBrick = block?.rows.find((r) => r.label.includes("red brick"));
    // Red brick 139/sqft vs interlock 85/sqft = 54 × 1200.
    expect(redBrick?.perSqft).toBe(139);
    expect(redBrick?.deltaVsInterlock).toBe(64_800);
    expect(redBrick?.buildTotal).toBe(166_800);
  });

  it("shows nothing when there is no wall area or no config", () => {
    expect(buildWallCostBlock(realCosts, null)).toBeNull();
    expect(buildWallCostBlock(null, 1200)).toBeNull();
  });

  it("only claims a saving when interlock is genuinely cheapest", () => {
    const expensive: WallCostConfig = {
      ...realCosts,
      interlock: {
        masonry_units: 300,
        mortar_cement: 0,
        plastering: 0,
        labour: 0,
      },
    };
    expect(buildWallCostBlock(expensive, 1200)?.interlockIsCheapest).toBe(false);
  });
});

describe("buildArgument", () => {
  const copyMap = {
    en: {
      "objection.section_headline": "Is it strong enough?",
      "objection.answer": "Tested to 7 N/mm² before dispatch.",
      "objection.reassurance": "See the test yourself.",
      "cta.section_headline": "Visit the factory",
      "cta.route_explainer": "Twenty minutes, any Saturday.",
    },
    ta: { "objection.answer": "தமிழ் பதில்" },
  };

  it("reads the objection and the next step from the call's copy", () => {
    const { objection, nextStep } = buildArgument(copyMap);
    expect(objection?.headline).toBe("Is it strong enough?");
    expect(objection?.answer).toBe("Tested to 7 N/mm² before dispatch.");
    expect(nextStep?.headline).toBe("Visit the factory");
    expect(nextStep?.description).toBe("Twenty minutes, any Saturday.");
  });

  it("takes English even when the quote's default language is Tamil", () => {
    // Core PDF fonts carry no Tamil glyphs — Tamil copy would print as blanks.
    expect(buildArgument(copyMap).objection?.answer).not.toContain("தமிழ்");
  });

  it("drops the objection block when there is no answer to give", () => {
    const { objection } = buildArgument({
      en: { "objection.section_headline": "Is it strong enough?" },
      ta: {},
    });
    expect(objection).toBeNull();
  });

  it("keeps an answer that arrived without a headline", () => {
    const { objection } = buildArgument({
      en: { "objection.answer": "Tested to 7 N/mm²." },
      ta: {},
    });
    expect(objection?.headline).toBe("About your main concern");
  });

  it("falls back to the CTA label when there is no section headline", () => {
    const { nextStep } = buildArgument({
      en: { "cta.primary_cta": "Book a visit" },
      ta: {},
    });
    expect(nextStep?.headline).toBe("Book a visit");
  });

  it("returns nothing at all for a quote with no copy", () => {
    expect(buildArgument(null)).toEqual({ objection: null, nextStep: null });
  });
});

describe("formatQuoteDate", () => {
  it("renders in IST, so an evening-UTC quote is not dated a day early", () => {
    // 20:00 UTC on 7 Aug is already 8 Aug in Chennai.
    expect(formatQuoteDate("2026-08-07T20:00:00.000Z")).toBe("8 Aug 2026");
  });

  it("returns null for missing or unparseable dates", () => {
    expect(formatQuoteDate(null)).toBeNull();
    expect(formatQuoteDate("not a date")).toBeNull();
  });
});

describe("isExpired", () => {
  it("keeps a quote valid for the whole of its last day", () => {
    expect(isExpired("2026-08-23", new Date("2026-08-23T18:00:00.000Z"))).toBe(
      false,
    );
  });

  it("expires the day after", () => {
    expect(isExpired("2026-08-23", new Date("2026-08-24T06:00:00.000Z"))).toBe(
      true,
    );
  });

  it("never expires a quote with no expiry set", () => {
    expect(isExpired(null, new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("quoteFilename", () => {
  it("builds a findable filename", () => {
    expect(quoteFilename("MB-2026-0042", "Murali")).toBe(
      "Maiyuri-Quote-MB-2026-0042-Murali.pdf",
    );
  });

  it("survives a name with punctuation and spaces", () => {
    expect(quoteFilename("MB-2026-0042", "R. Kumar & Sons")).toBe(
      "Maiyuri-Quote-MB-2026-0042-R-Kumar-Sons.pdf",
    );
  });

  it("skips the number when one has not been assigned", () => {
    expect(quoteFilename(null, "Murali")).toBe("Maiyuri-Quote-Murali.pdf");
  });
});

describe("multi-product quotes", () => {
  const twoLines: QuoteDocumentSources = {
    ...base,
    quote: {
      ...base.quote,
      pricing_config: {
        ...base.quote.pricing_config,
        items: [
          { product_id: "prod-1", quantity: 40_000, rate: 52 },
          { product_id: "prod-2", quantity: 5_000, rate: 44 },
        ],
      },
    },
    productsById: {
      "prod-1": { name: '8" Mud Interlock', unit: "piece", hsn_code: "681011" },
      "prod-2": { name: '6" Mud Interlock', unit: "piece", hsn_code: "681011" },
    },
  };

  it("prints one line per item, each at its own rate", () => {
    const { data } = buildQuoteDocumentData(twoLines);
    expect(data?.lines).toHaveLength(2);
    expect(data?.lines[0]).toMatchObject({
      product: '8" Mud Interlock',
      quantity: 40_000,
      rate: 52,
      amount: 2_080_000,
    });
    expect(data?.lines[1]).toMatchObject({
      product: '6" Mud Interlock',
      rate: 44,
      amount: 220_000,
    });
  });

  it("totals every line, not just the first", () => {
    const { data } = buildQuoteDocumentData(twoLines);
    expect(data?.total).toBe(2_080_000 + 220_000);
  });

  it("drops a line whose product has been deleted rather than printing a nameless charge", () => {
    const { data } = buildQuoteDocumentData({
      ...twoLines,
      productsById: { "prod-1": { name: '8" Mud Interlock', unit: "piece", hsn_code: null } },
    });
    expect(data?.lines).toHaveLength(1);
    expect(data?.total).toBe(2_080_000);
  });

  it("refuses the document when every quoted product has gone", () => {
    const { data, reason } = buildQuoteDocumentData({ ...twoLines, productsById: {} });
    expect(data).toBeNull();
    expect(reason).toMatch(/no longer exist/i);
  });

  it("leaves single-product quotes exactly as they were", () => {
    const { data } = buildQuoteDocumentData(base);
    expect(data?.lines).toHaveLength(1);
    expect(data?.total).toBe(32 * 5000);
  });

  it("blocks sharing when any line is unpriced, naming the line", () => {
    const { data, reason } = buildQuoteDocumentData({
      ...twoLines,
      quote: {
        ...twoLines.quote,
        pricing_config: {
          ...twoLines.quote.pricing_config,
          items: [
            { product_id: "prod-1", quantity: 40_000, rate: 52 },
            { product_id: "prod-2", quantity: 5_000, rate: 0 },
          ],
        },
      },
    });
    expect(data).toBeNull();
    expect(reason).toMatch(/Line 2/);
  });
});
