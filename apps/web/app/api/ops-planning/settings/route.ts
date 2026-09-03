export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ADMIN_ROLES = ["founder", "owner", "production_supervisor"];

const settingsSchema = z.object({
  // ISO weekday numbers the factory works (1=Mon … 7=Sun)
  work_days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  max_deliveries_per_day: z.number().int().min(1).max(20),
  default_constraints_note: z.string().nullable().optional(),
});

// GET /api/ops-planning/settings — the planner's global knobs
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { data, error: dbErr } = await supabaseAdmin
      .from("planning_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (dbErr) return error("Failed to load planning settings", 500);
    return success(
      data ?? {
        id: 1,
        work_days: [1, 2, 3, 4, 5, 6],
        max_deliveries_per_day: 4,
        default_constraints_note: null,
      },
    );
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("planning settings GET failed:", err);
    return error("Failed to load planning settings", 500);
  }
}

// PUT /api/ops-planning/settings — update (leadership/supervisor only).
// Previously these knobs were IMPOSSIBLE to change from any surface
// (completeness audit U6) — hardcoded fallbacks ruled the factory.
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!ADMIN_ROLES.includes(user.role)) {
      return error("Only leadership can change planning settings", 403);
    }
    const parsed = await parseBody(request, settingsSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await supabaseAdmin
      .from("planning_settings")
      .upsert({ id: 1, ...parsed.data })
      .select("*")
      .single();
    if (dbErr || !data) {
      return error(`Failed to save settings: ${dbErr?.message}`, 500);
    }
    return success(data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("planning settings PUT failed:", err);
    return error("Failed to save planning settings", 500);
  }
}
