export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { updateCoachKnowledgeSchema, type CoachKnowledgeArticle } from "@maiyuri/shared";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/coaching/knowledge/[id] — update (admin)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const parsed = await parseBody(request, updateCoachKnowledgeSchema);
    if (parsed.error) return parsed.error;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_knowledge_base")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (dbErr || !data) return error("Failed to update article", 500);
    return success<CoachKnowledgeArticle>(data as CoachKnowledgeArticle);
  } catch (err) {
    console.error("coaching/knowledge/[id] PATCH error:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/coaching/knowledge/[id] — soft-retire (admin)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const { error: dbErr } = await getSupabaseAdmin()
      .from("coach_knowledge_base")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (dbErr) return error("Failed to retire article", 500);
    return success({ retired: true });
  } catch (err) {
    console.error("coaching/knowledge/[id] DELETE error:", err);
    return error("Internal server error", 500);
  }
}
