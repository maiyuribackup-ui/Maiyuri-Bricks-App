export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import {
  canPublishStandardCost,
  listPublishedVersions,
  loadCurrentPublishedBundle,
  loadDraftBundle,
} from "@/lib/unit-economics";
import { computeBundle, diffBundles, publishBlockers, publishWarnings } from "@maiyuri/shared";

/**
 * GET /api/unit-economics — everything the Standard Costs screen needs:
 * the working draft, the currently published standard, the diff between them,
 * publish gating, and the published history.
 *
 * Every derived number here is computed, never read from storage.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const [draft, published, history] = await Promise.all([
      loadDraftBundle(),
      loadCurrentPublishedBundle(),
      listPublishedVersions(),
    ]);

    return success({
      draft,
      draft_computed: draft ? computeBundle(draft) : null,
      published,
      published_computed: published ? computeBundle(published) : null,
      diff: draft ? diffBundles(published, draft) : [],
      blockers: draft ? publishBlockers(draft) : [],
      warnings: draft ? publishWarnings(draft, published) : [],
      history,
      can_publish: canPublishStandardCost(user.role),
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[UnitEconomics] GET failed:", err);
    return error("Failed to load standard costs", 500);
  }
}
