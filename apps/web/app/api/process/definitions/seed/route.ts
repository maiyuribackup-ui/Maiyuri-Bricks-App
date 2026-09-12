export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/api-helpers";
import { ensureDefinition } from "@/lib/process/engine";
import { BUILT_IN_DEFINITIONS } from "@/lib/process/definitions/lead-to-delivery";
import { runProcessRoute } from "@/lib/process/route-utils";

/**
 * POST /api/process/definitions/seed — import + publish every built-in
 * definition whose version is not present yet. Idempotent. Admin only.
 */
export async function POST(request: NextRequest) {
  return runProcessRoute("Failed to seed process definitions", async () => {
    const user = await requireAdmin(request);
    const results: Record<string, "exists" | "imported"> = {};
    for (const [key, def] of Object.entries(BUILT_IN_DEFINITIONS)) {
      results[key] = await ensureDefinition(def, user);
    }
    return success(results);
  });
}
