export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  success,
  error,
  notFound,
  unauthorized,
  forbidden,
  parseBody,
} from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCoachContext } from "@/lib/coaching/context";
import { updateCoachModuleSchema, type CoachLesson, type CoachModule } from "@maiyuri/shared";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/coaching/modules/[id] — module + its lessons (+ completion for learner)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: module, error: mErr } = await admin
      .from("coach_modules")
      .select("*")
      .eq("id", id)
      .single();
    if (mErr || !module) return notFound("Module not found");

    const { data: lessons } = await admin
      .from("coach_lessons")
      .select("*")
      .eq("module_id", id)
      .eq("is_active", true)
      .order("sequence_order", { ascending: true });

    const lessonList = (lessons as CoachLesson[]) || [];
    const { data: progress } = lessonList.length
      ? await admin
          .from("coach_lesson_progress")
          .select("lesson_id,status")
          .eq("user_id", ctx.userId)
          .in("lesson_id", lessonList.map((l) => l.id))
      : { data: [] as { lesson_id: string; status: string }[] };

    const completed = new Set(
      ((progress as { lesson_id: string; status: string }[]) || [])
        .filter((p) => p.status === "completed")
        .map((p) => p.lesson_id),
    );

    return success({
      module: module as CoachModule,
      lessons: lessonList.map((l) => ({ ...l, completed: completed.has(l.id) })),
    });
  } catch (err) {
    console.error("coaching/modules/[id] GET error:", err);
    return error("Internal server error", 500);
  }
}

// PATCH /api/coaching/modules/[id] — update (admin)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const parsed = await parseBody(request, updateCoachModuleSchema);
    if (parsed.error) return parsed.error;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }

    const { data, error: dbErr } = await getSupabaseAdmin()
      .from("coach_modules")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (dbErr || !data) return error("Failed to update module", 500);
    return success<CoachModule>(data as CoachModule);
  } catch (err) {
    console.error("coaching/modules/[id] PATCH error:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/coaching/modules/[id] — soft-retire (admin)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await getCoachContext(request);
    if (!ctx) return unauthorized();
    if (!ctx.isAdmin) return forbidden("Only founders/owners can manage content");
    const { id } = await params;

    const { error: dbErr } = await getSupabaseAdmin()
      .from("coach_modules")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (dbErr) return error("Failed to retire module", 500);
    return success({ retired: true });
  } catch (err) {
    console.error("coaching/modules/[id] DELETE error:", err);
    return error("Internal server error", 500);
  }
}
