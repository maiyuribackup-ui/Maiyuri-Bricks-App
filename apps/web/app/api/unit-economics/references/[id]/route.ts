export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { deactivateReference } from "@/lib/unit-economics";

/**
 * DELETE /api/unit-economics/references/:id — stop comparing against this
 * benchmark. Deactivates rather than deletes: a legacy number that has been
 * argued over is part of the audit trail.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth(request);
    await deactivateReference(params.id, user.id);
    return success({ id: params.id, is_active: false });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[UnitEconomics] DELETE reference failed:", err);
    return error("Failed to deactivate the reference cost", 500);
  }
}
