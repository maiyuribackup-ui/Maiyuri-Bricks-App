export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { error, notFound } from "@/lib/api-utils";
import { QuoteDocument } from "@/lib/pdf/QuoteDocument";
import {
  buildQuoteDocumentData,
  isExpired,
  quoteFilename,
} from "@/lib/pdf/quote-document-data";
import type { SmartQuotePricingConfig } from "@maiyuri/shared";

/**
 * GET /api/sq/[slug]/pdf
 *
 * The quotation as a real PDF. Public in the same sense as the quote page —
 * the unguessable slug is the capability — and it prints only what the page
 * already shows the same holder, plus the company's own standing terms.
 *
 * Deliberately NOT here: stage, persona, route_decision, risk flags, scores.
 * A forwarded PDF must not leak how we rated the lead.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length < 10) return notFound("Invalid link");

    const { data: quote } = await supabaseAdmin
      .from("smart_quotes")
      .select(
        "id, lead_id, pricing_config, wall_cost_config, copy_map, quote_number, valid_until, created_at",
      )
      .eq("link_slug", slug)
      .maybeSingle();

    if (!quote) return notFound("Quote not found");

    // An expired quotation is no longer an offer. Printing it fresh today
    // would let a stale rate be presented as current.
    if (isExpired(quote.valid_until, new Date())) {
      return error(
        "This quotation has expired. Please ask us for an updated one.",
        410,
      );
    }

    const pricing = (quote.pricing_config ??
      {}) as Partial<SmartQuotePricingConfig>;

    const [{ data: lead }, { data: factory }] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("name, contact, site_location, site_region, assigned_staff")
        .eq("id", quote.lead_id)
        .maybeSingle(),
      supabaseAdmin
        .from("factory_settings")
        .select(
          "name, legal_name, gstin, registered_address, address, contact_phone, contact_email, website, payment_terms, delivery_terms, additional_terms, tax_note, bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch, upi_number, quote_footer_note",
        )
        .limit(1)
        .maybeSingle(),
    ]);

    const [{ data: product }, { data: rep }] = await Promise.all([
      pricing.default_product
        ? supabaseAdmin
            .from("products")
            .select("name, unit, hsn_code")
            .eq("id", pricing.default_product)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      lead?.assigned_staff
        ? supabaseAdmin
            .from("users")
            .select("name, phone")
            .eq("id", lead.assigned_staff)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const { data, reason } = buildQuoteDocumentData({
      quote: {
        quote_number: quote.quote_number,
        valid_until: quote.valid_until,
        created_at: quote.created_at,
        pricing_config: pricing,
      },
      lead: lead ?? null,
      factory: factory ?? null,
      product: product ?? null,
      rep: rep ?? null,
      wallCostConfig: quote.wall_cost_config,
      copyMap: quote.copy_map,
    });

    if (!data) {
      // 409: the quote exists but is not a document yet. The staff UI blocks
      // sharing for the same reason, so a customer should never see this.
      return error(reason ?? "This quote is not ready to download.", 409);
    }

    // Give the document its permanent number on first download. Idempotent in
    // SQL, so a customer downloading twice keeps the same reference.
    let quoteNumber = data.quoteNumber;
    if (!quoteNumber) {
      const { data: assigned } = await supabaseAdmin.rpc("assign_quote_number", {
        p_quote_id: quote.id,
      });
      if (typeof assigned === "string") {
        quoteNumber = assigned;
        data.quoteNumber = assigned;
      }
    }

    // renderToBuffer is typed as taking a <Document> element specifically, so a
    // component that *returns* one does not match by structure. The cast is
    // safe because QuoteDocument's root element is <Document>.
    type PdfRoot = Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(
      React.createElement(QuoteDocument, { data }) as unknown as PdfRoot,
    );

    // Downloads are a strong buying signal — stronger than a page view, since
    // the customer is forwarding the price to someone else.
    await supabaseAdmin.from("smart_quote_events").insert({
      smart_quote_id: quote.id,
      event_type: "cta_click",
      section_key: "pdf_download",
      payload: { quote_number: quoteNumber, timestamp: new Date().toISOString() },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quoteFilename(
          quoteNumber,
          data.customer.name,
        )}"`,
        // Regenerated on every request so an updated rate is never served stale.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[SmartQuote] PDF render failed:", err);
    return error("Failed to generate the quotation PDF", 500);
  }
}
