export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, forbidden, parseBody } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { createCoachLessonSchema, type CoachLesson } from "@maiyuri/shared";

// POST /api/coaching/lessons — create a lesson under a module (admin)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");

    const parsed = await parseBody(request, createCoachLessonSchema);
    if (parsed.error) return parsed.error;

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_lessons")
      .insert(parsed.data)
      .select()
      .single();
    if (dbErr || !data) {
      console.error("coaching/lessons insert error:", dbErr);
      return error(`Failed to create lesson: ${dbErr?.message ?? "unknown"}`, 500);
    }
    return success<CoachLesson>(data as CoachLesson);
  } catch (err) {
    console.error("coaching/lessons POST error:", err);
    return error("Internal server error", 500);
  }
}
