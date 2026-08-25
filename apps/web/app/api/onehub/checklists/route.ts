export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/onehub/checklists — templates + all runs (small volumes)
export async function GET() {
  try {
    const [{ data: templates }, { data: runs }] = await Promise.all([
      supabaseAdmin
        .from("onehub_checklist_templates")
        .select("*")
        .eq("is_active", true),
      supabaseAdmin
        .from("onehub_checklist_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50),
    ]);
    return success({ templates: templates ?? [], runs: runs ?? [] });
  } catch (err) {
    console.error("onehub checklists GET failed:", err);
    return error("Failed to load checklists", 500);
  }
}

const createRunSchema = z.object({
  template_id: z.string().uuid(),
  subject_name: z.string().min(1),
  subject_user_id: z.string().uuid().nullable().optional(),
});

// POST /api/onehub/checklists — start a checklist run for a new joiner
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "founder" && user.role !== "owner" && user.role !== "accountant") {
      return error("Not allowed to start checklists", 403);
    }
    const parsed = await parseBody(request, createRunSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbError } = await supabaseAdmin
      .from("onehub_checklist_runs")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to start checklist", 500);
    return success(data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("onehub checklists POST failed:", err);
    return error("Failed to start checklist", 500);
  }
}
