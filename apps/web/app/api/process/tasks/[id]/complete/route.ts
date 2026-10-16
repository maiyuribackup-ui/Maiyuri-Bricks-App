export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { completeTask } from "@/lib/process/engine";
import { runProcessRoute } from "@/lib/process/route-utils";
import { completeProcessTaskSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/process/tasks/[id]/complete — tick (or untick / n/a) one checklist item. */
export async function POST(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to update the task", async () => {
    const user = await requireAuth(request);
    const { id } = await params;
    const parsed = await parseBody(
      request,
      completeProcessTaskSchema.extend({}).partial({ status: true }),
    );
    if (parsed.error) return parsed.error;
    const reopen = new URL(request.url).searchParams.get("reopen") === "1";
    const status = reopen ? "open" : (parsed.data.status ?? "done");
    return success(await completeTask(id, user, status, parsed.data.note));
  });
}
