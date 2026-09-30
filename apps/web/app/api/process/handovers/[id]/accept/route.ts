export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { acceptHandover } from "@/lib/process/handovers";
import { runProcessRoute } from "@/lib/process/route-utils";
import { acceptHandoverSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/handovers/[id]/accept — receiver accepts; completes the stage when its checklist is done. */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to accept the handover", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, acceptHandoverSchema);
    if (parsed.error) return parsed.error;
    return success(await acceptHandover(id, user, parsed.data));
  });
}
