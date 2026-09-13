export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import {
  canPublishStandardCost,
  loadBundle,
  loadCurrentPublishedBundle,
  publishDraft,
  StdCostError,
} from "@/lib/unit-economics";
import { publishBlockers, stdCostPublishSchema } from "@maiyuri/shared";

/**
 * POST /api/unit-economics/publish — freeze the draft as the new standard.
 *
 * Admin only. Blocked (PRD §7) when any brick type has no cement recipe line
 * or a total cost per unit of zero or less: a published version cannot be
 * edited afterwards, so bad inputs must not get in.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!canPublishStandardCost(user.role)) {
      return error("Only management can publish a standard cost version", 403);
    }

    const parsed = await parseBody(request, stdCostPublishSchema);
    if (parsed.error) return parsed.error;
    const { version_id, valid_from, notes } = parsed.data;

    const draft = await loadBundle(version_id);
    if (!draft) return error("Draft not found", 404);
    if (draft.version.status !== "draft") {
      return error("That version is already published", 409);
    }

    const blockers = publishBlockers(draft);
    if (blockers.length > 0) {
      return error(
        `Cannot publish: ${blockers
          .map((b) => (b.brick_type ? `${b.brick_type} — ${b.message}` : b.message))
          .join("; ")}`,
        422,
      );
    }

    const currentPublished = await loadCurrentPublishedBundle();
    if (currentPublished?.version.valid_from && valid_from <= currentPublished.version.valid_from) {
      return error(
        `Valid from must be after ${currentPublished.version.valid_from} (the current standard)`,
        422,
      );
    }

    const result = await publishDraft({
      versionId: version_id,
      validFrom: valid_from,
      publishedBy: user.id,
      notes: notes ?? null,
    });

    return success(result);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof StdCostError) return error(err.message, err.status);
    console.error("[UnitEconomics] publish failed:", err);
    return error("Failed to publish", 500);
  }
}
