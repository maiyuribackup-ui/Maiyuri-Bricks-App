export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push/fcm";
import { updateLeadSchema, type Lead } from "@maiyuri/shared";

function prettyLabel(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/leads/[id] - Get a single lead
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data: lead, error: dbError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return notFound("Lead not found");
      }
      console.error("Database error:", dbError);
      return error("Failed to fetch lead", 500);
    }

    return success<Lead>(lead);
  } catch (err) {
    console.error("Error fetching lead:", err);
    return error("Internal server error", 500);
  }
}

// PUT /api/leads/[id] - Update a lead
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const parsed = await parseBody(request, updateLeadSchema);
    if (parsed.error) return parsed.error;

    // Get the authenticated user (optional - for archived_by tracking)
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Get current lead state to detect pipeline transitions
    const { data: currentLead } = await supabaseAdmin
      .from("leads")
      .select(
        "name, assigned_staff, lead_status, lead_temperature, follow_up_date, pipeline_stage, is_archived, factory_visit_status, factory_visit_at, won_at, lost_at",
      )
      .eq("id", id)
      .single();

    // Clean undefined values from parsed data to prevent DB issues
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    // Handle auto-archive/unarchive on pipeline transitions (Issue #12)
    if (updateData.pipeline_stage && currentLead) {
      const wasLost = currentLead.pipeline_stage === "closed_lost";
      const becomingLost = updateData.pipeline_stage === "closed_lost";

      if (!wasLost && becomingLost) {
        // Transitioning TO lost: auto-archive
        updateData.is_archived = true;
        updateData.archived_at = new Date().toISOString();
        updateData.archived_by = user?.id ?? null;
        updateData.archive_reason = "Auto-archived: Lead marked as lost";
      } else if (wasLost && !becomingLost && currentLead.is_archived) {
        // Transitioning FROM lost: auto-unarchive (restore)
        updateData.is_archived = false;
        updateData.archived_at = null;
        updateData.archived_by = null;
        updateData.archive_reason = null;
      }
    }

    // Stamp funnel-event timestamps the first time a lead reaches each
    // milestone — powers factory-visit conversion + time-to-win analytics.
    // Only set when not already set, and don't clobber an explicit value.
    const nowIso = new Date().toISOString();
    if (currentLead) {
      // Factory visited
      if (
        updateData.factory_visit_status === "visited" &&
        currentLead.factory_visit_status !== "visited" &&
        !currentLead.factory_visit_at &&
        updateData.factory_visit_at === undefined
      ) {
        updateData.factory_visit_at = nowIso;
      }
      // Order won
      if (
        updateData.pipeline_stage === "order_won" &&
        currentLead.pipeline_stage !== "order_won" &&
        !currentLead.won_at &&
        updateData.won_at === undefined
      ) {
        updateData.won_at = nowIso;
      }
      // Closed lost
      if (
        updateData.pipeline_stage === "closed_lost" &&
        currentLead.pipeline_stage !== "closed_lost" &&
        !currentLead.lost_at &&
        updateData.lost_at === undefined
      ) {
        updateData.lost_at = nowIso;
      }
    }

    const { data: lead, error: dbError } = await supabaseAdmin
      .from("leads")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return notFound("Lead not found");
      }
      console.error("Database error updating lead:", dbError);
      return error(
        `Failed to update lead: ${dbError.message ?? dbError.code ?? "Unknown database error"}`,
        500,
      );
    }

    // Native push on meaningful updates (best-effort, non-blocking).
    // Two cases:
    //  1) Reassignment → always ping the NEW owner ("a lead was assigned to you").
    //  2) Status/stage/temperature/follow-up change → ping the assigned rep,
    //     but skip when the editor is updating their own lead (no self-pings).
    (async () => {
      const editorId = user?.id ?? null;
      const prevAssignee = (currentLead?.assigned_staff as string | null) ?? null;
      const newAssignee = (lead.assigned_staff as string | null) ?? null;
      const leadName = lead.name || "Lead";
      const url = `/leads/${lead.id}`;

      // Case 1: reassignment.
      if (newAssignee && newAssignee !== prevAssignee) {
        await sendPushToUser(newAssignee, {
          title: "📋 A lead was assigned to you",
          body: leadName,
          data: { url },
        });
      }

      // Case 2: meaningful field change → notify the (unchanged) owner.
      if (newAssignee && newAssignee === prevAssignee && newAssignee !== editorId) {
        const changes: string[] = [];
        if (
          updateData.pipeline_stage &&
          updateData.pipeline_stage !== currentLead?.pipeline_stage
        ) {
          changes.push(`Stage → ${prettyLabel(updateData.pipeline_stage)}`);
        }
        if (
          updateData.lead_status &&
          updateData.lead_status !== currentLead?.lead_status
        ) {
          changes.push(`Status → ${prettyLabel(updateData.lead_status)}`);
        }
        if (
          updateData.lead_temperature &&
          updateData.lead_temperature !== currentLead?.lead_temperature
        ) {
          changes.push(`${prettyLabel(updateData.lead_temperature)} lead`);
        }
        if (
          updateData.follow_up_date &&
          updateData.follow_up_date !== currentLead?.follow_up_date
        ) {
          changes.push("Follow-up rescheduled");
        }
        if (changes.length > 0) {
          await sendPushToUser(newAssignee, {
            title: `✏️ ${leadName} updated`,
            body: changes.join(" · "),
            data: { url },
          });
        }
      }
    })().catch((err) => {
      console.error("Failed to send lead-update push:", err);
    });

    return success<Lead>(lead);
  } catch (err) {
    console.error("Error updating lead:", err);
    return error(
      `Internal server error: ${err instanceof Error ? err.message : "Unknown error"}`,
      500,
    );
  }
}

// DELETE /api/leads/[id] - Delete a lead
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { error: dbError } = await supabaseAdmin
      .from("leads")
      .delete()
      .eq("id", id);

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to delete lead", 500);
    }

    return success({ deleted: true });
  } catch (err) {
    console.error("Error deleting lead:", err);
    return error("Internal server error", 500);
  }
}
