export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/supabase-server";
import { createProjectSchema, type Project } from "@maiyuri/shared";

// GET /api/projects — list projects with light roll-up fields
export async function GET(request: NextRequest) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const { data: projects, error: dbErr } = await supabaseAdmin
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (dbErr) {
      console.error("projects list error:", dbErr);
      return error("Failed to load projects", 500);
    }
    return success<Project[]>(projects || []);
  } catch (err) {
    console.error("projects GET error:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/projects — create a project (from a won lead or standalone),
// applying a template to seed WBS + BOQ + a draft estimate.
export async function POST(request: NextRequest) {
  try {
    // Auth: cookie (web) or Bearer (mobile). These routes were open - fixed.
    if (!(await getUserFromRequest(request))) {
      return error("Authentication required", 401);
    }
    const parsed = await parseBody(request, createProjectSchema);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    // Carry over context from a linked lead, if provided.
    const projectRow: Record<string, unknown> = {
      name: input.name,
      lead_id: input.lead_id ?? null,
      template_id: input.template_id ?? null,
      customer_name: input.customer_name ?? null,
      customer_phone: input.customer_phone ?? null,
      location: input.location ?? null,
      project_type: input.project_type ?? null,
      project_manager: input.project_manager ?? null,
      supervisor: input.supervisor ?? null,
      start_date: input.start_date ?? null,
      planned_end_date: input.planned_end_date ?? null,
      telegram_chat_id: input.telegram_chat_id ?? null,
      notes: input.notes ?? null,
      status: "draft_estimate",
    };

    if (input.lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select(
          "name, contact, area, site_location, site_region, estimated_value, final_order_value, estimated_quantity",
        )
        .eq("id", input.lead_id)
        .single();
      if (lead) {
        projectRow.customer_name = projectRow.customer_name || lead.name;
        projectRow.customer_phone = projectRow.customer_phone || lead.contact;
        projectRow.location =
          projectRow.location ||
          lead.area ||
          lead.site_location ||
          lead.site_region ||
          null;
        projectRow.expected_revenue =
          lead.final_order_value || lead.estimated_value || null;
      }
    }

    const { data: project, error: insErr } = await supabaseAdmin
      .from("projects")
      .insert(projectRow)
      .select()
      .single();
    if (insErr || !project) {
      console.error("project insert error:", insErr);
      return error(`Failed to create project: ${insErr?.message ?? "unknown"}`, 500);
    }

    // Apply template → WBS items + draft estimate + BOQ items
    if (input.template_id) {
      const [{ data: tWbs }, { data: tBoq }] = await Promise.all([
        supabaseAdmin
          .from("template_wbs_items")
          .select("*")
          .eq("template_id", input.template_id)
          .order("seq", { ascending: true }),
        supabaseAdmin
          .from("template_boq_items")
          .select("*")
          .eq("template_id", input.template_id),
      ]);

      if (tWbs && tWbs.length > 0) {
        await supabaseAdmin.from("project_wbs_items").insert(
          tWbs.map((w: any) => ({
            project_id: project.id,
            seq: w.seq,
            code: w.code,
            name: w.name,
            parent_code: w.parent_code,
            unit: w.default_unit,
            status: "not_started",
          })),
        );
      }

      const { data: estimate } = await supabaseAdmin
        .from("project_estimates")
        .insert({ project_id: project.id, version: 1, status: "draft" })
        .select()
        .single();

      if (tBoq && tBoq.length > 0 && estimate) {
        await supabaseAdmin.from("boq_items").insert(
          tBoq.map((b: any, i: number) => ({
            project_id: project.id,
            estimate_id: estimate.id,
            code: `B${i + 1}`,
            name: b.name,
            description: b.description,
            unit: b.unit,
            cost_category: b.cost_category,
            quantity: 0,
            cost_rate: b.default_cost_rate,
            selling_rate: b.default_selling_rate,
            linked_wbs_code: b.linked_wbs_code,
          })),
        );
      }
    }

    return success<Project>(project);
  } catch (err) {
    console.error("projects POST error:", err);
    return error(
      `Internal server error: ${err instanceof Error ? err.message : "unknown"}`,
      500,
    );
  }
}
