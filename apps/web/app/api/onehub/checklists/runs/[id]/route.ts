export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const tickSchema = z.object({
  item_id: z.string().min(1),
  done: z.boolean(),
});

// PATCH /api/onehub/checklists/runs/[id] — tick/untick one item
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth(request);
    const parsed = await parseBody(request, tickSchema);
    if (parsed.error) return parsed.error;

    const { data: run } = await supabaseAdmin
      .from("onehub_checklist_runs")
      .select("id, statuses, template_id")
      .eq("id", params.id)
      .single();
    if (!run) return notFound("Checklist run not found");

    const statuses = { ...(run.statuses as Record<string, unknown>) };
    if (parsed.data.done) {
      statuses[parsed.data.item_id] = {
        done: true,
        by: user.id,
        at: new Date().toISOString(),
      };
    } else {
      delete statuses[parsed.data.item_id];
    }

    // Completed when every template item is ticked.
    const { data: template } = await supabaseAdmin
      .from("onehub_checklist_templates")
      .select("phases")
      .eq("id", run.template_id)
      .single();
    const allItems = ((template?.phases as { items: { id: string }[] }[]) ?? [])
      .flatMap((p) => p.items.map((i) => i.id));
    const complete =
      allItems.length > 0 && allItems.every((id) => statuses[id]);

    const { data, error: dbError } = await supabaseAdmin
      .from("onehub_checklist_runs")
      .update({
        statuses,
        completed_at: complete ? new Date().toISOString() : null,
      })
      .eq("id", params.id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update checklist", 500);
    return success(data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("checklist run PATCH failed:", err);
    return error("Failed to update checklist", 500);
  }
}
