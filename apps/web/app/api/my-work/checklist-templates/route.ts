export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isWorkAdmin } from "@/lib/my-work-service";
import { createChecklistTemplateSchema } from "@maiyuri/shared";
import type { WorkChecklistTemplate } from "@maiyuri/shared";

// GET /api/my-work/checklist-templates — active templates with items
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { data, error: dbErr } = await supabaseAdmin
      .from("work_checklist_templates")
      .select("*, items:work_checklist_template_items(*)")
      .eq("active", true)
      .order("name");

    if (dbErr) {
      console.error("[MyWork] templates fetch failed:", dbErr);
      return error("Failed to load checklist templates", 500);
    }
    return success<WorkChecklistTemplate[]>(
      (data ?? []) as WorkChecklistTemplate[],
    );
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[MyWork] templates GET failed:", err);
    return error("Failed to load checklist templates", 500);
  }
}

// POST /api/my-work/checklist-templates — admin create (with items)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("You do not have permission to create templates", 403);
    }

    const parsed = await parseBody(request, createChecklistTemplateSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const { data: template, error: tplErr } = await supabaseAdmin
      .from("work_checklist_templates")
      .insert({
        name: input.name,
        description: input.description ?? null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (tplErr || !template) {
      console.error("[MyWork] template create failed:", tplErr);
      return error("Failed to create the checklist template", 500);
    }

    const { error: itemsErr } = await supabaseAdmin
      .from("work_checklist_template_items")
      .insert(
        input.items.map((item, index) => ({
          template_id: template.id,
          prompt: item.prompt,
          sort_order: index + 1,
          input_type: item.input_type,
          mandatory: item.mandatory,
          allow_na: item.allow_na,
          requires_photo: item.requires_photo,
          requires_photo_on_fail: item.requires_photo_on_fail,
          requires_corrective_action_on_fail:
            item.requires_corrective_action_on_fail,
        })),
      );

    if (itemsErr) {
      // Roll back the header so we never keep an empty template
      await supabaseAdmin
        .from("work_checklist_templates")
        .delete()
        .eq("id", template.id);
      console.error("[MyWork] template items failed:", itemsErr);
      return error("Failed to create the checklist items", 500);
    }

    return success<WorkChecklistTemplate>(template as WorkChecklistTemplate);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[MyWork] templates POST failed:", err);
    return error("Failed to create the checklist template", 500);
  }
}
