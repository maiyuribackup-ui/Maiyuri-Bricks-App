export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, notFound } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { getDefinitionView, listVersions } from "@/lib/process/repository";
import { runProcessRoute } from "@/lib/process/route-utils";

interface Params {
  params: Promise<{ key: string }>;
}

/**
 * GET /api/process/definitions/[key]?version=1.0 — one process with the
 * stages of its active (or requested) version, for the Process Map.
 */
export async function GET(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to load the process", async () => {
    await requireAuth(request);
    const { key } = await params;
    const version = new URL(request.url).searchParams.get("version");
    const view = await getDefinitionView(key.toUpperCase(), version);
    if (!view) return notFound("Process not found");
    const versions = await listVersions(view.id);
    return success({ ...view, versions });
  });
}
