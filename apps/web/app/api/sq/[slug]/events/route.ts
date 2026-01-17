export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, notFound, error, parseBody } from "@/lib/api-utils";
import { smartQuoteEventSchema } from "@maiyuri/shared";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/sq/[slug]/events
 *
 * Public endpoint to track customer interactions with Smart Quote pages.
 * No authentication required (for anonymous tracking).
 *
 * Body:
 * - event_type: 'view' | 'scroll' | 'section_view' | 'cta_click' | 'lang_toggle' | 'form_submit'
 * - section_key?: string (optional, for section_view events)
 * - payload?: object (optional, additional event data)
 *
 * Returns: { tracked: true }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 10) {
      return notFound("Invalid link");
    }

    // Parse and validate request body
    const parsed = await parseBody(request, smartQuoteEventSchema);
    if (parsed.error) return parsed.error;

    const { event_type, section_key, payload } = parsed.data;

    // Get smart quote ID from slug
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("smart_quotes")
      .select("id")
      .eq("link_slug", slug)
      .single();

    if (quoteError || !quote) {
      return notFound("Quote not found");
    }

    // Insert event
    const { error: insertError } = await supabaseAdmin
      .from("smart_quote_events")
      .insert({
        smart_quote_id: quote.id,
        event_type,
        section_key: section_key ?? null,
        payload: {
          ...(payload ?? {}),
          timestamp: new Date().toISOString(),
          user_agent: request.headers.get("user-agent") ?? undefined,
        },
      });

    if (insertError) {
      console.error("[SmartQuoteEvents] Insert error:", insertError);
      // Don't fail the request for analytics errors
      // Just log and return success
    }

    return success({ tracked: true });
  } catch (err) {
    console.error("[SmartQuoteEvents] Error tracking event:", err);
    // Analytics should never block the customer experience
    return success({ tracked: false });
  }
}
