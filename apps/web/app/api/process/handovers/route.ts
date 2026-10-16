export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { created, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { createHandover } from "@/lib/process/handovers";
import { runProcessRoute } from "@/lib/process/route-utils";
import { createHandoverSchema } from "@maiyuri/shared";

/**
 * POST /api/process/handovers — (re)send the package for the current
 * HANDOVER stage. Advancing INTO a handover stage creates one automatically;
 * this is for re-sending after a return.
 */
export async function POST(request: NextRequest) {
  return runProcessRoute("Failed to send the handover", async () => {
    const user = await requireAuth(request);
    const parsed = await parseBody(request, createHandoverSchema);
    if (parsed.error) return parsed.error;
    return created(
      await createHandover(
        parsed.data.instance_id,
        user,
        parsed.data.payload,
        parsed.data.to_user_id,
      ),
    );
  });
}
