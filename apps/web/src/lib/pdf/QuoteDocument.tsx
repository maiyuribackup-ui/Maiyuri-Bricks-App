/**
 * The Maiyuri Bricks quotation, as a real document.
 *
 * A customer forwards this to a contractor, a parent, or a bank, so it has to
 * stand on its own: who quoted, what for, at what rate, until when, and on what
 * terms. Rendered server-side by @react-pdf/renderer — no browser, no print
 * dialog, so every recipient gets the identical file.
 *
 * Honesty rules baked in:
 *   - Every commercial block is omitted when its facts are absent. A missing
 *     GSTIN prints nothing; it never prints a placeholder.
 *   - The rate shown is the engineer's rate. Nothing here recomputes a price.
 *   - No testimonials, certifications or project photography appear, because
 *     none have been confirmed to exist (PRODUCT.md, Evidence on Hand).
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// DESIGN.md palette. Kept literal: the PDF renderer has no access to CSS tokens.
const C = {
  brick: "#7a2817",
  redSoil: "#c0562f",
  ink: "#4a3428",
  inkMuted: "#7d6653",
  cream: "#fbf5ea",
  border: "#efe3d2",
  good: "#3f7d4d",
};

export interface QuoteLine {
  product: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

/**
 * "Total cost to build" for one wall system. Founder-owned numbers, never
 * ours — omitted entirely while they are still the seeded placeholders.
 */
export interface WallCostRow {
  label: string;
  perSqft: number;
  buildTotal: number;
  /** Rupees more than interlock over the same wall area; 0 for interlock. */
  deltaVsInterlock: number;
}

export interface WallCostBlock {
  areaSqft: number;
  rows: WallCostRow[];
  /** Only claim a saving when the arithmetic actually shows one. */
  interlockIsCheapest: boolean;
}

/** The concern the customer actually raised on the call, answered. */
export interface ObjectionBlock {
  headline: string;
  answer: string;
  reassurance: string | null;
}

/** The one next step this customer was routed to. */
export interface NextStepBlock {
  headline: string;
  description: string | null;
}

export interface QuoteDocumentData {
  quoteNumber: string | null;
  quotedOn: string;
  validUntil: string | null;
  company: {
    name: string;
    legalName: string | null;
    gstin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
    location: string | null;
  };
  lines: QuoteLine[];
  total: number;
  deliveryIncluded: boolean;
  distanceKm: number | null;
  priceNote: string | null;
  terms: { payment: string | null; delivery: string | null };
  rep: { name: string | null; phone: string | null };
  footerNote: string | null;
  /**
   * Page 2 — the argument, not the invoice. Every block is optional: whichever
   * are absent, the page shrinks or disappears entirely rather than padding
   * itself with filler.
   */
  wallCost: WallCostBlock | null;
  objection: ObjectionBlock | null;
  nextStep: NextStepBlock | null;
}

const inr = (n: number) =>
  "Rs. " + Math.round(n).toLocaleString("en-IN");

const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 10,
    color: C.ink,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  // Letterhead
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: C.brick,
    paddingBottom: 12,
  },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.brick },
  tagline: { fontSize: 8, color: C.inkMuted, marginTop: 3 },
  companyMeta: { fontSize: 8, color: C.inkMuted, textAlign: "right", lineHeight: 1.5 },

  docTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginTop: 18,
    letterSpacing: 1.2,
  },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  metaBlock: { flexDirection: "row", gap: 22 },
  metaLabel: { fontSize: 7.5, color: C.inkMuted, letterSpacing: 0.6 },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 2 },

  // Customer
  card: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 12,
    marginTop: 16,
    backgroundColor: C.cream,
  },
  cardLabel: { fontSize: 7.5, color: C.inkMuted, letterSpacing: 0.6, marginBottom: 4 },
  customerName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink },
  customerMeta: { fontSize: 9, color: C.inkMuted, marginTop: 2 },

  // Table
  table: { marginTop: 18, borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  th: {
    flexDirection: "row",
    backgroundColor: C.cream,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  thText: { fontSize: 7.5, color: C.inkMuted, letterSpacing: 0.6 },
  cellProduct: { flex: 3 },
  cellNum: { flex: 1.2, textAlign: "right" },
  productName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink },
  productUnit: { fontSize: 8, color: C.inkMuted, marginTop: 2 },
  num: { fontSize: 10, color: C.ink },

  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: C.cream,
  },
  totalLabel: { fontSize: 9, color: C.inkMuted, marginRight: 14 },
  totalValue: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.brick },

  note: { fontSize: 8, color: C.inkMuted, marginTop: 8, lineHeight: 1.5 },

  // Why Maiyuri
  whyRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  why: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 10,
  },
  whyTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.brick },
  whyBody: { fontSize: 8, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 },

  sectionTitle: {
    fontSize: 8,
    color: C.inkMuted,
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 6,
  },
  termLine: { fontSize: 9, color: C.ink, marginBottom: 4, lineHeight: 1.5 },

  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 26 },
  signBlock: { width: 200 },
  signLine: { borderTopWidth: 1, borderTopColor: C.inkMuted, marginTop: 30, paddingTop: 4 },
  signName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink },
  signRole: { fontSize: 8, color: C.inkMuted, marginTop: 1 },

  // --- Page 2: the argument ---
  pageTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: C.brick,
    marginBottom: 4,
  },
  pageIntro: { fontSize: 9, color: C.inkMuted, lineHeight: 1.6, marginBottom: 4 },

  compareHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 6,
    marginTop: 10,
  },
  compareRow: {
    flexDirection: "row",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: "center",
  },
  compareRowOurs: { backgroundColor: C.cream },
  cellSystem: { flex: 2.4, paddingHorizontal: 8 },
  cellCompare: { flex: 1.3, textAlign: "right", paddingHorizontal: 8 },
  systemName: { fontSize: 10, color: C.ink },
  systemNameOurs: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.brick },
  deltaGood: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.good },
  deltaCost: { fontSize: 10, color: C.ink },

  callout: {
    marginTop: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.redSoil,
    backgroundColor: C.cream,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  calloutTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.brick },
  calloutBody: { fontSize: 9.5, color: C.ink, marginTop: 5, lineHeight: 1.6 },
  calloutMuted: { fontSize: 9, color: C.inkMuted, marginTop: 5, lineHeight: 1.6 },

  nextStep: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 14,
  },
  nextStepTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink },
  nextStepBody: { fontSize: 9.5, color: C.inkMuted, marginTop: 5, lineHeight: 1.6 },
  nextStepContact: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.brick,
    marginTop: 9,
  },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: C.inkMuted },
});

export function QuoteDocument({ data }: { data: QuoteDocumentData }) {
  const {
    quoteNumber, quotedOn, validUntil, company, customer,
    lines, total, deliveryIncluded, distanceKm, priceNote, terms, rep, footerNote,
    wallCost, objection, nextStep,
  } = data;

  const hasTerms = Boolean(terms.payment || terms.delivery);
  // Page 2 exists only if it has something real to say.
  const hasArgument = Boolean(wallCost || objection || nextStep);

  return (
    <Document
      title={`Maiyuri Bricks Quotation ${quoteNumber ?? ""}`.trim()}
      author={company.legalName ?? company.name}
      subject={`Quotation for ${customer.name}`}
    >
      <Page size="A4" style={s.page}>
        {/* Letterhead */}
        <View style={s.head}>
          <View>
            <Text style={s.brand}>MAIYURI BRICKS</Text>
            <Text style={s.tagline}>Built on Strength. Rooted in Trust.</Text>
          </View>
          <View style={s.companyMeta}>
            {company.legalName ? <Text>{company.legalName}</Text> : null}
            {company.address ? <Text>{company.address}</Text> : null}
            {company.phone ? <Text>{company.phone}</Text> : null}
            {company.email ? <Text>{company.email}</Text> : null}
            {company.website ? <Text>{company.website}</Text> : null}
            {/* Omitted entirely when the business has not entered a GSTIN */}
            {company.gstin ? <Text>GSTIN: {company.gstin}</Text> : null}
          </View>
        </View>

        <Text style={s.docTitle}>QUOTATION</Text>

        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            {quoteNumber ? (
              <View>
                <Text style={s.metaLabel}>QUOTE NO.</Text>
                <Text style={s.metaValue}>{quoteNumber}</Text>
              </View>
            ) : null}
            <View>
              <Text style={s.metaLabel}>DATE</Text>
              <Text style={s.metaValue}>{quotedOn}</Text>
            </View>
            {validUntil ? (
              <View>
                <Text style={s.metaLabel}>VALID UNTIL</Text>
                <Text style={s.metaValue}>{validUntil}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Customer */}
        <View style={s.card}>
          <Text style={s.cardLabel}>QUOTATION FOR</Text>
          <Text style={s.customerName}>{customer.name}</Text>
          {customer.phone ? (
            <Text style={s.customerMeta}>{customer.phone}</Text>
          ) : null}
          {customer.location ? (
            <Text style={s.customerMeta}>Site: {customer.location}</Text>
          ) : null}
        </View>

        {/* Line items */}
        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.thText, s.cellProduct]}>PRODUCT</Text>
            <Text style={[s.thText, s.cellNum]}>QUANTITY</Text>
            <Text style={[s.thText, s.cellNum]}>RATE</Text>
            <Text style={[s.thText, s.cellNum]}>AMOUNT</Text>
          </View>

          {lines.map((l, i) => (
            <View style={s.tr} key={i}>
              <View style={s.cellProduct}>
                <Text style={s.productName}>{l.product}</Text>
                <Text style={s.productUnit}>Per {l.unit}</Text>
              </View>
              <Text style={[s.num, s.cellNum]}>
                {l.quantity.toLocaleString("en-IN")}
              </Text>
              <Text style={[s.num, s.cellNum]}>{inr(l.rate)}</Text>
              <Text style={[s.num, s.cellNum]}>{inr(l.amount)}</Text>
            </View>
          ))}

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>
              {deliveryIncluded ? "TOTAL, DELIVERED TO SITE" : "TOTAL"}
            </Text>
            <Text style={s.totalValue}>{inr(total)}</Text>
          </View>
        </View>

        <Text style={s.note}>
          {deliveryIncluded
            ? `This rate includes delivery to your site${
                distanceKm ? ` (${distanceKm} km from our factory)` : ""
              }. There is no separate transport charge.`
            : "Transport is quoted separately."}
          {priceNote ? ` ${priceNote}` : ""}
        </Text>

        {/* Why Maiyuri — the three confirmed positioning claims (PRODUCT.md).
            No testimonials or certifications: none have been confirmed. */}
        <Text style={s.sectionTitle}>WHY MAIYURI</Text>
        <View style={s.whyRow}>
          <View style={s.why}>
            <Text style={s.whyTitle}>Made here, cured properly</Text>
            <Text style={s.whyBody}>
              Tested red soil, machine compacted and fully cured before dispatch
              — not trucked in from another state to crack on the way.
            </Text>
          </View>
          <View style={s.why}>
            <Text style={s.whyTitle}>The price is the price</Text>
            <Text style={s.whyBody}>
              The rate above is what you pay, delivered to your site. No
              transport added at the gate, no surprises on the invoice.
            </Text>
          </View>
          <View style={s.why}>
            <Text style={s.whyTitle}>Come and see</Text>
            <Text style={s.whyBody}>
              Visit the factory. Handle the bricks, see the water and strength
              tests, and watch the demo wall before you decide.
            </Text>
          </View>
        </View>

        {/* Terms — printed only when the business has entered them */}
        {hasTerms ? (
          <>
            <Text style={s.sectionTitle}>TERMS</Text>
            {terms.payment ? (
              <Text style={s.termLine}>Payment: {terms.payment}</Text>
            ) : null}
            {terms.delivery ? (
              <Text style={s.termLine}>Delivery: {terms.delivery}</Text>
            ) : null}
          </>
        ) : null}

        {/* Signature */}
        <View style={s.signRow}>
          <View style={s.signBlock}>
            <View style={s.signLine}>
              <Text style={s.signName}>{rep.name ?? "For Maiyuri Bricks"}</Text>
              <Text style={s.signRole}>
                {rep.phone ? `Maiyuri Bricks · ${rep.phone}` : "Maiyuri Bricks"}
              </Text>
            </View>
          </View>
          <View style={s.signBlock}>
            <View style={s.signLine}>
              <Text style={s.signName}>Customer acceptance</Text>
              <Text style={s.signRole}>Signature &amp; date</Text>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {footerNote ?? "Thank you for considering Maiyuri Bricks."}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* ==================================================================
          Page 2 — why this price is the right one.
          The customer will show page 1 to someone who was not on the call.
          This page answers what that person will ask: is it actually cheaper
          once everything is counted, what about the concern we raised, and
          what happens next. All of it is data already on the quote — the
          founder's own build costs, the objection recorded from the call,
          and the routed next step. Nothing is generated here.
          ================================================================== */}
      {hasArgument && (
        <Page size="A4" style={s.page}>
          <Text style={s.pageTitle}>Before you decide</Text>

          {wallCost && (
            <>
              <Text style={s.sectionTitle}>
                WHAT IT COSTS TO BUILD THE WALL
              </Text>
              <Text style={s.pageIntro}>
                Bricks are one line in a wall. Interlocking blocks need no
                plastering and far less mortar, so the honest comparison is the
                finished wall, not the brick. Below:{" "}
                {wallCost.areaSqft.toLocaleString("en-IN")} sq.ft of wall,
                material and labour together.
              </Text>

              <View style={s.compareHead}>
                <Text style={[s.thText, s.cellSystem]}>WALL SYSTEM</Text>
                <Text style={[s.thText, s.cellCompare]}>PER SQ.FT</Text>
                <Text style={[s.thText, s.cellCompare]}>TOTAL</Text>
                <Text style={[s.thText, s.cellCompare]}>DIFFERENCE</Text>
              </View>

              {wallCost.rows.map((row, i) => {
                const ours = i === 0;
                return (
                  <View
                    key={row.label}
                    style={ours ? [s.compareRow, s.compareRowOurs] : s.compareRow}
                  >
                    <Text
                      style={[
                        ours ? s.systemNameOurs : s.systemName,
                        s.cellSystem,
                      ]}
                    >
                      {row.label}
                    </Text>
                    <Text style={[s.num, s.cellCompare]}>
                      {inr(row.perSqft)}
                    </Text>
                    <Text style={[s.num, s.cellCompare]}>
                      {inr(row.buildTotal)}
                    </Text>
                    <Text
                      style={[
                        row.deltaVsInterlock > 0 ? s.deltaGood : s.deltaCost,
                        s.cellCompare,
                      ]}
                    >
                      {row.deltaVsInterlock > 0
                        ? `+${inr(row.deltaVsInterlock)}`
                        : ours
                          ? "—"
                          : inr(row.deltaVsInterlock)}
                    </Text>
                  </View>
                );
              })}

              <Text style={s.note}>
                {wallCost.interlockIsCheapest
                  ? "The right-hand column is what the same wall costs you more in another material. These are our own build costs, not industry averages."
                  : "These are our own build costs, not industry averages, shown so you can compare like with like."}
              </Text>
            </>
          )}

          {/* The concern this customer actually raised, in our own words. */}
          {objection && (
            <View style={s.callout}>
              <Text style={s.calloutTitle}>{objection.headline}</Text>
              <Text style={s.calloutBody}>{objection.answer}</Text>
              {objection.reassurance ? (
                <Text style={s.calloutMuted}>{objection.reassurance}</Text>
              ) : null}
            </View>
          )}

          {nextStep && (
            <>
              <Text style={s.sectionTitle}>YOUR NEXT STEP</Text>
              <View style={s.nextStep}>
                <Text style={s.nextStepTitle}>{nextStep.headline}</Text>
                {nextStep.description ? (
                  <Text style={s.nextStepBody}>{nextStep.description}</Text>
                ) : null}
                {rep.phone ? (
                  <Text style={s.nextStepContact}>
                    Call or WhatsApp {rep.name ? `${rep.name} on ` : ""}
                    {rep.phone}
                  </Text>
                ) : null}
              </View>
            </>
          )}

          <View style={s.footer} fixed>
            <Text style={s.footerText}>
              {quoteNumber
                ? `Quotation ${quoteNumber} · ${customer.name}`
                : `Quotation for ${customer.name}`}
            </Text>
            <Text
              style={s.footerText}
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          </View>
        </Page>
      )}
    </Document>
  );
}
