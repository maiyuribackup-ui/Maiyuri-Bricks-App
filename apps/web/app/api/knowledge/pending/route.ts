export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { routes } from "@maiyuri/api";
import { success, error } from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

// GET /api/knowledge/pending - Get pending knowledge entries for review
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get("sourceType") as
      | "objection"
      | "suggestion"
      | "coaching"
      | "conversion"
      | "call_summary"
      | null;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sortBy = (searchParams.get("sortBy") || "frequency") as
      | "frequency"
      | "created_at";

    const result = await routes.knowledge.getPendingQueue({
      sourceType: sourceType ?? undefined,
      limit,
      offset,
      sortBy,
    });

    if (!result.success) {
      return error(result.error?.message || "Failed to get pending queue", 500);
    }

    return success(result.data || []);
  } catch (err) {
    console.error("Error getting pending queue:", err);
    return error("Failed to get pending knowledge queue", 500);
  }
}

// POST /api/knowledge/pending - Approve a pending entry
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return error("Unauthorized", 401);
    }

    const body = await request.json();
    const { entryId, answer, action } = body;

    if (!entryId) {
      return error("Entry ID is required", 400);
    }

    if (action === "approve") {
      if (!answer || answer.trim().length === 0) {
        return error("Answer is required when approving", 400);
      }

      const result = await routes.knowledge.approvePendingEntry(
        entryId,
        answer,
        user.id,
      );

      if (!result.success) {
        return error(result.error?.message || "Failed to approve entry", 500);
      }

      return success({ knowledgeId: result.data, status: "approved" });
    } else if (action === "reject") {
      const result = await routes.knowledge.rejectPendingEntry(
        entryId,
        user.id,
      );

      if (!result.success) {
        return error(result.error?.message || "Failed to reject entry", 500);
      }

      return success({ status: "rejected" });
    } else {
      return error('Invalid action. Use "approve" or "reject"', 400);
    }
  } catch (err) {
    console.error("Error processing pending entry:", err);
    return error("Failed to process pending entry", 500);
  }
}
