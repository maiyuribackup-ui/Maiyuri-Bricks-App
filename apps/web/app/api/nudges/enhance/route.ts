/**
 * AI Nudge Enhancement API
 *
 * POST /api/nudges/enhance
 *
 * Enhances nudge messages with AI-powered features:
 * - Smart action suggestions based on lead context
 * - Optimal contact time prediction
 * - Personalized message generation
 *
 * This endpoint can be called:
 * 1. Before sending a manual nudge to enhance it
 * 2. By the digest system to add AI insights
 * 3. By the UI to preview AI suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  generateSmartAction,
  predictOptimalContactTime,
  generatePersonalizedMessage,
  batchEnhanceLeads,
  type NudgeAIEnhancement,
} from "@/lib/nudge-ai";
import type { Lead, NudgeDigestLead } from "@maiyuri/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface EnhanceRequest {
  // Single lead enhancement
  lead_id?: string;
  // Or batch enhancement for digest
  leads?: NudgeDigestLead[];
  // Options
  options?: {
    include_smart_action?: boolean;
    include_optimal_time?: boolean;
    include_personalized_message?: boolean;
    nudge_type?: "morning_digest" | "manual" | "event";
    language?: "en" | "ta";
    context?: {
      days_overdue?: number;
      rule_matched?: string;
      event_type?: string;
      staff_name?: string;
    };
  };
}

interface EnhanceResponse {
  success: boolean;
  enhancement?: NudgeAIEnhancement;
  enhancements?: Record<string, NudgeAIEnhancement>;
  error?: string;
  timestamp: string;
}

/**
 * POST /api/nudges/enhance
 * Enhance one or more leads with AI-powered nudge insights
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as EnhanceRequest;
    const { lead_id, leads, options = {} } = body;

    const {
      include_smart_action = true,
      include_optimal_time = false,
      include_personalized_message = true,
      nudge_type = "manual",
      language = "en",
      context,
    } = options;

    // Validate input
    if (!lead_id && (!leads || leads.length === 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "Either lead_id or leads array is required",
          timestamp: new Date().toISOString(),
        } as EnhanceResponse,
        { status: 400 },
      );
    }

    // Single lead enhancement
    if (lead_id) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (leadError || !lead) {
        return NextResponse.json(
          {
            success: false,
            error: "Lead not found",
            timestamp: new Date().toISOString(),
          } as EnhanceResponse,
          { status: 404 },
        );
      }

      const enhancement: NudgeAIEnhancement = {
        lead_id: lead.id,
        smart_action: null,
        optimal_time: null,
        personalized_message: null,
        generated_at: new Date().toISOString(),
      };

      // Run enhancements in parallel
      const tasks: Promise<void>[] = [];

      if (include_smart_action) {
        tasks.push(
          generateSmartAction(lead as Lead, {
            days_overdue: context?.days_overdue,
          }).then((result) => {
            enhancement.smart_action = result;
          }),
        );
      }

      if (include_optimal_time) {
        tasks.push(
          predictOptimalContactTime(lead as Lead).then((result) => {
            enhancement.optimal_time = result;
          }),
        );
      }

      if (include_personalized_message) {
        tasks.push(
          generatePersonalizedMessage(
            lead as Lead,
            nudge_type,
            context,
            language,
          ).then((result) => {
            enhancement.personalized_message = result;
          }),
        );
      }

      await Promise.all(tasks);

      return NextResponse.json({
        success: true,
        enhancement,
        timestamp: new Date().toISOString(),
      } as EnhanceResponse);
    }

    // Batch enhancement for digest
    if (leads && leads.length > 0) {
      const enhancementsMap = await batchEnhanceLeads(leads, {
        includeSmartActions: include_smart_action,
        includeOptimalTimes: include_optimal_time,
        includePersonalizedMessages: include_personalized_message,
        language,
      });

      // Convert Map to object for JSON response
      const enhancements: Record<string, NudgeAIEnhancement> = {};
      for (const [id, enhancement] of enhancementsMap) {
        enhancements[id] = enhancement;
      }

      return NextResponse.json({
        success: true,
        enhancements,
        timestamp: new Date().toISOString(),
      } as EnhanceResponse);
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        timestamp: new Date().toISOString(),
      } as EnhanceResponse,
      { status: 400 },
    );
  } catch (error) {
    console.error("[Nudge AI] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Enhancement failed",
        timestamp: new Date().toISOString(),
      } as EnhanceResponse,
      { status: 500 },
    );
  }
}

/**
 * GET /api/nudges/enhance
 * Quick enhancement for a single lead (for UI preview)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const leadId = searchParams.get("lead_id");
  const language = (searchParams.get("language") as "en" | "ta") || "en";

  if (!leadId) {
    return NextResponse.json(
      {
        success: false,
        error: "lead_id query parameter is required",
        timestamp: new Date().toISOString(),
      } as EnhanceResponse,
      { status: 400 },
    );
  }

  // Fetch lead
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json(
      {
        success: false,
        error: "Lead not found",
        timestamp: new Date().toISOString(),
      } as EnhanceResponse,
      { status: 404 },
    );
  }

  // Quick enhancement: just smart action
  const smartAction = await generateSmartAction(lead as Lead);

  const enhancement: NudgeAIEnhancement = {
    lead_id: lead.id,
    smart_action: smartAction,
    optimal_time: null,
    personalized_message: null,
    generated_at: new Date().toISOString(),
  };

  return NextResponse.json({
    success: true,
    enhancement,
    timestamp: new Date().toISOString(),
  } as EnhanceResponse);
}
