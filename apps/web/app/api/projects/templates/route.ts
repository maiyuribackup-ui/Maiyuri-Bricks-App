export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";

// GET /api/projects/templates — active templates for the create flow
export async function GET() {
  try {
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
