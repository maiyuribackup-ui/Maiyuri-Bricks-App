export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import {
  listReferences,
  loadCurrentPublishedBundle,
  saveReference,
  StdCostError,
} from "@/lib/unit-economics";
import { computeAllReferenceVariances, stdCostReferenceSchema } from "@maiyuri/shared";

/**
 * Reference (benchmark) costs — legacy sheet totals, manual benchmarks, past
 * actuals. Stored beside the standard, never inside it.
 *
 *   GET  — every benchmark, plus the variance of each against the PUBLISHED
 *          standard (what the Intelligence Layer sees)
 *   POST — create or update one benchmark and its optional breakdown
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const [references, published] = await Promise.all([
      listReferences(),
      loadCurrentPublishedBundle(),
    ]);

    return success({
      references,
      // Variance against the published standard. The screen recomputes this
      // live for the draft; this is the number downstream actually reads.
      variances: published ? computeAllReferenceVariances(published, references) : [],
      published_valid_from: published?.version.valid_from ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[UnitEconomics] GET references failed:", err);
    return error("Failed to load reference costs", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const parsed = await parseBody(request, stdCostReferenceSchema);
    if (parsed.error) return parsed.error;

    const reference = await saveReference(parsed.data, user.id);
    return success({ reference });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof StdCostError) return error(err.message, err.status);
    console.error("[UnitEconomics] POST reference failed:", err);
    return error("Failed to save the reference cost", 500);
  }
}
