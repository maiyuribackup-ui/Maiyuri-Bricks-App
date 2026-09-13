export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { getViewForEntity } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";

interface Params {
  params: Promise<{ entityType: string; entityId: string }>;
}

/**
 * GET /api/process/instances/for/[entityType]/[entityId] — the journey to
 * embed on lead / order screens (PRD §7.4). `data` is null when the entity
 * has no case.
 */
export async function GET(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to load the case", async () => {
    const user = await requireAuth(request);
    const { entityType, entityId } = await params;
    return success(await getViewForEntity(entityType, entityId, user));
  });
}
