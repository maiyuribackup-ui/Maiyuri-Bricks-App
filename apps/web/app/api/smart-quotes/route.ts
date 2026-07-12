export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/supabase-server";
import { success, error } from "@/lib/api-utils";

export interface QuoteInboxRow {
  id: string;
  link_slug: string;
  created_at: string;
  lead: {
    id: string;
    name: string;
    contact: string | null;
    pipeline_stage: string | null;
    assigned_staff: string | null;
  } | null;
  viewCount: number;
  lastViewedAt: string | null;
  sectionViewCount: number;
  ctaClicked: boolean;
  lastEventAt: string | null;
}

/**
 * GET /api/smart-quotes — the Quotes Inbox.
 * Every quote ever sent, newest first, with the engagement signals that say
 * "this customer is warm": opens, sections read, WhatsApp CTA taps.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return error("Authentication required", 401);

    const { data: quotes, error: qErr } = await supabaseAdmin
      .from("smart_quotes")
      .select(
        "id, link_slug, created_at, lead:leads(id, name, contact, pipeline_stage, assigned_staff)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (qErr) {
      console.error("[QuotesInbox] fetch failed:", qErr);
      return error("Failed to load quotes", 500);
    }

    const ids = (quotes ?? []).map((q) => q.id);
    const eventsByQuote = new Map<
      string,
      { views: number; lastView: string | null; sections: number; cta: boolean; last: string | null }
    >();
    if (ids.length) {
      const { data: events } = await supabaseAdmin
        .from("smart_quote_events")
        .select("smart_quote_id, event_type, created_at")
        .in("smart_quote_id", ids)
        .order("created_at", { ascending: true });
      for (const e of events ?? []) {
        const agg =
          eventsByQuote.get(e.smart_quote_id) ??
          { views: 0, lastView: null, sections: 0, cta: false, last: null };
        if (e.event_type === "view") {
          agg.views += 1;
          agg.lastView = e.created_at;
        } else if (e.event_type === "section_view") {
          agg.sections += 1;
        } else if (e.event_type === "cta_click") {
          agg.cta = true;
        }
        agg.last = e.created_at;
        eventsByQuote.set(e.smart_quote_id, agg);
      }
    }

    const rows: QuoteInboxRow[] = (quotes ?? []).map((q) => {
      const agg = eventsByQuote.get(q.id);
      // Supabase types joined rows as arrays; normalise to a single object.
      const lead = Array.isArray(q.lead) ? (q.lead[0] ?? null) : q.lead;
      return {
        id: q.id,
        link_slug: q.link_slug,
        created_at: q.created_at,
        lead,
        viewCount: agg?.views ?? 0,
        lastViewedAt: agg?.lastView ?? null,
        sectionViewCount: agg?.sections ?? 0,
        ctaClicked: agg?.cta ?? false,
        lastEventAt: agg?.last ?? null,
      };
    });

    return success<QuoteInboxRow[]>(rows);
  } catch (err) {
    console.error("[QuotesInbox] error:", err);
    return error("Internal server error", 500);
  }
}
