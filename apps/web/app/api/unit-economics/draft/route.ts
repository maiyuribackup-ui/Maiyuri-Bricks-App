export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { saveDraft, StdCostError } from "@/lib/unit-economics";
import {
  computeBundle,
  publishBlockers,
  stdCostDraftSchema,
} from "@maiyuri/shared";

/**
 * PUT /api/unit-economics/draft — save the working draft (any staff member).
 *
 * Replace-all: the body is the complete draft. Nothing here goes live; the
 * Intelligence Layer only ever reads published versions.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const parsed = await parseBody(request, stdCostDraftSchema);
    if (parsed.error) return parsed.error;
    const payload = parsed.data;

    // Duplicate keys would silently drop rows on the unique constraints, and
    // the error Postgres returns names a constraint rather than the field.
    const duplicate =
      firstDuplicate(payload.rm_prices.map((rm) => rm.rm_key)) ??
      firstDuplicate(payload.fixed_items.map((item) => item.item_key)) ??
      firstDuplicate(payload.brick_types.map((bt) => bt.brick_type));
    if (duplicate) return error(`Duplicate entry: ${duplicate}`, 422);

    for (const bt of payload.brick_types) {
      const dupeRm = firstDuplicate(bt.recipe.map((line) => line.rm_key));
      if (dupeRm) return error(`${bt.brick_type}: duplicate recipe line for ${dupeRm}`, 422);
    }

    const bundle = await saveDraft(payload, user.id);

    return success({
      draft: bundle,
      draft_computed: computeBundle(bundle),
      blockers: publishBlockers(bundle),
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof StdCostError) return error(err.message, err.status);
    console.error("[UnitEconomics] PUT draft failed:", err);
    return error("Failed to save the draft", 500);
  }
}

function firstDuplicate(keys: string[]): string | null {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}
