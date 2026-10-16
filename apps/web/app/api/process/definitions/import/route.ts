export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { importDefinition } from "@/lib/process/engine";
import { validateDefinition } from "@/lib/process/validate-definition";
import { runProcessRoute } from "@/lib/process/route-utils";
import { importDefinitionSchema } from "@maiyuri/shared";

/**
 * POST /api/process/definitions/import — JSON authoring (PRD §19).
 * Body: { definition, publish? }. Add ?dry_run=1 to only validate.
 * Managing Partner only.
 */
export async function POST(request: NextRequest) {
  return runProcessRoute(
    "Failed to import the process definition",
    async () => {
      const user = await requireAuth(request);
      const parsed = await parseBody(request, importDefinitionSchema);
      if (parsed.error) return parsed.error;
      const dryRun = new URL(request.url).searchParams.get("dry_run") === "1";
      if (dryRun) {
        const v = validateDefinition(parsed.data.definition);
        return success({ ok: v.ok, issues: v.issues });
      }
      const result = await importDefinition(
        parsed.data.definition,
        user,
        parsed.data.publish,
      );
      return success(result);
    },
  );
}
