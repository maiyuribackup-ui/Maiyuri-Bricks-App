export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success } from "@/lib/api-utils";
import { requireAuth } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listEvents, requireInstance } from "@/lib/process/repository";
import { runProcessRoute } from "@/lib/process/route-utils";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/process/instances/[id]/history — the audit timeline (PRD §28). */
export async function GET(request: NextRequest, { params }: Params) {
  return runProcessRoute("Failed to load the history", async () => {
    await requireAuth(request);
    const { id } = await params;
    await requireInstance(id);
    const events = await listEvents(id);
    const actorIds = [
      ...new Set(events.map((e) => e.actor_id).filter((a): a is string => !!a)),
    ];
    const { data: users } = actorIds.length
      ? await supabaseAdmin.from("users").select("id, name").in("id", actorIds)
      : { data: [] as { id: string; name: string }[] };
    const names = new Map(
      (users ?? []).map((u) => [u.id as string, u.name as string]),
    );
    return success(
      events.map((e) => {
        const { dispatched_at: _d, ...payload } = (e.payload ?? {}) as Record<
          string,
          unknown
        >;
        void _d;
        return {
          ...e,
          payload,
          actor_name: e.actor_id ? (names.get(e.actor_id) ?? null) : null,
        };
      }),
    );
  });
}
