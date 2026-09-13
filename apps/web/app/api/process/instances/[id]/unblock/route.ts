export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { unblock } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { unblockProcessSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/instances/[id]/unblock — clear the exception. */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to clear the exception", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, unblockProcessSchema);
    if (parsed.error) return parsed.error;
    return success(
      await unblock(
        id,
        user,
        parsed.data.expected_stage_instance_id,
        parsed.data.note,
      ),
    );
  });
}
