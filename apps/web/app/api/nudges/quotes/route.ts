/**
 * AI Nudging System - Quote Pending Check API
 *
 * GET/POST /api/nudges/quotes
 *
 * Checks for stale Smart Quotes and sends nudges:
 * 1. Quotes created but never viewed (2+ days old)
 * 2. Quotes viewed but no form submission (3+ days since view)
 *
 * Designed to be triggered by Vercel Cron or manual trigger.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import type { Lead } from "@maiyuri/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

// Thresholds for stale quotes
const DAYS_UNTIL_NEVER_VIEWED_NUDGE = 2;
const DAYS_UNTIL_NO_SUBMISSION_NUDGE = 3;

interface StaleQuote {
  id: string;
  link_slug: string;
  lead_id: string;
  created_at: string;
  last_viewed: string | null;
  has_submission: boolean;
  lead: Lead | null;
}

/**
 * Format quote pending nudge message
 */
function formatQuotePendingMessage(
  quote: StaleQuote,
  nudgeType: "never_viewed" | "no_submission",
): string {
  const lines: string[] = [];
  const lead = quote.lead;
  const quoteUrl = `${APP_URL}/sq/${quote.link_slug}`;
  const leadUrl = lead ? `${APP_URL}/leads/${lead.id}` : null;

  if (nudgeType === "never_viewed") {
    lines.push(`📋 *Quote Never Viewed*`);
    lines.push(``);
    lines.push(`*Lead:* ${lead?.name || "Unknown"}`);
    if (lead?.contact) {
      lines.push(`📱 ${lead.contact}`);
    }
    const daysAgo = Math.floor(
      (Date.now() - new Date(quote.created_at).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    lines.push(`⏰ Quote sent ${daysAgo} days ago`);
    lines.push(``);
    lines.push(`💡 Customer hasn't opened the quote yet.`);
    lines.push(`Consider following up via WhatsApp or call!`);
  } else {
    lines.push(`📋 *Quote Viewed - No Response*`);
    lines.push(``);
    lines.push(`*Lead:* ${lead?.name || "Unknown"}`);
    if (lead?.contact) {
      lines.push(`📱 ${lead.contact}`);
    }
    if (quote.last_viewed) {
      const viewedDaysAgo = Math.floor(
        (Date.now() - new Date(quote.last_viewed).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      lines.push(`👀 Last viewed ${viewedDaysAgo} days ago`);
    }
    lines.push(``);
    lines.push(`💡 Customer viewed but didn't respond.`);
    lines.push(`They might need more info or have questions!`);
  }

  lines.push(``);
  lines.push(`[View Quote](${quoteUrl})`);
  if (leadUrl) {
    lines.push(`[Lead Details](${leadUrl})`);
  }

  return lines.join("\n");
}

/**
 * Check if we already nudged for this quote today
 */
async function wasNudgedToday(quoteId: string): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabaseAdmin
    .from("nudge_history")
    .select("id")
    .eq("nudge_type", "quote_pending")
    .gte("sent_at", `${today}T00:00:00Z`)
    .lt("sent_at", `${today}T23:59:59Z`)
    .contains("metadata", { quote_id: quoteId })
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * Find quotes that were never viewed (2+ days old)
 */
async function findNeverViewedQuotes(): Promise<StaleQuote[]> {
  const cutoffDate = new Date(
    Date.now() - DAYS_UNTIL_NEVER_VIEWED_NUDGE * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Get quotes created before cutoff date
  const { data: quotes, error } = await supabaseAdmin
    .from("smart_quotes")
    .select(
      `
      id,
      link_slug,
      lead_id,
      created_at,
      leads:lead_id (
        id,
        name,
        contact,
        status,
        assigned_staff
      )
    `,
    )
    .lt("created_at", cutoffDate)
    .not("lead_id", "is", null);

  if (error || !quotes) {
    console.error("[Quote Nudge] Error fetching quotes:", error);
    return [];
  }

  // For each quote, check if it has any view events
  const staleQuotes: StaleQuote[] = [];

  for (const quote of quotes) {
    // Check for view events
    const { data: events } = await supabaseAdmin
      .from("smart_quote_events")
      .select("created_at")
      .eq("smart_quote_id", quote.id)
      .eq("event_type", "view")
      .limit(1);

    // If no view events, it's never been viewed
    if (!events || events.length === 0) {
      staleQuotes.push({
        id: quote.id,
        link_slug: quote.link_slug,
        lead_id: quote.lead_id,
        created_at: quote.created_at,
        last_viewed: null,
        has_submission: false,
        lead: quote.leads as unknown as Lead | null,
      });
    }
  }

  return staleQuotes;
}

/**
 * Find quotes that were viewed but no form submission (3+ days since view)
 */
async function findNoSubmissionQuotes(): Promise<StaleQuote[]> {
  const cutoffDate = new Date(
    Date.now() - DAYS_UNTIL_NO_SUBMISSION_NUDGE * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Get quotes with view events but no submission
  const { data: quotes, error } = await supabaseAdmin
    .from("smart_quotes")
    .select(
      `
      id,
      link_slug,
      lead_id,
      created_at,
      leads:lead_id (
        id,
        name,
        contact,
        status,
        assigned_staff
      )
    `,
    )
    .not("lead_id", "is", null);

  if (error || !quotes) {
    console.error("[Quote Nudge] Error fetching quotes:", error);
    return [];
  }

  const staleQuotes: StaleQuote[] = [];

  for (const quote of quotes) {
    // Get view events
    const { data: viewEvents } = await supabaseAdmin
      .from("smart_quote_events")
      .select("created_at")
      .eq("smart_quote_id", quote.id)
      .eq("event_type", "view")
      .order("created_at", { ascending: false })
      .limit(1);

    // Skip if never viewed
    if (!viewEvents || viewEvents.length === 0) continue;

    const lastViewed = viewEvents[0].created_at;

    // Check if last view was before cutoff
    if (new Date(lastViewed) > new Date(cutoffDate)) continue;

    // Check for form_submit events
    const { data: submitEvents } = await supabaseAdmin
      .from("smart_quote_events")
      .select("id")
      .eq("smart_quote_id", quote.id)
      .eq("event_type", "form_submit")
      .limit(1);

    // If no submission, add to stale quotes
    if (!submitEvents || submitEvents.length === 0) {
      staleQuotes.push({
        id: quote.id,
        link_slug: quote.link_slug,
        lead_id: quote.lead_id,
        created_at: quote.created_at,
        last_viewed: lastViewed,
        has_submission: false,
        lead: quote.leads as unknown as Lead | null,
      });
    }
  }

  return staleQuotes;
}

/**
 * Handle quote pending check (GET or POST)
 */
async function handleQuotePendingCheck(
  request: NextRequest,
): Promise<NextResponse> {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isManualTrigger = request.method === "POST";

  if (cronSecret && !isManualTrigger && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Quote Nudge] Starting stale quote check...");

  try {
    const errors: string[] = [];
    let nudgesSent = 0;
    const historyRecords: Array<{
      lead_id: string;
      rule_id: string | null;
      nudge_type: string;
      message: string;
      channel: string;
      recipient_user_id: string | null;
      delivered: boolean;
      metadata: Record<string, unknown>;
    }> = [];

    // Find never-viewed quotes
    const neverViewed = await findNeverViewedQuotes();
    console.log(
      `[Quote Nudge] Found ${neverViewed.length} never-viewed quotes`,
    );

    // Find no-submission quotes
    const noSubmission = await findNoSubmissionQuotes();
    console.log(
      `[Quote Nudge] Found ${noSubmission.length} viewed-no-submission quotes`,
    );

    // Process never-viewed quotes
    for (const quote of neverViewed) {
      // Skip if already nudged today
      if (await wasNudgedToday(quote.id)) continue;

      // Get assigned staff's Telegram chat ID
      let targetChatId: string | undefined;
      let recipientUserId: string | null = null;

      if (quote.lead?.assigned_staff) {
        const { data: staffUser } = await supabaseAdmin
          .from("users")
          .select("id, telegram_chat_id")
          .eq("id", quote.lead.assigned_staff)
          .single();

        if (staffUser?.telegram_chat_id) {
          targetChatId = staffUser.telegram_chat_id;
          recipientUserId = staffUser.id;
        }
      }

      if (!targetChatId) {
        targetChatId = process.env.TELEGRAM_CHAT_ID;
      }

      if (!targetChatId) continue;

      const message = formatQuotePendingMessage(quote, "never_viewed");
      const result = await sendTelegramMessage(message, targetChatId);

      if (result.success) {
        nudgesSent++;
        historyRecords.push({
          lead_id: quote.lead_id,
          rule_id: null,
          nudge_type: "quote_pending",
          message: message.slice(0, 500),
          channel: "telegram",
          recipient_user_id: recipientUserId,
          delivered: true,
          metadata: {
            quote_id: quote.id,
            quote_slug: quote.link_slug,
            sub_type: "never_viewed",
          },
        });
      } else {
        errors.push(
          `Failed to send nudge for quote ${quote.id}: ${result.error}`,
        );
      }
    }

    // Process no-submission quotes
    for (const quote of noSubmission) {
      // Skip if already nudged today
      if (await wasNudgedToday(quote.id)) continue;

      // Get assigned staff's Telegram chat ID
      let targetChatId: string | undefined;
      let recipientUserId: string | null = null;

      if (quote.lead?.assigned_staff) {
        const { data: staffUser } = await supabaseAdmin
          .from("users")
          .select("id, telegram_chat_id")
          .eq("id", quote.lead.assigned_staff)
          .single();

        if (staffUser?.telegram_chat_id) {
          targetChatId = staffUser.telegram_chat_id;
          recipientUserId = staffUser.id;
        }
      }

      if (!targetChatId) {
        targetChatId = process.env.TELEGRAM_CHAT_ID;
      }

      if (!targetChatId) continue;

      const message = formatQuotePendingMessage(quote, "no_submission");
      const result = await sendTelegramMessage(message, targetChatId);

      if (result.success) {
        nudgesSent++;
        historyRecords.push({
          lead_id: quote.lead_id,
          rule_id: null,
          nudge_type: "quote_pending",
          message: message.slice(0, 500),
          channel: "telegram",
          recipient_user_id: recipientUserId,
          delivered: true,
          metadata: {
            quote_id: quote.id,
            quote_slug: quote.link_slug,
            sub_type: "no_submission",
            days_since_view: quote.last_viewed
              ? Math.floor(
                  (Date.now() - new Date(quote.last_viewed).getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : null,
          },
        });
      } else {
        errors.push(
          `Failed to send nudge for quote ${quote.id}: ${result.error}`,
        );
      }
    }

    // Bulk insert history records
    if (historyRecords.length > 0) {
      const { error: historyError } = await supabaseAdmin
        .from("nudge_history")
        .insert(historyRecords);

      if (historyError) {
        console.error("[Quote Nudge] Failed to record history:", historyError);
        errors.push("Failed to record nudge history");
      }
    }

    console.log(`[Quote Nudge] Completed: ${nudgesSent} nudges sent`);

    return NextResponse.json({
      success: errors.length === 0,
      message: `Processed ${neverViewed.length + noSubmission.length} stale quotes, sent ${nudgesSent} nudges`,
      data: {
        never_viewed_found: neverViewed.length,
        no_submission_found: noSubmission.length,
        nudges_sent: nudgesSent,
        errors,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Quote Nudge] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Quote check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleQuotePendingCheck(request);
}

export async function POST(request: NextRequest) {
  return handleQuotePendingCheck(request);
}
