export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { addEvidence } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { addProcessEvidenceSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/process/instances/[id]/evidence — attach evidence (PRD §9).
 * Files are uploaded through the mirrored My Work item's attachment route;
 * this records the reference (or a text / Odoo / URL source).
 */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to attach evidence", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, addProcessEvidenceSchema);
    if (parsed.error) return parsed.error;
    return success(await addEvidence(id, user, parsed.data));
  });
}
