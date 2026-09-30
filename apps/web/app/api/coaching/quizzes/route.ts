export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { createCoachQuizSchema, type CoachQuiz } from "@maiyuri/shared";

// POST /api/coaching/quizzes — create (admin)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");

    const parsed = await parseBody(request, createCoachQuizSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_quizzes")
      .insert(parsed.data)
      .select()
      .single();
    if (dbErr || !data) {
      console.error("coaching/quizzes insert error:", dbErr);
      return error(`Failed to create quiz: ${dbErr?.message ?? "unknown"}`, 500);
    }
    return success<CoachQuiz>(data as CoachQuiz);
  } catch (err) {
    console.error("coaching/quizzes POST error:", err);
    return error("Internal server error", 500);
  }
}
