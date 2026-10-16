export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { error, created, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES } from "@/lib/ops-control/production";
import { createOcPlanLineSchema } from "@maiyuri/shared";

/** POST — plan a product into a shift. One line per shift+product. */
export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, createOcPlanLineSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_production_plan_lines")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError) {
      if (dbError.code === "23505") {
        return error(
          "That product is already planned for this shift — edit the existing line",
          409,
        );
      }
      return error(`Failed to add plan line: ${dbError.message}`, 400);
    }
    return created(data);
  } catch (err) {
    console.error("[OpsControl] plan-lines POST failed:", err);
    return error("Failed to add plan line", 500);
  }
}
