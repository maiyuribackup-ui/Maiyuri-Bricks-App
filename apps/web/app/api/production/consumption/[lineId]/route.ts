export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { updateConsumptionLine } from "@/lib/production-service";
import { updateConsumptionLineSchema } from "@maiyuri/shared";
import type { ProductionConsumptionLine } from "@maiyuri/shared";

interface Params {
  params: Promise<{ lineId: string }>;
}

// GET /api/production/consumption/[lineId] - Get a single consumption line
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { lineId } = await params;

    if (!lineId) {
      return error("Line ID is required", 400);
    }

    const { data: line, error: dbError } = await supabaseAdmin
      .from("production_consumption_lines")
      .select(
        `
        *,
        raw_material:raw_materials(*)
      `,
      )
      .eq("id", lineId)
      .single();

    if (dbError || !line) {
      return notFound("Consumption line not found");
    }

    return success<ProductionConsumptionLine>(line);
  } catch (err) {
    console.error("Error fetching consumption line:", err);
    return error("Failed to fetch consumption line", 500);
  }
}

// PUT /api/production/consumption/[lineId] - Update actual consumption quantity
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { lineId } = await params;

    if (!lineId) {
      return error("Line ID is required", 400);
    }

    const parsed = await parseBody(request, updateConsumptionLineSchema);
    if (parsed.error) return parsed.error;

    const result = await updateConsumptionLine(
      lineId,
      parsed.data.actual_quantity,
      parsed.data.notes ?? undefined,
    );

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    // Fetch updated line
    const { data: line, error: dbError } = await supabaseAdmin
      .from("production_consumption_lines")
      .select(
        `
        *,
        raw_material:raw_materials(*)
      `,
      )
      .eq("id", lineId)
      .single();

    if (dbError) {
      return error("Failed to fetch updated line", 500);
    }

    return success<ProductionConsumptionLine>(line);
  } catch (err) {
    console.error("Error updating consumption line:", err);
    return error("Internal server error", 500);
  }
}
