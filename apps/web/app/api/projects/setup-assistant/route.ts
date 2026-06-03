export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import { setupAssistantSchema, type ProjectTemplate } from "@maiyuri/shared";
import { suggestProjectSetup } from "@/lib/projects/ai/setup-assistant";

// POST /api/projects/setup-assistant — AI template/timeline/risk suggestions
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, setupAssistantSchema);
    if (parsed.error) return parsed.error;

    const { data: templates } = await supabaseAdmin
      .from("project_templates")
      .select("*")
      .eq("is_active", true);

    const suggestion = await suggestProjectSetup(
      parsed.data,
      (templates || []) as ProjectTemplate[],
    );
    return success(suggestion);
  } catch (err) {
    console.error("setup-assistant error:", err);
    return error("Internal server error", 500);
  }
}
