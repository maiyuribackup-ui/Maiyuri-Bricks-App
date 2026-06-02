export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, notFound } from "@/lib/api-utils";

/**
 * GET /api/smart-quotes/[id]/engagement
 *
 * Aggregates smart_quote_events so staff can see whether the customer engaged:
 * viewed?, last viewed, # section views, language toggled, and — the intent
 * signal — whether they tapped the WhatsApp CTA. Authenticated.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return error("Authentication required", 401);

    const { data: quote } = await supabaseAdmin
      .from("smart_quotes")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!quote) return notFound("Quote not found");

    const { data: events } = await supabaseAdmin
      .from("smart_quote_events")
      .select("event_type, section_key, created_at")
      .eq("smart_quote_id", id)
      .order("created_at", { ascending: true });

    const rows = events ?? [];
    const views = rows.filter((e) => e.event_type === "view");
    const sectionViews = rows.filter((e) => e.event_type === "section_view");
    const ctaClicks = rows.filter((e) => e.event_type === "cta_click");
    const langToggles = rows.filter((e) => e.event_type === "lang_toggle");

    return success({
      viewed: views.length > 0,
      viewCount: views.length,
      lastViewedAt: views.length ? views[views.length - 1].created_at : null,
      sectionViewCount: sectionViews.length,
      sectionsSeen: Array.from(
        new Set(sectionViews.map((e) => e.section_key).filter(Boolean)),
      ),
      langToggled: langToggles.length > 0,
      ctaClicked: ctaClicks.length > 0,
      lastCtaAt: ctaClicks.length ? ctaClicks[ctaClicks.length - 1].created_at : null,
      totalEvents: rows.length,
    });
  } catch (err) {
    console.error("Smart Quote engagement error:", err);
    return error("Internal server error", 500);
  }
}
