export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRODUCTION_ROLES, loadProductionSettings } from "@/lib/ops-control/production";
import { isValidBagStep } from "@/lib/ops-control/cement-ratio";
import { setOcConsumptionSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT — cement for ONE production line (PRD §33).
 *
 * Recorded per product rather than as a shift total, because a shift total
 * cannot be attributed to a product and therefore cannot be banded against
 * that product's standard. The half-bag step is validated against
 * oc_settings.cement_bag_step — configurable by the business, deliberately
 * not a CHECK constraint.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, PRODUCTION_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const parsed = await parseBody(request, setOcConsumptionSchema);
    if (parsed.error) return parsed.error;
    const { material, bags } = parsed.data;

    const { cementBagStep } = await loadProductionSettings();
    if (!isValidBagStep(bags, cementBagStep)) {
      return error(`Cement must be recorded in steps of ${cementBagStep} bags`, 400);
    }

    const { data: actual } = await supabaseAdmin
      .from("oc_production_actuals")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!actual) return error("Production entry not found", 404);
    if ((actual as { status: string }).status !== "draft") {
      return error("This output is already posted — its cement figure is frozen", 409);
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("oc_material_consumption")
      .upsert(
        { actual_id: id, material, bags, created_by: auth.user.id },
        { onConflict: "actual_id,material" },
      )
      .select("*")
      .single();
    if (dbError) return error(`Failed to save cement: ${dbError.message}`, 400);
    return success(data);
  } catch (err) {
    console.error("[OpsControl] consumption PUT failed:", err);
    return error("Failed to save cement", 500);
  }
}
