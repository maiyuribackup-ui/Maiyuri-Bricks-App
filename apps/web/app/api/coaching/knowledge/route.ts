export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { createCoachKnowledgeSchema, type CoachKnowledgeArticle } from "@maiyuri/shared";

// GET /api/coaching/knowledge — list (optional ?category=)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();

    const category = new URL(request.url).searchParams.get("category");
    let q = getSupabaseAdmin()
      .from("coach_knowledge_base")
      .select("*")
      .order("category", { ascending: true });
    if (!ctx.isAdmin) q = q.eq("is_active", true);
    if (category) q = q.eq("category", category);

    const { data, error: dbErr } = await q;
    if (dbErr) return error("Failed to load knowledge base", 500);
    return success<CoachKnowledgeArticle[]>((data as CoachKnowledgeArticle[]) || []);
  } catch (err) {
    console.error("coaching/knowledge GET error:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/coaching/knowledge — create (admin)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");

    const parsed = await parseBody(request, createCoachKnowledgeSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_knowledge_base")
      .insert(parsed.data)
      .select()
      .single();
    if (dbErr || !data) {
      console.error("coaching/knowledge insert error:", dbErr);
      return error(`Failed to create article: ${dbErr?.message ?? "unknown"}`, 500);
    }
    return success<CoachKnowledgeArticle>(data as CoachKnowledgeArticle);
  } catch (err) {
    console.error("coaching/knowledge POST error:", err);
    return error("Internal server error", 500);
  }
}
