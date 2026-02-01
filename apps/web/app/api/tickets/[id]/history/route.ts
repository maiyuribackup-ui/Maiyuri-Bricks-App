export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized } from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { getTicketHistory } from "@/lib/ticket-service";
import type { TicketHistoryEntry } from "@maiyuri/shared";

// GET /api/tickets/[id]/history - Get ticket history
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorized();
    }

    const history = await getTicketHistory(params.id);
    return success<TicketHistoryEntry[]>(history);
  } catch (err) {
    console.error("Error fetching ticket history:", err);
    return error("Failed to fetch ticket history", 500);
  }
}
