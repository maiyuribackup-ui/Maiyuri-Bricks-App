/**
 * GET /api/leads/[id]/feedback
 *
 * Authenticated (dashboard) read of a lead's factory-visit feedback rows,
 * newest first. Powers the FeedbackResultsCard on the lead detail page.
 *
 * Uses the service-role client so staff always see the rows regardless of the
 * public RLS lockdown on `lead_feedback` (writes are server-only; see the
 * submit route + migration 20260528000001).
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data, error: dbError } = await supabaseAdmin
      .from("lead_feedback")
      .select(
        "id, channel, language, rating, impressed, clarity, benefits, concerns, timeline, next_action, next_action_detail, notes, voice_transcript, voice_duration_sec, flags, submitted_at",
      )
      .eq("lead_id", id)
      .order("submitted_at", { ascending: false });

    if (dbError) {
      console.error("[feedback] fetch error:", dbError);
      return error("Failed to fetch feedback", 500);
    }

    return success(data ?? []);
  } catch (err) {
    console.error("[feedback] route error:", err);
    return error("Internal server error", 500);
  }
}
