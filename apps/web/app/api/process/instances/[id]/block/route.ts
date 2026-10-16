export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { block } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { blockProcessSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/instances/[id]/block — raise an exception (PRD §22). */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to raise the exception", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, blockProcessSchema);
    if (parsed.error) return parsed.error;
    return success(await block(id, user, parsed.data));
  });
}
