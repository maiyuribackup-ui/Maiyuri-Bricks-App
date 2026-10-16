export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { getInstanceView } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/process/instances/[id] — the full case view (PRD §7.3, §7.4). */
export async function GET(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to load the case", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    return success(await getInstanceView(id, user));
  });
}
