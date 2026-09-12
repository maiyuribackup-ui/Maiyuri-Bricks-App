import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";

// GET /api/projects/templates — active templates for the create flow
export async function GET(request: NextRequest) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { data, error: dbErr } = await supabaseAdmin
      .from("project_templates")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (dbErr) return error("Failed to load templates", 500);
    return success(data || []);
  } catch {
    return error("Internal server error", 500);
  }
}
