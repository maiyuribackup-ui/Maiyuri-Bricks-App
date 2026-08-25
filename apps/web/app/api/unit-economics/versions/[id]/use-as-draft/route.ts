export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import {
  canPublishStandardCost,
  StdCostError,
  useVersionAsDraft,
} from "@/lib/unit-economics";
import { computeBundle } from "@maiyuri/shared";

/**
 * POST /api/unit-economics/versions/:id/use-as-draft — revert.
 *
 * Admin only. Refills the open draft from an older published version; history
 * is never rewritten, and nothing changes downstream until it is published.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth(request);
    if (!canPublishStandardCost(user.role)) {
      return error("Only management can revert to an earlier standard", 403);
    }

    const draft = await useVersionAsDraft(params.id, user.id);
    return success({ draft, draft_computed: computeBundle(draft) });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof StdCostError) return error(err.message, err.status);
    console.error("[UnitEconomics] use-as-draft failed:", err);
    return error("Failed to create a draft from that version", 500);
  }
}
