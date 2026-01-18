export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import {
  getFinishedGoods,
  syncFinishedGoodsFromOdoo,
} from "@/lib/production-service";
import type { FinishedGood } from "@maiyuri/shared";

// GET /api/production/finished-goods - List all active finished goods
export async function GET() {
  try {
    const finishedGoods = await getFinishedGoods();
    return success<FinishedGood[]>(finishedGoods);
  } catch (err) {
    console.error("Error fetching finished goods:", err);
    return error("Failed to fetch finished goods", 500);
  }
}

// POST /api/production/finished-goods - Sync finished goods from Odoo
export async function POST() {
  try {
    const result = await syncFinishedGoodsFromOdoo();

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    return success(result.data, { total: result.data?.total as number });
  } catch (err) {
    console.error("Error syncing finished goods:", err);
    return error("Failed to sync finished goods from Odoo", 500);
  }
}
