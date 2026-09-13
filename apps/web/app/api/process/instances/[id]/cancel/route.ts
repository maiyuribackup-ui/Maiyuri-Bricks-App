export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { cancel } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { cancelProcessSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/instances/[id]/cancel — creator or Managing Partner. */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to cancel the case", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, cancelProcessSchema);
    if (parsed.error) return parsed.error;
    return success(await cancel(id, user, parsed.data.reason));
  });
}
