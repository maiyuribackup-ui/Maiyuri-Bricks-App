export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { overrideGate } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { overrideGateSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/instances/[id]/override — Managing Partner gate override, always audited (PRD §23). */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to override the gate", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(request, overrideGateSchema);
    if (parsed.error) return parsed.error;
    return success(
      await overrideGate(
        id,
        user,
        parsed.data.stage_instance_id,
        parsed.data.gate_key,
        parsed.data.reason,
      ),
    );
  });
}
