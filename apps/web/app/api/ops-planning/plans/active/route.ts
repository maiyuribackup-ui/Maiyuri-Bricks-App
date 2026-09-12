export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/ops-planning/plans/active?from=yyyy-mm-dd&to=yyyy-mm-dd
// Returns the active plan with its items (optionally date-windowed) — the
// calendar feed.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const { data: plan } = await supabaseAdmin
      .from("ops_plans")
      .select("*")
      .eq("status", "active")
      .maybeSingle();

    if (!plan) return success({ plan: null, items: [] });

    let query = supabaseAdmin
      .from("ops_plan_items")
      .select("*")
      .eq("plan_id", plan.id)
      .order("item_date", { ascending: true });
    if (from) query = query.gte("item_date", from);
    if (to) query = query.lte("item_date", to);

    const { data: items, error: dbError } = await query;
    if (dbError) return error("Failed to load plan items", 500);

    return success({ plan, items: items ?? [] });
  } catch (err) {
    console.error("active plan fetch failed:", err);
    return error("Failed to load active plan", 500);
  }
}
