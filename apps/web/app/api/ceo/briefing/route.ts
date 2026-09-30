export const dynamic = "force-dynamic";
export const maxDuration = 60; // Odoo fan-out + one LLM call

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import {
  balancesFromOdoo,
  pipelineByStage,
  productEconomics,
  profitPeriods,
  receivablesSummary,
} from "@/lib/ceo/briefing";
import { getCeoAction } from "@/lib/ceo/advisor";

/**
 * GET /api/ceo/briefing — the founder's command center: money, product
 * economics, profit periods, pipeline, receivables, and ONE AI-picked action.
 * Founder/owner only. Sections degrade to null individually.
 */
const CEO_ROLES = ["founder", "owner"];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!CEO_ROLES.includes(user.role)) return error("Not permitted", 403);

    const [moneyRes, productsRes, profitRes, pipelineRes, recvRes] =
      await Promise.allSettled([
        balancesFromOdoo(),
        productEconomics(),
        profitPeriods(),
        pipelineByStage(),
        receivablesSummary(),
      ]);

    const pick = <T,>(r: PromiseSettledResult<T>, label: string): T | null => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[CEO] ${label} failed:`, r.reason);
      return null;
    };

    const briefing = {
      money: pick(moneyRes, "money"),
      products: pick(productsRes, "products") ?? [],
      profit: pick(profitRes, "profit") ?? [],
      pipeline: pick(pipelineRes, "pipeline"),
      receivables: pick(recvRes, "receivables"),
    };

    const action = await getCeoAction(briefing);

    return success({
      ...briefing,
      action,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[CEO] briefing failed:", err);
    return error("Failed to build the CEO briefing", 500);
  }
}
