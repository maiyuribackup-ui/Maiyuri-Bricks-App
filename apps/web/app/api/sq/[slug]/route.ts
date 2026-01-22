export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, notFound, error } from "@/lib/api-utils";
import type {
  SmartQuote,
  SmartQuoteImage,
  SmartQuotePageKey,
  SmartQuoteWithImages,
} from "@maiyuri/shared";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/sq/[slug]
 *
 * Public endpoint to fetch a Smart Quote by its link slug.
 * This is used by the customer-facing Smart Quote page.
 * No authentication required (secured by unguessable slug).
 *
 * Returns: SmartQuoteWithImages (quote data + resolved images)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 10) {
      return notFound("Invalid link");
    }

    // Fetch the smart quote by slug
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("smart_quotes")
      .select("*")
      .eq("link_slug", slug)
      .single();

    if (quoteError || !quote) {
      return notFound("Quote not found");
    }

    // Fetch images for this quote (lead-specific overrides)
    const { data: overrideImages } = await supabaseAdmin
      .from("smart_quote_images")
      .select("*")
      .eq("smart_quote_id", quote.id);

    // Fetch template images (fallback)
    const { data: templateImages } = await supabaseAdmin
      .from("smart_quote_images")
      .select("*")
      .is("smart_quote_id", null)
      .eq("scope", "template");

    // Resolve images: override > template > null
    const pageKeys: SmartQuotePageKey[] = [
      "entry",
      "climate",
      "cost",
      "objection",
      "cta",
    ];

    const images: Record<SmartQuotePageKey, SmartQuoteImage | null> = {
      entry: null,
      climate: null,
      cost: null,
      objection: null,
      cta: null,
    };

    for (const key of pageKeys) {
      // First check for lead-specific override
      const override = overrideImages?.find((img) => img.page_key === key);
      if (override) {
        images[key] = override as SmartQuoteImage;
        continue;
      }

      // Fall back to template image
      const template = templateImages?.find((img) => img.page_key === key);
      if (template) {
        images[key] = template as SmartQuoteImage;
      }
    }

    // Track view event (fire and forget)
    trackViewEvent(quote.id).catch(console.error);

    // Return quote with resolved images
    const result: SmartQuoteWithImages = {
      ...(quote as SmartQuote),
      images,
    };

    return success(result);
  } catch (err) {
    console.error("[SmartQuote] Error fetching quote:", err);
    return error("Internal server error", 500);
  }
}

/**
 * Track a view event for analytics
 */
async function trackViewEvent(smartQuoteId: string): Promise<void> {
  await supabaseAdmin.from("smart_quote_events").insert({
    smart_quote_id: smartQuoteId,
    event_type: "view",
    payload: {
      timestamp: new Date().toISOString(),
    },
  });
}
