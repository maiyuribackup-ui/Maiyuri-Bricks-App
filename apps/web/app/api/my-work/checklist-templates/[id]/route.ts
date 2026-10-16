export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isWorkAdmin } from "@/lib/my-work-service";

const itemPatchSchema = z.object({
  /** present = update this existing item; absent = insert a new one */
  id: z.string().uuid().optional(),
  prompt: z.string().min(1),
  input_type: z.enum(["status", "text", "number"]).default("status"),
  mandatory: z.boolean().default(true),
  allow_na: z.boolean().default(true),
  requires_photo: z.boolean().default(false),
  requires_photo_on_fail: z.boolean().default(false),
  requires_corrective_action_on_fail: z.boolean().default(true),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  /** Full desired item list, in display order (existing carry their id). */
  items: z.array(itemPatchSchema).min(1).optional(),
  /** Item ids the user removed in the editor. */
  remove_item_ids: z.array(z.string().uuid()).optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/my-work/checklist-templates/[id] — edit a checklist (audit R4).
 * Safe-edit rules:
 * - rename / description / active toggle: always allowed
 * - item prompt/flags edits + new items: always allowed
 * - item REMOVAL: only when the item has never been referenced by a run —
 *   the responses FK RESTRICTs deletion, so used items are reported back as
 *   `kept_in_use` instead of failing the whole save (history stays intact).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("You do not have permission to edit templates", 403);
    }
    const { id } = await params;

    const { data: template } = await supabaseAdmin
      .from("work_checklist_templates")
      .select("id")
      .eq("id", id)
      .single();
    if (!template) return error("Checklist template not found", 404);

    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    // 1. Template fields
    const tplPatch: Record<string, unknown> = {};
    if (input.name !== undefined) tplPatch.name = input.name;
    if (input.description !== undefined) tplPatch.description = input.description;
    if (input.active !== undefined) tplPatch.active = input.active;
    if (Object.keys(tplPatch).length) {
      const { error: updErr } = await supabaseAdmin
        .from("work_checklist_templates")
        .update(tplPatch)
        .eq("id", id);
      if (updErr) return error(`Failed to update template: ${updErr.message}`, 500);
    }

    // 2. Removals — only items never referenced by any run
    const keptInUse: string[] = [];
    for (const itemId of input.remove_item_ids ?? []) {
      const { count } = await supabaseAdmin
        .from("work_checklist_responses")
        .select("id", { count: "exact", head: true })
        .eq("template_item_id", itemId);
      if ((count ?? 0) > 0) {
        keptInUse.push(itemId);
        continue;
      }
      const { error: delErr } = await supabaseAdmin
        .from("work_checklist_template_items")
        .delete()
        .eq("id", itemId)
        .eq("template_id", id);
      if (delErr) keptInUse.push(itemId); // FK raced us — keep it
    }

    // 3. Item updates + inserts, re-sequenced in the submitted order
    if (input.items) {
      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const fields = {
          prompt: item.prompt,
          sort_order: i + 1,
          input_type: item.input_type,
          mandatory: item.mandatory,
          allow_na: item.allow_na,
          requires_photo: item.requires_photo,
          requires_photo_on_fail: item.requires_photo_on_fail,
          requires_corrective_action_on_fail:
            item.requires_corrective_action_on_fail,
        };
        if (item.id) {
          const { error: uErr } = await supabaseAdmin
            .from("work_checklist_template_items")
            .update(fields)
            .eq("id", item.id)
            .eq("template_id", id);
          if (uErr) return error(`Failed to update an item: ${uErr.message}`, 500);
        } else {
          const { error: iErr } = await supabaseAdmin
            .from("work_checklist_template_items")
            .insert({ ...fields, template_id: id });
          if (iErr) return error(`Failed to add an item: ${iErr.message}`, 500);
        }
      }
    }

    const { data: fresh } = await supabaseAdmin
      .from("work_checklist_templates")
      .select("*, items:work_checklist_template_items(*)")
      .eq("id", id)
      .single();

    return success({ template: fresh, kept_in_use: keptInUse });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[MyWork] template PATCH failed:", err);
    return error("Failed to update the checklist template", 500);
  }
}
