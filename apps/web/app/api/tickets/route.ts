export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  success,
  created,
  error,
  parseBody,
  parseQuery,
  unauthorized,
  forbidden,
} from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getTickets,
  createTicket,
  canApproveTickets,
} from "@/lib/ticket-service";
import { createTicketSchema, ticketFiltersSchema } from "@maiyuri/shared";
import type { Ticket } from "@maiyuri/shared";

// GET /api/tickets - List tickets with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorized();
    }

    // Get user role
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    // Only approvers can view all tickets; others see their own
    const queryParams = parseQuery(request);

    const filterResult = ticketFiltersSchema.safeParse({
      status: queryParams.status || undefined,
      priority: queryParams.priority || undefined,
      type: queryParams.type || undefined,
      created_by: queryParams.created_by || undefined,
      assigned_to: queryParams.assigned_to || undefined,
      from_date: queryParams.from_date || undefined,
      to_date: queryParams.to_date || undefined,
      search: queryParams.search || undefined,
    });

    const filters = filterResult.success ? filterResult.data : {};

    // If not an approver, only show own tickets
    if (!canApproveTickets(userData?.role ?? "")) {
      filters.created_by = user.id;
    }

    const tickets = await getTickets(filters);
    return success<Ticket[]>(tickets);
  } catch (err) {
    console.error("Error fetching tickets:", err);
    return error("Failed to fetch tickets", 500);
  }
}

// POST /api/tickets - Create a new ticket
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorized();
    }

    const parsed = await parseBody(request, createTicketSchema);
    if (parsed.error) return parsed.error;

    const result = await createTicket(parsed.data, user.id);

    if (!result.success) {
      return error(result.error ?? "Failed to create ticket", 500);
    }

    return created<Ticket>(result.data!);
  } catch (err) {
    console.error("Error creating ticket:", err);
    return error("Internal server error", 500);
  }
}
