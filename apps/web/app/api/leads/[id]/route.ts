export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { updateLeadSchema, type Lead } from "@maiyuri/shared";
import { notifyFactoryVisitScheduled } from "@/lib/telegram";

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

    // Get current lead state to detect status/stage transitions
    const { data: currentLead } = await supabaseAdmin
      .from("leads")
      .select("status, stage, is_archived, name, contact, site_location, site_region")
      .eq("id", id)
      .single();

    const updateData = { ...parsed.data };

    // Handle auto-archive/unarchive on status transitions (Issue #12)
    if (updateData.status && currentLead) {
      const wasLost = currentLead.status === "lost";
      const becomingLost = updateData.status === "lost";

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
      console.error("Database error:", dbError);
      return error("Failed to update lead", 500);
    }

    // Handle factory visit pending stage transition
    // Create task for engineer and send Telegram notification
    if (
      currentLead &&
      updateData.stage === "factory_visit_pending" &&
      currentLead.stage !== "factory_visit_pending"
    ) {
      // Find an engineer to assign the task to
      const { data: engineers } = await supabaseAdmin
        .from("users")
        .select("id, name")
        .eq("role", "engineer")
        .eq("is_active", true)
        .limit(1);

      const engineerId = engineers?.[0]?.id ?? null;

      // Calculate due date (3 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);

      // Create task for factory visit
      const taskData = {
        title: `Factory Visit: ${currentLead.name}`,
        description: `Schedule and complete factory visit for ${currentLead.name}.\nContact: ${currentLead.contact}${currentLead.site_location ? `\nLocation: ${currentLead.site_location}` : ""}`,
        status: "todo",
        priority: "high",
        due_date: dueDate.toISOString(),
        assigned_to: engineerId,
        lead_id: id,
      };

      const { error: taskError } = await supabaseAdmin
        .from("tasks")
        .insert(taskData);

      if (taskError) {
        console.error("Failed to create factory visit task:", taskError);
      }

      // Send Telegram notification to engineer channel (non-blocking)
      notifyFactoryVisitScheduled({
        leadId: id,
        leadName: currentLead.name,
        contact: currentLead.contact,
        siteLocation: currentLead.site_location,
        siteRegion: currentLead.site_region,
      }).catch((err) => {
        console.error("Failed to send factory visit Telegram notification:", err);
      });
    }

    return success<Lead>(lead);
  } catch (err) {
    console.error("Error updating lead:", err);
    return error("Internal server error", 500);
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
