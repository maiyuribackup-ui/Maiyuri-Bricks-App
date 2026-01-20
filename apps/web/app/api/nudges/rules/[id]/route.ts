/**
 * AI Nudging System - Individual Rule API
 *
 * GET /api/nudges/rules/[id] - Get a single rule
 * PUT /api/nudges/rules/[id] - Update a rule (admin only)
 * DELETE /api/nudges/rules/[id] - Delete a rule (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import type { NudgeRule, UpdateNudgeRuleInput } from "@maiyuri/shared";

export const dynamic = "force-dynamic";

// Validation schema for updating a rule
const updateRuleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullish(),
    rule_type: z
      .enum(["follow_up_overdue", "no_activity", "high_score_idle", "custom"])
      .optional(),
    conditions: z
      .object({
        days_overdue: z.number().min(0).optional(),
        days_idle: z.number().min(0).optional(),
        days_since_created: z.number().min(0).optional(),
        min_score: z.number().min(0).max(1).optional(),
        max_score: z.number().min(0).max(1).optional(),
        statuses: z.array(z.string()).optional(),
        classifications: z.array(z.string()).optional(),
        lead_types: z.array(z.string()).optional(),
      })
      .optional(),
    priority: z.number().min(0).max(100).optional(),
    is_active: z.boolean().optional(),
  })
  .partial();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Helper to get authenticated user and check admin status
 */
async function getAuthenticatedAdmin() {
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
    return { user: null, isAdmin: false };
  }

  // Check if user is admin
  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    user,
    isAdmin:
      userData?.role === "admin" ||
      userData?.role === "founder" ||
      userData?.role === "owner",
  };
}

/**
 * GET /api/nudges/rules/[id] - Get a single rule
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data: rule, error } = await supabaseAdmin
      .from("nudge_rules")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Rule not found" }, { status: 404 });
      }
      console.error("[Nudge Rules] Fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch rule" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: rule as NudgeRule });
  } catch (error) {
    console.error("[Nudge Rules] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/nudges/rules/[id] - Update a rule (admin only)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check authentication and admin status
    const { user, isAdmin } = await getAuthenticatedAdmin();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = updateRuleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    // Cast is safe because Zod has validated the shape
    const input = parseResult.data as UpdateNudgeRuleInput;

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined)
      updateData.description = input.description;
    if (input.rule_type !== undefined) updateData.rule_type = input.rule_type;
    if (input.conditions !== undefined)
      updateData.conditions = input.conditions;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    // Update the rule
    const { data: rule, error } = await supabaseAdmin
      .from("nudge_rules")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Rule not found" }, { status: 404 });
      }
      console.error("[Nudge Rules] Update error:", error);
      return NextResponse.json(
        { error: "Failed to update rule" },
        { status: 500 },
      );
    }

    console.log(`[Nudge Rules] Updated rule: ${rule.name} (${rule.id})`);

    return NextResponse.json({ data: rule as NudgeRule });
  } catch (error) {
    console.error("[Nudge Rules] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/nudges/rules/[id] - Delete a rule (admin only)
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check authentication and admin status
    const { user, isAdmin } = await getAuthenticatedAdmin();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    // Delete the rule
    const { error } = await supabaseAdmin
      .from("nudge_rules")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Nudge Rules] Delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete rule" },
        { status: 500 },
      );
    }

    console.log(`[Nudge Rules] Deleted rule: ${id}`);

    return NextResponse.json(
      { message: "Rule deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Nudge Rules] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
