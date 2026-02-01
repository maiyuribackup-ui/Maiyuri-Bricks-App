export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound } from "@/lib/api-utils";
import { getBOMLines, fetchBOMFromOdoo } from "@/lib/production-service";
import type { BOMLine } from "@maiyuri/shared";

interface Params {
  params: Promise<{ finishedGoodId: string }>;
}

// GET /api/production/bom/[finishedGoodId] - Get BOM lines for a finished good
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { finishedGoodId } = await params;

    if (!finishedGoodId) {
      return error("Finished good ID is required", 400);
    }

    const bomLines = await getBOMLines(finishedGoodId);
    return success<BOMLine[]>(bomLines);
  } catch (err) {
    console.error("Error fetching BOM lines:", err);
    return error("Failed to fetch BOM lines", 500);
  }
}

// POST /api/production/bom/[finishedGoodId] - Refresh BOM from Odoo
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { finishedGoodId } = await params;

    if (!finishedGoodId) {
      return error("Finished good ID is required", 400);
    }

    const result = await fetchBOMFromOdoo(finishedGoodId);

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    // Return the updated BOM lines
    const bomLines = await getBOMLines(finishedGoodId);
    return success<BOMLine[]>(bomLines);
  } catch (err) {
    console.error("Error refreshing BOM:", err);
    return error("Failed to refresh BOM from Odoo", 500);
  }
}
