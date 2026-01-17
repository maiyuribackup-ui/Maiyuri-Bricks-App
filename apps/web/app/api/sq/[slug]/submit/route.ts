export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, notFound, error, parseBody } from "@/lib/api-utils";
import { smartQuoteCtaSubmitSchema } from "@maiyuri/shared";
import { sendTelegramMessage } from "@/lib/telegram";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/sq/[slug]/submit
 *
 * Public endpoint for CTA form submission on Smart Quote pages.
 * No authentication required (customer-facing).
 *
 * Body:
 * - name: string (required)
 * - phone: string (required, min 10 chars)
 * - locality?: string (optional)
 * - preferred_time?: string (optional)
 *
 * Actions:
 * 1. Track 'form_submit' event
 * 2. Update lead with form data
 * 3. Send Telegram notification to sales
 *
 * Returns: { submitted: true }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 10) {
      return notFound("Invalid link");
    }

    // Parse and validate request body
    const parsed = await parseBody(request, smartQuoteCtaSubmitSchema);
    if (parsed.error) return parsed.error;

    const { name, phone, locality, preferred_time } = parsed.data;

    // Get smart quote with lead info
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("smart_quotes")
      .select(
        `
        id,
        lead_id,
        route_decision,
        persona,
        stage,
        primary_angle
      `,
      )
      .eq("link_slug", slug)
      .single();

    if (quoteError || !quote) {
      return notFound("Quote not found");
    }

    // Get lead details
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, contact, status")
      .eq("id", quote.lead_id)
      .single();

    // Track form_submit event
    await supabaseAdmin.from("smart_quote_events").insert({
      smart_quote_id: quote.id,
      event_type: "form_submit",
      section_key: "cta",
      payload: {
        name,
        phone,
        locality: locality ?? null,
        preferred_time: preferred_time ?? null,
        route_decision: quote.route_decision,
        timestamp: new Date().toISOString(),
      },
    });

    // Update lead with submission info (append to staff_notes)
    if (lead) {
      const submissionNote = [
        `\n\n---`,
        `Smart Quote Submission (${new Date().toLocaleDateString("en-IN")})`,
        `Name: ${name}`,
        `Phone: ${phone}`,
        locality ? `Locality: ${locality}` : null,
        preferred_time ? `Preferred Time: ${preferred_time}` : null,
        `Route: ${formatRoute(quote.route_decision)}`,
        `---`,
      ]
        .filter(Boolean)
        .join("\n");

      const { data: currentLead } = await supabaseAdmin
        .from("leads")
        .select("staff_notes")
        .eq("id", lead.id)
        .single();

      await supabaseAdmin
        .from("leads")
        .update({
          staff_notes: (currentLead?.staff_notes ?? "") + submissionNote,
          // Update follow_up_date if not already set
          follow_up_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", lead.id);
    }

    // Send Telegram notification
    await sendTelegramNotification({
      leadName: lead?.name ?? name,
      phone,
      locality,
      preferredTime: preferred_time,
      route: quote.route_decision,
      persona: quote.persona,
      stage: quote.stage,
      primaryAngle: quote.primary_angle,
      quoteSlug: slug,
    }).catch(console.error);

    return success({ submitted: true });
  } catch (err) {
    console.error("[SmartQuoteSubmit] Error:", err);
    return error("Failed to submit. Please try again.", 500);
  }
}

/**
 * Format route decision for display
 */
function formatRoute(route: string | null): string {
  const routeLabels: Record<string, string> = {
    site_visit: "Site Visit Request",
    technical_call: "Technical Call Request",
    cost_estimate: "Cost Estimate Request",
    nurture: "General Inquiry",
  };
  return routeLabels[route ?? ""] ?? route ?? "Unknown";
}

/**
 * Send Telegram notification to sales team
 */
async function sendTelegramNotification(data: {
  leadName: string;
  phone: string;
  locality?: string;
  preferredTime?: string;
  route: string | null;
  persona: string | null;
  stage: string | null;
  primaryAngle: string | null;
  quoteSlug: string;
}): Promise<void> {
  const message = [
    `\u{1F4CB} **Smart Quote Submission**`,
    ``,
    `\u{1F464} **Lead:** ${data.leadName}`,
    `\u{1F4DE} **Phone:** ${data.phone}`,
    data.locality ? `\u{1F4CD} **Locality:** ${data.locality}` : null,
    data.preferredTime
      ? `\u{1F552} **Preferred Time:** ${data.preferredTime}`
      : null,
    ``,
    `\u{1F3AF} **Request Type:** ${formatRoute(data.route)}`,
    data.persona ? `\u{1F9D1} **Persona:** ${data.persona}` : null,
    data.stage ? `\u{1F525} **Stage:** ${data.stage}` : null,
    data.primaryAngle ? `\u{1F4A1} **Interest:** ${data.primaryAngle}` : null,
    ``,
    `\u{1F517} [View Quote](${process.env.NEXT_PUBLIC_APP_URL}/sq/${data.quoteSlug})`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendTelegramMessage(message);
}
