export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/coaching/lessons/[id]/complete — mark lesson complete for this learner
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const { id } = await params;

    const { error: dbErr } = await getSupabaseAdmin()
      .from("coach_lesson_progress")
      .upsert(
        {
          user_id: ctx.userId,
          lesson_id: id,
          status: "completed",
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,lesson_id" },
      );
    if (dbErr) {
      console.error("coaching lesson complete error:", dbErr);
      return error("Failed to mark lesson complete", 500);
    }
    return success({ completed: true });
  } catch (err) {
    console.error("coaching/lessons/[id]/complete POST error:", err);
    return error("Internal server error", 500);
  }
}
