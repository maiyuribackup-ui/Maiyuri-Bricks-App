export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { listDefinitionViews } from "@/lib/process/repository";
import { runProcessRoute } from "@/lib/process/route-utils";
import type { ProcessDefinitionView } from "@maiyuri/shared";

/** GET /api/process/definitions — the Process Library (PRD §7.1). */
export async function GET(request: NextRequest) {
  return runProcessRoute("Failed to load processes", async () => {
    await requireAuth(request);
    const defs = await listDefinitionViews();
    return success<ProcessDefinitionView[]>(defs);
  });
}
