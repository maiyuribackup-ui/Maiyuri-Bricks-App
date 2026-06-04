/**
 * Global wall-system cost template (founder-owned) for the Total-Cost-of-
 * Construction comparison. Stored on the single factory_settings row.
 *
 * GET  — any authenticated staff (needed to render the comparison + defaults).
 * PUT  — founder/owner only.
 */
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, requireAdmin, handleApiError } from "@/lib/api-helpers";
import { wallCostConfigSchema, type WallCostConfig } from "@maiyuri/shared";
import { PLACEHOLDER_WALL_COST_CONFIG } from "@/lib/pricing/wall-cost";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { data } = await supabaseAdmin
      .from("factory_settings")
      .select("wall_cost_config")
      .limit(1)
      .single();
    const config = (data?.wall_cost_config as WallCostConfig | null) ??
      PLACEHOLDER_WALL_COST_CONFIG;
    return success<WallCostConfig>(config);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    const parsed = await parseBody(request, wallCostConfigSchema);
    if (parsed.error) return parsed.error;

    const config: WallCostConfig = {
      ...parsed.data,
      is_seeded_placeholder: false,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    const { data: existing } = await supabaseAdmin
      .from("factory_settings")
      .select("id")
      .limit(1)
      .single();

    if (!existing) {
      return error("Factory settings not initialised", 409);
    }

    const { error: dbError } = await supabaseAdmin
      .from("factory_settings")
      .update({ wall_cost_config: config, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (dbError) {
      console.error("[wall-costs] update error:", dbError);
      return error("Failed to save wall costs", 500);
    }
    return success<WallCostConfig>(config);
  } catch (err) {
    return handleApiError(err);
  }
}
