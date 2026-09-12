export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { recordQcRelease } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { recordQcReleaseSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/process/instances/[id]/qc-release — record a QC release or hold
 * on the current stage (PRD §9 Quality Release). The record is the evidence
 * the `qc_released` gate verifies; Factory Manager only.
 */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to record the QC release", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, recordQcReleaseSchema);
    if (parsed.error) return parsed.error;
    return success(await recordQcRelease(id, user, parsed.data));
  });
}
