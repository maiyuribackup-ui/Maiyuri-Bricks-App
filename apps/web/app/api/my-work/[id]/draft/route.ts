export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  assertActionable,
  assertAssignee,
  getWorkItemForUser,
  logWorkEvent,
  WorkAccessError,
} from "@/lib/my-work-service";
import { saveWorkDraftSchema } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/my-work/[id]/draft — autosave: the general note and/or partial
 * checklist responses. Never validates completeness; that's submit's job.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);
    assertAssignee(item, user);
    assertActionable(item);

    const parsed = await parseBody(request, saveWorkDraftSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    if (input.note !== undefined) {
      const { error: noteErr } = await supabaseAdmin
        .from("work_items")
        .update({ note: input.note })
        .eq("id", id);
      if (noteErr) return error("Failed to save your note", 500);
    }

    if (input.responses?.length) {
      if (!item.checklist_instance_id) {
        return error("This work item has no checklist", 400);
      }
      const rows = input.responses.map((r) => ({
        instance_id: item.checklist_instance_id,
        template_item_id: r.template_item_id,
        status: r.status ?? null,
        text_value: r.text_value ?? null,
        number_value: r.number_value ?? null,
        note: r.note ?? null,
        fail_reason: r.fail_reason ?? null,
        corrective_action: r.corrective_action ?? null,
        updated_by: user.id,
      }));
      const { error: respErr } = await supabaseAdmin
        .from("work_checklist_responses")
        .upsert(rows, { onConflict: "instance_id,template_item_id" });
      if (respErr) {
        console.error("[MyWork] draft responses failed:", respErr);
        return error("Failed to save your checklist answers", 500);
      }
    }

    await logWorkEvent({
      work_item_id: id,
      event_type: "draft_saved",
      performed_by: user.id,
    });

    return success({ saved_at: new Date().toISOString() });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] draft failed:", err);
    return error("Failed to save your draft", 500);
  }
}
