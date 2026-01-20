/**
 * AI Nudging System - Morning Digest API
 *
 * POST /api/nudges/digest
 *
 * Processes all active nudge rules and sends morning digest notifications
 * to staff members via Telegram. Can be triggered by:
 * 1. Vercel Cron (scheduled at 8 AM IST)
 * 2. Manual trigger from admin UI
 *
 * This endpoint:
 * - Fetches all active nudge rules
 * - Finds leads matching each rule
 * - Groups leads by assigned staff
 * - Sends Telegram digest to each staff member
 * - Records sent nudges in nudge_history
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  matchesRule,
  toDigestLead,
  formatDigestMessage,
  formatNudgeSummary,
  getNudgeCheckKey,
} from "@/lib/nudge-utils";
import {
  batchEnhanceLeads,
  formatEnhancedDigestEntry,
  type NudgeAIEnhancement,
} from "@/lib/nudge-ai";
import type {
  Lead,
  NudgeRule,
  NudgeDigestLead,
  NudgeDigestGroup,
  NudgeDigestResponse,
} from "@maiyuri/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for processing

interface UserWithTelegram {
  id: string;
  name: string;
  telegram_chat_id?: string;
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://maiyuri-bricks-app.vercel.app";

const STATUS_EMOJI: Record<string, string> = {
  new: "🆕",
  follow_up: "⏰",
  hot: "🔥",
  cold: "❄️",
  converted: "✅",
  lost: "❌",
};

/**
 * Format AI-enhanced digest message
 * Includes smart actions and optimal contact times when available
 */
function formatAIEnhancedDigestMessage(
  group: NudgeDigestGroup,
  enhancements: Map<string, NudgeAIEnhancement>,
): string {
  const { staff_name, leads } = group;
  const lines: string[] = [];

  // Header
  lines.push(`🤖 *AI-Enhanced Morning Digest*`);
  lines.push(``);

  // Staff greeting
  if (staff_name !== "Unassigned") {
    lines.push(`Hi ${staff_name.split(" ")[0]},`);
  }
  lines.push(
    `You have *${leads.length}* lead${leads.length > 1 ? "s" : ""} requiring attention:`,
  );
  lines.push(``);

  // Sort leads by status priority
  const statusOrder = ["hot", "follow_up", "new", "cold"];
  const sortedLeads = [...leads].sort((a, b) => {
    const aIndex = statusOrder.indexOf(a.status);
    const bIndex = statusOrder.indexOf(b.status);
    return aIndex - bIndex;
  });

  // Format each lead with AI enhancement
  const displayLeads = sortedLeads.slice(0, 10);
  for (const lead of displayLeads) {
    const enhancement = enhancements.get(lead.id);
    lines.push(formatEnhancedDigestEntry(lead, enhancement));
    lines.push(``);
  }

  // Note if there are more leads
  if (leads.length > 10) {
    lines.push(`...and ${leads.length - 10} more leads`);
    lines.push(``);
  }

  // AI Summary if available
  const enhancedCount = Array.from(enhancements.values()).filter(
    (e) => e.smart_action || e.optimal_time,
  ).length;
  if (enhancedCount > 0) {
    lines.push(`✨ _AI insights generated for ${enhancedCount} leads_`);
    lines.push(``);
  }

  // Footer with link
  lines.push(`[View All Leads](${APP_URL}/leads)`);

  return lines.join("\n");
}

/**
 * GET /api/nudges/digest - Cron trigger
 */
export async function GET(request: NextRequest) {
  return handleDigest(request);
}

/**
 * POST /api/nudges/digest - Manual trigger
 */
export async function POST(request: NextRequest) {
  return handleDigest(request);
}

async function handleDigest(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET is required for cron calls
  // Allow manual triggers without secret if coming from localhost or preview
  const isManualTrigger = request.method === "POST";
  const requiresAuth = cronSecret && !isManualTrigger;

  if (requiresAuth && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check for AI enhancement mode (via query param or env var)
  const searchParams = request.nextUrl.searchParams;
  const aiModeParam = searchParams.get("ai");
  const aiModeEnv = process.env.NUDGE_AI_ENHANCEMENT_ENABLED === "true";
  const useAIEnhancement =
    aiModeParam === "true" || (aiModeParam !== "false" && aiModeEnv);

  console.log("[Nudge Digest] Starting morning digest processing...", {
    aiEnhancement: useAIEnhancement,
  });

  try {
    // Step 1: Fetch all active nudge rules (ordered by priority)
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from("nudge_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (rulesError) {
      console.error("[Nudge Digest] Failed to fetch rules:", rulesError);
      return NextResponse.json(
        { error: "Failed to fetch nudge rules" },
        { status: 500 },
      );
    }

    if (!rules || rules.length === 0) {
      console.log("[Nudge Digest] No active rules found");
      return NextResponse.json({
        success: true,
        message: "No active nudge rules",
        data: {
          groups_processed: 0,
          nudges_sent: 0,
          leads_nudged: [],
          errors: [],
        } as NudgeDigestResponse,
      });
    }

    console.log(`[Nudge Digest] Found ${rules.length} active rules`);

    // Step 2: Fetch all leads that could potentially match
    // Filter to statuses that are typically in nudge rules
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .in("status", ["new", "follow_up", "hot", "cold"])
      .eq("is_archived", false)
      .order("follow_up_date", { ascending: true, nullsFirst: false });

    if (leadsError) {
      console.error("[Nudge Digest] Failed to fetch leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 },
      );
    }

    console.log(`[Nudge Digest] Found ${leads?.length ?? 0} potential leads`);

    // Step 3: Fetch today's nudge history to avoid duplicates
    const today = new Date().toISOString().split("T")[0];
    const { data: todayNudges } = await supabaseAdmin
      .from("nudge_history")
      .select("lead_id, rule_id")
      .gte("sent_at", `${today}T00:00:00Z`)
      .lt("sent_at", `${today}T23:59:59Z`);

    const sentToday = new Set(
      (todayNudges || []).map((n) =>
        getNudgeCheckKey(n.lead_id, n.rule_id ?? ""),
      ),
    );

    console.log(`[Nudge Digest] ${sentToday.size} nudges already sent today`);

    // Step 4: Match leads to rules and group by assigned staff
    const staffGroups: Map<string, NudgeDigestLead[]> = new Map();
    const matchedLeadIds: string[] = [];

    for (const lead of leads || []) {
      // Find the first matching rule (highest priority)
      for (const rule of rules as NudgeRule[]) {
        if (matchesRule(lead as Lead, rule)) {
          // Check if already nudged today
          const checkKey = getNudgeCheckKey(lead.id, rule.id);
          if (sentToday.has(checkKey)) {
            continue;
          }

          const digestLead = toDigestLead(lead as Lead, rule);
          const staffId = lead.assigned_staff || "unassigned";

          if (!staffGroups.has(staffId)) {
            staffGroups.set(staffId, []);
          }
          staffGroups.get(staffId)!.push(digestLead);
          matchedLeadIds.push(lead.id);

          // Only match first rule per lead
          break;
        }
      }
    }

    console.log(
      `[Nudge Digest] ${staffGroups.size} staff groups, ${matchedLeadIds.length} leads matched`,
    );

    // Step 5: Fetch user info for staff with matched leads
    const staffIds = Array.from(staffGroups.keys()).filter(
      (id) => id !== "unassigned",
    );
    const usersMap: Map<string, UserWithTelegram> = new Map();

    if (staffIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, name, telegram_chat_id")
        .in("id", staffIds);

      for (const user of users || []) {
        usersMap.set(user.id, user);
      }
    }

    // Step 5.5: Optionally enhance leads with AI (Phase 3)
    let aiEnhancements: Map<string, NudgeAIEnhancement> | null = null;
    if (useAIEnhancement && matchedLeadIds.length > 0) {
      console.log("[Nudge Digest] Generating AI enhancements...");
      try {
        // Collect all digest leads for batch enhancement
        const allDigestLeads: NudgeDigestLead[] = [];
        for (const leads of staffGroups.values()) {
          allDigestLeads.push(...leads);
        }

        // Batch enhance (limited to top 5 for performance)
        aiEnhancements = await batchEnhanceLeads(allDigestLeads.slice(0, 5), {
          includeSmartActions: true,
          includeOptimalTimes: true,
          includePersonalizedMessages: false, // Keep digest format consistent
        });
        console.log(`[Nudge Digest] AI enhanced ${aiEnhancements.size} leads`);
      } catch (aiError) {
        console.error("[Nudge Digest] AI enhancement failed:", aiError);
        // Continue without AI enhancement
      }
    }

    // Step 6: Send digest messages and record in history
    const errors: string[] = [];
    let groupsProcessed = 0;
    let nudgesSent = 0;
    const historyRecords: Array<{
      lead_id: string;
      rule_id: string | null;
      nudge_type: string;
      message: string;
      channel: string;
      recipient_user_id: string | null;
      delivered: boolean;
    }> = [];

    // Default chat ID for unassigned leads (goes to main channel)
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;

    for (const [staffId, digestLeads] of staffGroups) {
      const user = usersMap.get(staffId);
      const staffName = user?.name || "Unassigned";
      const chatId = user?.telegram_chat_id || defaultChatId;

      if (!chatId) {
        console.log(`[Nudge Digest] No chat ID for ${staffName}, skipping`);
        errors.push(`No Telegram chat ID for ${staffName}`);
        continue;
      }

      const group: NudgeDigestGroup = {
        staff_id: staffId,
        staff_name: staffName,
        telegram_chat_id: chatId,
        leads: digestLeads,
      };

      // Format message - use AI-enhanced format if available
      let message: string;
      if (aiEnhancements && aiEnhancements.size > 0) {
        message = formatAIEnhancedDigestMessage(group, aiEnhancements);
      } else {
        message = formatDigestMessage(group);
      }
      const result = await sendTelegramMessage(message, chatId);

      if (result.success) {
        groupsProcessed++;
        nudgesSent += digestLeads.length;

        // Record each lead nudge in history
        for (const lead of digestLeads) {
          const ruleId = (rules as NudgeRule[]).find(
            (r) => r.name === lead.rule_matched,
          )?.id;

          historyRecords.push({
            lead_id: lead.id,
            rule_id: ruleId || null,
            nudge_type: "morning_digest",
            message: message.slice(0, 500),
            channel: "telegram",
            recipient_user_id: staffId === "unassigned" ? null : staffId,
            delivered: true,
          });
        }
      } else {
        errors.push(`Failed to send to ${staffName}: ${result.error}`);
      }
    }

    // Step 7: Bulk insert history records
    if (historyRecords.length > 0) {
      const { error: historyError } = await supabaseAdmin
        .from("nudge_history")
        .insert(historyRecords);

      if (historyError) {
        console.error("[Nudge Digest] Failed to record history:", historyError);
        errors.push("Failed to record nudge history");
      }
    }

    // Step 8: Send summary to admin channel
    if (groupsProcessed > 0 || errors.length > 0) {
      const summary = formatNudgeSummary(groupsProcessed, nudgesSent, errors);
      await sendTelegramMessage(summary);
    }

    const response: NudgeDigestResponse = {
      groups_processed: groupsProcessed,
      nudges_sent: nudgesSent,
      leads_nudged: matchedLeadIds,
      errors,
    };

    console.log("[Nudge Digest] Completed:", response);

    return NextResponse.json({
      success: errors.length === 0,
      message: `Processed ${groupsProcessed} groups, sent ${nudgesSent} nudges`,
      data: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Nudge Digest] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Digest processing failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
