export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, unauthorized } from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { getTicket } from "@/lib/ticket-service";
import type { Ticket } from "@maiyuri/shared";

// GET /api/tickets/[id] - Get a single ticket
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

    const ticket = await getTicket(params.id);

    if (!ticket) {
      return notFound("Ticket not found");
    }

    return success<Ticket>(ticket);
  } catch (err) {
    console.error("Error fetching ticket:", err);
    return error("Failed to fetch ticket", 500);
  }
}
