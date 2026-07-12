export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logWorkEvent } from "@/lib/my-work-service";
import { notifyWorkAssigned } from "@/lib/my-work-notify";
import type { WorkItem } from "@maiyuri/shared";

const CRON_SECRET = process.env.CRON_SECRET;

type TemplateRow = {
  id: string;
  name: string;
  activity_type: string;
  title: string;
  description: string | null;
  instructions: string | null;
  default_assigned_user_id: string | null;
  default_role: string | null;
  checklist_template_id: string | null;
  recurrence_rule: string | null;
  due_time: string | null; // HH:MM:SS
  priority: string;
  requires_photo: boolean;
  requires_note: boolean;
  requires_approval: boolean;
  related_label: string | null;
  related_project_id: string | null;
  linked_sop_slug: string | null;
};

/** Does the rule fire on the given IST date? */
function ruleMatches(rule: string, istDate: Date): boolean {
  if (rule === "daily") return true;
  const [kind, arg] = rule.split(":");
  const n = Number(arg);
  if (kind === "weekly") {
    const isoDow = istDate.getUTCDay() === 0 ? 7 : istDate.getUTCDay();
    return isoDow === n;
  }
  if (kind === "monthly") return istDate.getUTCDate() === n;
  return false;
}

/**
 * POST /api/my-work/generate — mint today's work items from recurring
 * templates (cron, runs early morning IST). Idempotent: one item per
 * template+assignee+date.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  try {
    const todayISO = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    // Anchored UTC date object for dow/dom math on the IST calendar day.
    const istDate = new Date(`${todayISO}T00:00:00Z`);

    const { data: templates, error: tplErr } = await supabaseAdmin
      .from("work_item_templates")
      .select("*")
      .eq("active", true)
      .not("recurrence_rule", "is", null);
    if (tplErr) return error("Failed to load templates", 500);

    let created = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const tpl of (templates ?? []) as TemplateRow[]) {
      if (!tpl.recurrence_rule || !ruleMatches(tpl.recurrence_rule, istDate)) {
        continue;
      }

      // Resolve assignees: a fixed person, or every active user with the role.
      let assignees: string[] = [];
      if (tpl.default_assigned_user_id) {
        assignees = [tpl.default_assigned_user_id];
      } else if (tpl.default_role) {
        const { data: users } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("role", tpl.default_role)
          .eq("is_active", true);
        assignees = (users ?? []).map((u) => u.id);
      }
      if (!assignees.length) {
        failures.push(`${tpl.name}: no assignee resolved`);
        continue;
      }

      const dueAt = tpl.due_time
        ? new Date(`${todayISO}T${tpl.due_time.slice(0, 5)}:00+05:30`).toISOString()
        : null;

      for (const userId of assignees) {
        // Idempotency: skip if this occurrence already exists.
        const { data: existing } = await supabaseAdmin
          .from("work_items")
          .select("id")
          .eq("template_id", tpl.id)
          .eq("assigned_user_id", userId)
          .eq("scheduled_date", todayISO)
          .maybeSingle();
        if (existing) {
          skipped += 1;
          continue;
        }

        // Checklist templates get a fresh dated instance per occurrence.
        let checklistInstanceId: string | null = null;
        if (tpl.activity_type === "checklist" && tpl.checklist_template_id) {
          const { data: instance, error: instErr } = await supabaseAdmin
            .from("work_checklist_instances")
            .insert({
              template_id: tpl.checklist_template_id,
              scheduled_date: todayISO,
            })
            .select("id")
            .single();
          if (instErr || !instance) {
            failures.push(`${tpl.name}: instance create failed`);
            continue;
          }
          checklistInstanceId = instance.id;
        }

        const { data: item, error: insErr } = await supabaseAdmin
          .from("work_items")
          .insert({
            title: tpl.title,
            description: tpl.description,
            instructions: tpl.instructions,
            activity_type: tpl.activity_type,
            status: "pending",
            priority: tpl.priority,
            assigned_user_id: userId,
            assigned_by_user_id: null, // system-generated
            due_at: dueAt,
            checklist_instance_id: checklistInstanceId,
            linked_sop_slug: tpl.linked_sop_slug,
            requires_photo: tpl.requires_photo,
            requires_note: tpl.requires_note,
            requires_approval: tpl.requires_approval,
            related_label: tpl.related_label,
            related_project_id: tpl.related_project_id,
            source_module: "recurring",
            template_id: tpl.id,
            scheduled_date: todayISO,
          })
          .select("*")
          .single();
        if (insErr || !item) {
          failures.push(`${tpl.name}: item create failed (${insErr?.message})`);
          if (checklistInstanceId) {
            await supabaseAdmin
              .from("work_checklist_instances")
              .delete()
              .eq("id", checklistInstanceId);
          }
          continue;
        }

        created += 1;
        await logWorkEvent({
          work_item_id: item.id,
          event_type: "created",
          new_status: "pending",
          performed_by: null,
          metadata: { source: "recurring", template_id: tpl.id },
        });
        void notifyWorkAssigned(item as WorkItem);
      }
    }

    return success({ date: todayISO, created, skipped, failures });
  } catch (err) {
    console.error("[MyWork] generate failed:", err);
    return error("Generation failed", 500);
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
