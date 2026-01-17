export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
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

    // Issue #2: Auto-archive when status changes to 'lost'
    const updateData = { ...parsed.data };
    if (updateData.status === "lost") {
      updateData.is_archived = true;
      updateData.archived_at = new Date().toISOString();
      updateData.archive_reason = "Auto-archived: Lead marked as lost";
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
