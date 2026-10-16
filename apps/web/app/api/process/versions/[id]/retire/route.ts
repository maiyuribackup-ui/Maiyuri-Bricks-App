export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { retireVersion } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/versions/[id]/retire — Managing Partner only (enforced in SQL too). */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to retire the version", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    return success(await retireVersion(id, user));
  });
}
