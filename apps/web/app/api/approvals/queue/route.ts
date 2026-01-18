export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized } from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { getApprovalQueueStats } from "@/lib/ticket-service";
import type { ApprovalQueueStats } from "@maiyuri/shared";

// GET /api/approvals/queue - Get approval queue statistics
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorized();
    }

    const stats = await getApprovalQueueStats(user.id);
    return success<ApprovalQueueStats>(stats);
  } catch (err) {
    console.error("Error fetching approval queue stats:", err);
    return error("Failed to fetch approval queue stats", 500);
  }
}
