export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import {
  success,
  error,
  notFound,
  parseBody,
  forbidden,
} from "@/lib/api-utils";
import { generateSmartQuoteSchema, type SmartQuote } from "@maiyuri/shared";
import {
  generateSmartQuoteContent,
  generateLinkSlug,
} from "@/lib/smart-quote-ai";

/**
 * POST /api/smart-quotes/generate
 *
 * Generates a Smart Quote for a lead based on call recording transcripts.
 * Requires authentication (founder or staff with lead access).
 *
 * Body:
 * - lead_id: string (UUID)
 * - regenerate?: boolean (optional, default false)
 *
 * Returns: SmartQuote
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const parsed = await parseBody(request, generateSmartQuoteSchema);
    if (parsed.error) return parsed.error;

    const { lead_id, regenerate } = parsed.data;

    // Get authenticated user
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return error("Authentication required", 401);
    }

    // Check user role (must be founder or have access to lead)
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return error("User not found", 404);
    }

    // Verify lead exists and user has access
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id, name, assigned_staff, created_by")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return notFound("Lead not found");
    }

    // Check access (founders have full access, others need assignment)
    const isFounder = userData.role === "founder";
    const hasAccess =
      isFounder ||
      lead.assigned_staff === user.id ||
      lead.created_by === user.id;

    if (!hasAccess) {
      return forbidden("You don't have access to this lead");
    }

    // Check if quote already exists
    const { data: existingQuote } = await supabaseAdmin
      .from("smart_quotes")
      .select("id, link_slug")
      .eq("lead_id", lead_id)
      .single();

    if (existingQuote && !regenerate) {
      // Return existing quote
      const { data: fullQuote } = await supabaseAdmin
        .from("smart_quotes")
        .select("*")
        .eq("id", existingQuote.id)
        .single();

      return success<SmartQuote>(fullQuote!);
    }

    // Delete existing quote if regenerating
    if (existingQuote && regenerate) {
      await supabaseAdmin
        .from("smart_quotes")
        .delete()
        .eq("id", existingQuote.id);
    }

    // Get call recordings for this lead
    const { data: recordings } = await supabaseAdmin
      .from("call_recordings")
      .select("transcription_text")
      .eq("lead_id", lead_id)
      .eq("processing_status", "completed")
      .not("transcription_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(5); // Use up to 5 most recent transcripts

    // Combine transcripts
    const combinedTranscript =
      recordings && recordings.length > 0
        ? recordings
            .map((r) => r.transcription_text)
            .filter(Boolean)
            .join("\n\n---\n\n")
        : null;

    if (!combinedTranscript) {
      return error(
        "No transcripts available. Upload call recordings first.",
        400,
      );
    }

    // Generate Smart Quote content using AI pipeline
    console.log("[SmartQuotes] Generating content for lead:", lead_id);
    const aiResult = await generateSmartQuoteContent(
      combinedTranscript,
      lead.name,
    );

    // Generate unique slug
    const linkSlug = generateLinkSlug(12);

    // Insert smart quote
    const { data: smartQuote, error: insertError } = await supabaseAdmin
      .from("smart_quotes")
      .insert({
        lead_id,
        link_slug: linkSlug,
        language_default: aiResult.strategy.language_default,
        persona: aiResult.insights.persona,
        stage: aiResult.insights.stage,
        primary_angle: aiResult.insights.primary_angle,
        secondary_angle: aiResult.insights.secondary_angle,
        route_decision: aiResult.strategy.route_decision,
        top_objections: aiResult.insights.top_objections,
        risk_flags: aiResult.insights.risk_flags,
        scores: aiResult.insights.scores,
        page_config: aiResult.strategy.page_config,
        copy_map: aiResult.copyMap,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[SmartQuotes] Insert error:", insertError);
      return error("Failed to create Smart Quote", 500);
    }

    console.log("[SmartQuotes] Created quote:", smartQuote.id);

    return success<SmartQuote>(smartQuote);
  } catch (err) {
    console.error("[SmartQuotes] Error generating quote:", err);
    return error("Internal server error", 500);
  }
}
