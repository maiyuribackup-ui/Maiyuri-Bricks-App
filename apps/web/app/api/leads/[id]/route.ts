export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { updateLeadSchema, type Lead } from "@maiyuri/shared";

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
        "pipeline_stage, is_archived, factory_visit_status, factory_visit_at, won_at, lost_at",
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
