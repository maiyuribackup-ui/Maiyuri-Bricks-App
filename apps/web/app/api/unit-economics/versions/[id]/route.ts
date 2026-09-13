export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { loadBundle } from "@/lib/unit-economics";
import { computeBundle, diffBundles } from "@maiyuri/shared";

/**
 * GET /api/unit-economics/versions/:id — one version, read-only, with its
 * computed numbers. `?compare=<other version id>` returns the number-by-number
 * diff between the two ("what changed between v3 and v4").
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireAuth(request);

    const bundle = await loadBundle(params.id);
    if (!bundle) return error("Version not found", 404);

    const compareId = request.nextUrl.searchParams.get("compare");
    const compareBundle = compareId ? await loadBundle(compareId) : null;
    if (compareId && !compareBundle) return error("Comparison version not found", 404);

    return success({
      version: bundle,
      computed: computeBundle(bundle),
      compare: compareBundle,
      compare_computed: compareBundle ? computeBundle(compareBundle) : null,
      // Older version on the left, the one being viewed on the right.
      diff: compareBundle ? diffBundles(compareBundle, bundle) : [],
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[UnitEconomics] GET version failed:", err);
    return error("Failed to load version", 500);
  }
}
