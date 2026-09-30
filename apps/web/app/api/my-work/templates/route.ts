export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isWorkAdmin } from "@/lib/my-work-service";

// 'daily' | 'weekly:<1-7>' (ISO dow, 1=Mon) | 'monthly:<1-28>'
const RECURRENCE_RE = /^(daily|weekly:[1-7]|monthly:([1-9]|1\d|2[0-8]))$/;

const templateSchema = z
  .object({
    id: z.string().uuid().optional(), // present = update
    name: z.string().min(2),
    title: z.string().min(2),
    description: z.string().nullable().optional(),
    instructions: z.string().nullable().optional(),
    activity_type: z
      .enum(["simple", "checklist", "inspection", "report", "approval"])
      .default("simple"),
    default_assigned_user_id: z.string().uuid().nullable().optional(),
    default_role: z.string().nullable().optional(),
    checklist_template_id: z.string().uuid().nullable().optional(),
    recurrence_rule: z
      .string()
      .regex(RECURRENCE_RE, "Use daily, weekly:1-7 or monthly:1-28")
      .nullable()
      .optional(),
    due_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
      .nullable()
      .optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    requires_photo: z.boolean().default(false),
    requires_note: z.boolean().default(false),
    requires_approval: z.boolean().default(false),
    related_label: z.string().nullable().optional(),
    linked_sop_slug: z.string().nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine((t) => t.default_assigned_user_id || t.default_role, {
    message: "Assign to a person or a role",
  })
  .refine(
    (t) => t.activity_type !== "checklist" || !!t.checklist_template_id,
    { message: "Checklist templates need a checklist" },
  );

// GET /api/my-work/templates — recurring templates (supervisors)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("Only supervisors can manage templates", 403);
    }
    const { data, error: dbErr } = await supabaseAdmin
      .from("work_item_templates")
      .select(
        "*, checklist_template:work_checklist_templates(id, name), default_assignee:users!work_item_templates_default_assigned_user_id_fkey(id, name)",
      )
      .order("created_at", { ascending: false });
    if (dbErr) return error("Failed to load templates", 500);
    return success(data ?? []);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[MyWork] templates GET failed:", err);
    return error("Failed to load templates", 500);
  }
}

// POST /api/my-work/templates — create/update (supervisors)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!isWorkAdmin(user.role)) {
      return error("Only supervisors can manage templates", 403);
    }
    const parsed = await parseBody(request, templateSchema);
    if (parsed.error) return parsed.error;
    const { id, ...fields } = parsed.data;

    const result = id
      ? await supabaseAdmin
          .from("work_item_templates")
          .update(fields)
          .eq("id", id)
          .select("*")
          .single()
      : await supabaseAdmin
          .from("work_item_templates")
          .insert({ ...fields, created_by: user.id })
          .select("*")
          .single();

    if (result.error || !result.data) {
      return error(`Failed to save template: ${result.error?.message}`, 500);
    }
    return success(result.data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[MyWork] templates POST failed:", err);
    return error("Failed to save template", 500);
  }
}
