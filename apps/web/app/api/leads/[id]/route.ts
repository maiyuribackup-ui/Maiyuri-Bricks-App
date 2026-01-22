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

    // Get current lead state to detect status transitions
    const { data: currentLead } = await supabaseAdmin
      .from("leads")
      .select("status, is_archived")
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
