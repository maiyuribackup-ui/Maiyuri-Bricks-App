export const dynamic = "force-dynamic";

import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/ops-control/masters/activity-types
// Read-only in Phase 1: production/loading/unloading are seeded. The table
// exists so further activities are configuration, not a migration (PRD §57).
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("oc_activity_types")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (dbError) return error("Failed to load activity types", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("[OpsControl] activity-types GET failed:", err);
    return error("Failed to load activity types", 500);
  }
}
