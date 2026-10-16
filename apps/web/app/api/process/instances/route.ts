export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { created, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { startProcess } from "@/lib/process/engine";
import { ProcessError } from "@/lib/process/errors";
import { isManagingPartner } from "@/lib/process/permissions";
import { runProcessRoute } from "@/lib/process/route-utils";
import { startProcessSchema } from "@maiyuri/shared";

/**
 * POST /api/process/instances — start a case. Starting mid-process
 * (imported_existing_case + start_stage_key, PRD §35) is partner-only.
 */
export async function POST(request: NextRequest) {
  return runProcessRoute("Failed to start the process", async () => {
    const user = await requireAuth(request);
    const parsed = await parseBody(request, startProcessSchema);
    if (parsed.error) return parsed.error;
    if (parsed.data.imported_existing_case && !isManagingPartner(user.role)) {
      throw new ProcessError(
        "FORBIDDEN",
        "Only a Managing Partner may initialise an existing case mid-process",
      );
    }
    const view = await startProcess(parsed.data, user);
    return created(view);
  });
}
