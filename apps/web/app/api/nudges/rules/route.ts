/**
 * AI Nudging System - Rules CRUD API
 *
 * GET /api/nudges/rules - List all nudge rules
 * POST /api/nudges/rules - Create a new nudge rule (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import type { NudgeRule, CreateNudgeRuleInput } from "@maiyuri/shared";

export const dynamic = "force-dynamic";

// Validation schema for creating a rule
const createRuleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).nullish(),
  rule_type: z.enum([
    "follow_up_overdue",
    "no_activity",
    "high_score_idle",
    "custom",
  ]),
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
    .default({}),
  priority: z.number().min(0).max(100).default(0),
  is_active: z.boolean().default(true),
});

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
 * GET /api/nudges/rules - List all nudge rules
 */
export async function GET() {
  try {
    const { data: rules, error } = await supabaseAdmin
      .from("nudge_rules")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Nudge Rules] Fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch nudge rules" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: rules as NudgeRule[],
      meta: { total: rules?.length ?? 0 },
    });
  } catch (error) {
    console.error("[Nudge Rules] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/nudges/rules - Create a new nudge rule (admin only)
 */
export async function POST(request: NextRequest) {
  try {
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
    const parseResult = createRuleSchema.safeParse(body);

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
    const input = parseResult.data as CreateNudgeRuleInput;

    // Create the rule
    const { data: rule, error } = await supabaseAdmin
      .from("nudge_rules")
      .insert({
        name: input.name,
        description: input.description || null,
        rule_type: input.rule_type,
        conditions: input.conditions,
        priority: input.priority ?? 0,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("[Nudge Rules] Create error:", error);
      return NextResponse.json(
        { error: "Failed to create nudge rule" },
        { status: 500 },
      );
    }

    console.log(`[Nudge Rules] Created rule: ${rule.name} (${rule.id})`);

    return NextResponse.json({ data: rule as NudgeRule }, { status: 201 });
  } catch (error) {
    console.error("[Nudge Rules] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
