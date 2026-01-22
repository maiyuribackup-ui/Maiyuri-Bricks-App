/**
 * AI Nudging System - Manual Trigger API
 *
 * POST /api/nudges/trigger
 *
 * Manually send a nudge notification for a specific lead.
 * Used by staff from the lead detail page to send immediate reminders.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatManualNudgeMessage } from "@/lib/nudge-utils";
import { z } from "zod";
import type { Lead, TriggerNudgeInput } from "@maiyuri/shared";

export const dynamic = "force-dynamic";

// Validation schema
const triggerNudgeSchema = z.object({
  lead_id: z.string().uuid("Invalid lead ID"),
  nudge_type: z.string().max(50).default("manual"),
  message: z.string().max(500).optional(),
});

/**
 * Helper to get authenticated user
 */
async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Get user details
  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("id, name, telegram_chat_id")
    .eq("id", user.id)
    .single();

  return userData;
}

/**
 * POST /api/nudges/trigger - Send manual nudge for a lead
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const currentUser = await getAuthenticatedUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = triggerNudgeSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const input: TriggerNudgeInput = parseResult.data;

    // Fetch the lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*, assigned_staff")
      .eq("id", input.lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Determine who to send the nudge to
    let targetChatId: string | undefined;
    let recipientUserId: string | null = null;

    if (lead.assigned_staff) {
      // Send to assigned staff member
      const { data: staffUser } = await supabaseAdmin
        .from("users")
        .select("id, telegram_chat_id")
        .eq("id", lead.assigned_staff)
        .single();

      if (staffUser?.telegram_chat_id) {
        targetChatId = staffUser.telegram_chat_id;
        recipientUserId = staffUser.id;
      }
    }

    // Fall back to default channel if no staff chat ID
    if (!targetChatId) {
      targetChatId = process.env.TELEGRAM_CHAT_ID;
    }

    if (!targetChatId) {
      return NextResponse.json(
        { error: "No Telegram channel configured" },
        { status: 500 },
      );
    }

    // Format and send the message
    const message = formatManualNudgeMessage(
      lead as Lead,
      input.nudge_type ?? "manual",
      input.message,
    );

    const result = await sendTelegramMessage(message, targetChatId);

    if (!result.success) {
      console.error("[Nudge Trigger] Failed to send:", result.error);
      return NextResponse.json(
        { error: `Failed to send nudge: ${result.error}` },
        { status: 500 },
      );
    }

    // Record in nudge history
    const { error: historyError } = await supabaseAdmin
      .from("nudge_history")
      .insert({
        lead_id: input.lead_id,
        rule_id: null, // Manual nudges have no rule
        nudge_type: input.nudge_type ?? "manual",
        message: message.slice(0, 500),
        channel: "telegram",
        recipient_user_id: recipientUserId,
        delivered: true,
        metadata: {
          triggered_by: currentUser.id,
          triggered_by_name: currentUser.name,
          custom_message: input.message || null,
        },
      });

    if (historyError) {
      console.error("[Nudge Trigger] Failed to record history:", historyError);
      // Don't fail the request, nudge was still sent
    }

    console.log(
      `[Nudge Trigger] Sent nudge for lead ${lead.id} by ${currentUser.name}`,
    );

    return NextResponse.json({
      success: true,
      message: "Nudge sent successfully",
      data: {
        lead_id: input.lead_id,
        lead_name: lead.name,
        sent_to: recipientUserId ? "assigned_staff" : "default_channel",
      },
    });
  } catch (error) {
    console.error("[Nudge Trigger] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
