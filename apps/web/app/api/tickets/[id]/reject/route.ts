export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  success,
  error,
  unauthorized,
  forbidden,
  parseBody,
} from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rejectTicket, canApproveTickets } from "@/lib/ticket-service";
import { rejectTicketSchema } from "@maiyuri/shared";

// PUT /api/tickets/[id]/reject - Reject a ticket
export async function PUT(
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

    // Check user role
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!canApproveTickets(userData?.role ?? "")) {
      return forbidden("You do not have permission to reject tickets");
    }

    const parsed = await parseBody(request, rejectTicketSchema);
    if (parsed.error) return parsed.error;

    const result = await rejectTicket(params.id, user.id, parsed.data);

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    return success({ message: result.message });
  } catch (err) {
    console.error("Error rejecting ticket:", err);
    return error("Internal server error", 500);
  }
}
