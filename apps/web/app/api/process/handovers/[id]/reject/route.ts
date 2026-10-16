export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { rejectHandover } from "@/lib/process/handovers";
import { runProcessRoute } from "@/lib/process/route-utils";
import { rejectHandoverSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/handovers/[id]/reject — return with a structured reason (PRD §11). */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to return the handover", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, rejectHandoverSchema);
    if (parsed.error) return parsed.error;
    return success(await rejectHandover(id, user, parsed.data));
  });
}
