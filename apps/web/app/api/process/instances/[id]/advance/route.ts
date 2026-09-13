export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { advance } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { advanceProcessSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/process/instances/[id]/advance — complete the current stage and
 * open the next one. Gates are evaluated server-side; a failing gate returns
 * 422 with the gate key in brackets and records process.gate_failed.
 */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to move the case forward", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, advanceProcessSchema);
    if (parsed.error) return parsed.error;
    return success(await advance(id, user, parsed.data));
  });
}
