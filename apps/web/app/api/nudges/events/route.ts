/**
 * AI Nudging System - Event-Driven Triggers API
 *
 * POST /api/nudges/events
 *
 * Handles event-driven nudge notifications:
 * - Hot lead alerts (score crossed threshold)
 * - Call recording processed
 * - Quote pending (not viewed/responded)
 * - Score changes
 * - Objection detected
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramMessage } from "@/lib/telegram";
import { z } from "zod";
import type {
  Lead,
  NudgeEventType,
  EventNudgeInput,
  EventNudgeResponse,
} from "@maiyuri/shared";

export const dynamic = "force-dynamic";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

// Validation schema
const eventNudgeSchema = z.object({
  event_type: z.enum([
    "hot_lead_alert",
    "call_recording_processed",
    "quote_pending",
    "score_increased",
    "score_decreased",
    "objection_detected",
  ]),
  lead_id: z.string().uuid("Invalid lead ID"),
  metadata: z
    .object({
      previous_score: z.number().optional(),
      new_score: z.number().optional(),
      recording_id: z.string().optional(),
      quote_id: z.string().optional(),
      quote_slug: z.string().optional(),
      days_pending: z.number().optional(),
      objections: z.array(z.string()).optional(),
      summary: z.string().optional(),
    })
    .optional(),
});

/**
 * Format event-specific nudge message
 */
function formatEventNudgeMessage(
  eventType: NudgeEventType,
  lead: Lead,
  metadata?: EventNudgeInput["metadata"],
): string {
  const lines: string[] = [];
  const leadUrl = `${APP_URL}/leads/${lead.id}`;

  switch (eventType) {
    case "hot_lead_alert":
      lines.push(`🔥 *HOT LEAD ALERT*`);
      lines.push(``);
      lines.push(`Lead *${lead.name}* just became HOT!`);
      lines.push(`📱 ${lead.contact}`);
      if (metadata?.new_score) {
        lines.push(
          `🎯 Score: ${Math.round(metadata.new_score * 100)}%${metadata.previous_score ? ` (was ${Math.round(metadata.previous_score * 100)}%)` : ""}`,
        );
      }
      if (lead.next_action) {
        lines.push(`💡 Next: ${lead.next_action}`);
      }
      lines.push(``);
      lines.push(`⚡ *Strike while the iron is hot!*`);
      break;

    case "call_recording_processed":
      lines.push(`📞 *Call Recording Processed*`);
      lines.push(``);
      lines.push(`*Lead:* ${lead.name}`);
      lines.push(`📱 ${lead.contact}`);
      if (metadata?.summary) {
        lines.push(``);
        lines.push(`📝 *Summary:*`);
        lines.push(
          metadata.summary.length > 200
            ? `${metadata.summary.slice(0, 200)}...`
            : metadata.summary,
        );
      }
      if (metadata?.objections && metadata.objections.length > 0) {
        lines.push(``);
        lines.push(`⚠️ *Objections Detected:*`);
        metadata.objections.slice(0, 3).forEach((obj) => {
          lines.push(`• ${obj}`);
        });
      }
      lines.push(``);
      lines.push(`🎯 Review the transcription and take action!`);
      break;

    case "quote_pending":
      lines.push(`📋 *Quote Pending Review*`);
      lines.push(``);
      lines.push(`*Lead:* ${lead.name}`);
      lines.push(`📱 ${lead.contact}`);
      if (metadata?.days_pending) {
        lines.push(`⏰ Quote sent ${metadata.days_pending} days ago`);
      }
      if (metadata?.quote_slug) {
        lines.push(`🔗 Quote: ${APP_URL}/sq/${metadata.quote_slug}`);
      }
      lines.push(``);
      lines.push(`💡 Consider following up with the customer!`);
      break;

    case "score_increased":
      lines.push(`📈 *Lead Score Increased*`);
      lines.push(``);
      lines.push(`*Lead:* ${lead.name}`);
      lines.push(`📱 ${lead.contact}`);
      if (metadata?.previous_score !== undefined && metadata?.new_score) {
        const increase = Math.round(
          (metadata.new_score - metadata.previous_score) * 100,
        );
        lines.push(
          `🎯 Score: ${Math.round(metadata.previous_score * 100)}% → ${Math.round(metadata.new_score * 100)}% (+${increase}%)`,
        );
      }
      lines.push(``);
      lines.push(`✨ Lead is showing more interest!`);
      break;

    case "score_decreased":
      lines.push(`📉 *Lead Score Decreased*`);
      lines.push(``);
      lines.push(`*Lead:* ${lead.name}`);
      lines.push(`📱 ${lead.contact}`);
      if (metadata?.previous_score !== undefined && metadata?.new_score) {
        const decrease = Math.round(
          (metadata.previous_score - metadata.new_score) * 100,
        );
        lines.push(
          `🎯 Score: ${Math.round(metadata.previous_score * 100)}% → ${Math.round(metadata.new_score * 100)}% (-${decrease}%)`,
        );
      }
      lines.push(``);
      lines.push(`⚠️ Consider re-engagement strategy`);
      break;

    case "objection_detected":
      lines.push(`⚠️ *Objection Detected*`);
      lines.push(``);
      lines.push(`*Lead:* ${lead.name}`);
      lines.push(`📱 ${lead.contact}`);
      if (metadata?.objections && metadata.objections.length > 0) {
        lines.push(``);
        lines.push(`*Concerns:*`);
        metadata.objections.slice(0, 5).forEach((obj) => {
          lines.push(`• ${obj}`);
        });
      }
      lines.push(``);
      lines.push(`🎯 Address customer concerns promptly!`);
      break;

    default:
      lines.push(`📌 *Lead Update*`);
      lines.push(``);
      lines.push(`*Lead:* ${lead.name}`);
      lines.push(`📱 ${lead.contact}`);
  }

  lines.push(``);
  lines.push(`[View Lead Details](${leadUrl})`);

  return lines.join("\n");
}

/**
 * Check if a similar nudge was sent recently (within 6 hours)
 */
async function wasRecentlySent(
  leadId: string,
  eventType: NudgeEventType,
): Promise<boolean> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from("nudge_history")
    .select("id")
    .eq("lead_id", leadId)
    .eq("nudge_type", eventType)
    .gte("sent_at", sixHoursAgo)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * POST /api/nudges/events - Trigger an event-driven nudge
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const parseResult = eventNudgeSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          nudge_sent: false,
          message: "Validation failed",
          error: JSON.stringify(parseResult.error.flatten().fieldErrors),
        } as EventNudgeResponse,
        { status: 400 },
      );
    }

    const input: EventNudgeInput = parseResult.data;

    // Fetch the lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*, assigned_staff")
      .eq("id", input.lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        {
          success: false,
          nudge_sent: false,
          message: "Lead not found",
          error: "Lead not found",
        } as EventNudgeResponse,
        { status: 404 },
      );
    }

    // Check if similar nudge was sent recently
    const recentlySent = await wasRecentlySent(input.lead_id, input.event_type);
    if (recentlySent) {
      console.log(
        `[Event Nudge] Skipping ${input.event_type} for lead ${input.lead_id} - sent recently`,
      );
      return NextResponse.json({
        success: true,
        nudge_sent: false,
        message: "Similar nudge was sent recently, skipping",
      } as EventNudgeResponse);
    }

    // Determine recipient
    let targetChatId: string | undefined;
    let recipientUserId: string | null = null;

    if (lead.assigned_staff) {
      const { data: staffUser } = await supabaseAdmin
        .from("users")
        .select("id, name, telegram_chat_id")
        .eq("id", lead.assigned_staff)
        .single();

      if (staffUser?.telegram_chat_id) {
        targetChatId = staffUser.telegram_chat_id;
        recipientUserId = staffUser.id;
      }
    }

    // Fall back to default channel
    if (!targetChatId) {
      targetChatId = process.env.TELEGRAM_CHAT_ID;
    }

    if (!targetChatId) {
      return NextResponse.json(
        {
          success: false,
          nudge_sent: false,
          message: "No Telegram channel configured",
          error: "No Telegram channel configured",
        } as EventNudgeResponse,
        { status: 500 },
      );
    }

    // Format and send message
    const message = formatEventNudgeMessage(
      input.event_type,
      lead as Lead,
      input.metadata,
    );
    const result = await sendTelegramMessage(message, targetChatId);

    if (!result.success) {
      console.error(`[Event Nudge] Failed to send:`, result.error);
      return NextResponse.json(
        {
          success: false,
          nudge_sent: false,
          message: `Failed to send nudge: ${result.error}`,
          error: result.error,
        } as EventNudgeResponse,
        { status: 500 },
      );
    }

    // Record in nudge history
    const { error: historyError } = await supabaseAdmin
      .from("nudge_history")
      .insert({
        lead_id: input.lead_id,
        rule_id: null, // Event-driven nudges have no rule
        nudge_type: input.event_type,
        message: message.slice(0, 500),
        channel: "telegram",
        recipient_user_id: recipientUserId,
        delivered: true,
        metadata: {
          event_type: input.event_type,
          ...input.metadata,
        },
      });

    if (historyError) {
      console.error("[Event Nudge] Failed to record history:", historyError);
      // Don't fail the request, nudge was still sent
    }

    console.log(
      `[Event Nudge] Sent ${input.event_type} nudge for lead ${lead.id} (${lead.name})`,
    );

    return NextResponse.json({
      success: true,
      nudge_sent: true,
      message: "Event nudge sent successfully",
      recipient: recipientUserId ? "assigned_staff" : "default_channel",
    } as EventNudgeResponse);
  } catch (error) {
    console.error("[Event Nudge] Error:", error);
    return NextResponse.json(
      {
        success: false,
        nudge_sent: false,
        message: error instanceof Error ? error.message : "Internal error",
        error: error instanceof Error ? error.message : "Internal error",
      } as EventNudgeResponse,
      { status: 500 },
    );
  }
}
