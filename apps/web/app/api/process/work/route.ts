export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { loadWorkQueue } from "@/lib/process/work-queue";
import { runProcessRoute } from "@/lib/process/route-utils";
import type { ProcessWorkQueue } from "@maiyuri/shared";

/**
 * GET /api/process/work — my process work (PRD §14): assigned stages, the
 * role queue I may claim, handovers waiting for me, and what is overdue.
 */
export async function GET(request: NextRequest) {
  return runProcessRoute("Failed to load your process work", async () => {
    const user = await requireAuth(request);
    return success<ProcessWorkQueue>(await loadWorkQueue(user));
  });
}
