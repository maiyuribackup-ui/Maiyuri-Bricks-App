export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";

// GET /api/cbs — returns all active CBS master codes, ordered by code.
// No auth gating: any authenticated staff can read the master list.
// UI caches this with staleTime: 10 min (rarely changes).
export async function GET(request: NextRequest) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { data, error: dbErr } = await supabaseAdmin
      .from("cbs_master")
      .select("*")
      .eq("is_active", true)
      .order("cbs_code", { ascending: true });

    if (dbErr) return error("Failed to load CBS codes", 500);
    return success(data || []);
  } catch {
    return error("Internal server error", 500);
  }
}
