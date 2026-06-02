export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error } from "@/lib/api-utils";
import { isGa4Configured, getWebsiteAnalytics } from "@/lib/ga4/client";

// GET /api/analytics/website?days=28 — GA4 Website Behaviour dataset.
// Returns { configured: false } cleanly until the GA4 credential is set,
// so the page renders a setup state instead of erroring.
export async function GET(request: NextRequest) {
  try {
    // Require an authenticated session (aggregate data, but staff-only).
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return error("Unauthorized", 401);

    if (!isGa4Configured()) {
      return success({
        configured: false,
        reason: "GA4 not connected yet — add GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON.",
      });
    }

    const url = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(1, parseInt(url.searchParams.get("days") || "28", 10) || 28),
    );

    const data = await getWebsiteAnalytics(days);
    return success(data);
  } catch (err) {
    console.error("GA4 website analytics error:", err);
    return error(
      `Failed to load website analytics: ${err instanceof Error ? err.message : "unknown"}`,
      502,
    );
  }
}
