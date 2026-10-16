export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, notFound } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { getDefinitionRow, getDefinitionStats } from "@/lib/process/repository";
import { runProcessRoute } from "@/lib/process/route-utils";

interface Params {
  params: Promise<{ key: string }>;
}

/**
 * GET /api/process/definitions/[key]/stats — live load per stage (open,
 * blocked, overdue, and the cases on it) so the Process Map doubles as a
 * control board.
 */
export async function GET(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to load process load", async () => {
    await requireAuth(request);
    const { key } = await params;
    const row = await getDefinitionRow(key.toUpperCase());
    if (!row) return notFound("Process not found");
    return success(await getDefinitionStats(row.id, row.process_key));
  });
}
