/**
 * Ticket Service - Approval Workflow Management
 * Handles ticketing system for production orders, quotes, and payments
 * GitHub Issue #25
 */

import { createClient } from "@supabase/supabase-js";
import type {
  Ticket,
  TicketHistoryEntry,
  TicketFilters,
  TicketStatus,
  TicketPriority,
  TicketType,
  CreateTicketInput,
  ApproveTicketInput,
  RejectTicketInput,
  RequestChangesInput,
  ApprovalQueueStats,
} from "@maiyuri/shared";
import {
  createManufacturingOrderInOdoo,
  markManufacturingOrderDoneInOdoo,
  updateProductionOrderStatus,
} from "./production-service";

// Lazy Supabase client for server-side operations
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface ServiceResult<T = void> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// ============================================================================
// Ticket CRUD Operations
// ============================================================================

/**
 * Create a new ticket
 */
export async function createTicket(
  input: CreateTicketInput,
  userId: string,
): Promise<ServiceResult<Ticket>> {
  try {
    const supabase = getSupabase();

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        production_order_id: input.production_order_id ?? null,
        lead_id: input.lead_id ?? null,
        due_date: input.due_date ?? null,
        assigned_to: input.assigned_to ?? null,
        created_by: userId,
        status: "pending",
      })
      .select(
        `
        *,
        created_by_user:users!tickets_created_by_fkey(id, full_name, email)
      `,
      )
      .single();

    if (error) {
      return {
        success: false,
        message: "Failed to create ticket",
        error: error.message,
      };
    }

    // Add history entry
    await addTicketHistory(
      ticket.id,
      "created",
      null,
      null,
      null,
      null,
      userId,
    );

    return {
      success: true,
      message: `Ticket ${ticket.ticket_number} created`,
      data: ticket as Ticket,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to create ticket",
      error: errorMessage,
    };
  }
}

/**
 * Get tickets with filters
 */
export async function getTickets(filters?: TicketFilters): Promise<Ticket[]> {
  let query = getSupabase()
    .from("tickets")
    .select(
      `
      *,
      created_by_user:users!tickets_created_by_fkey(id, full_name, email),
      assigned_to_user:users!tickets_assigned_to_fkey(id, full_name, email),
      resolved_by_user:users!tickets_resolved_by_fkey(id, full_name),
      production_order:production_orders(
        id,
        order_number,
        status,
        planned_quantity,
        finished_good:finished_goods(id, name)
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.priority) {
    query = query.eq("priority", filters.priority);
  }
  if (filters?.type) {
    query = query.eq("type", filters.type);
  }
  if (filters?.created_by) {
    query = query.eq("created_by", filters.created_by);
  }
  if (filters?.assigned_to) {
    query = query.eq("assigned_to", filters.assigned_to);
  }
  if (filters?.from_date) {
    query = query.gte("created_at", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("created_at", filters.to_date);
  }
  if (filters?.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,ticket_number.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Ticket[];
}

/**
 * Get a single ticket by ID
 */
export async function getTicket(ticketId: string): Promise<Ticket | null> {
  const { data, error } = await getSupabase()
    .from("tickets")
    .select(
      `
      *,
      created_by_user:users!tickets_created_by_fkey(id, full_name, email),
      assigned_to_user:users!tickets_assigned_to_fkey(id, full_name, email),
      resolved_by_user:users!tickets_resolved_by_fkey(id, full_name),
      production_order:production_orders(
        id,
        order_number,
        status,
        planned_quantity,
        scheduled_date,
        finished_good:finished_goods(id, name)
      )
    `,
    )
    .eq("id", ticketId)
    .single();

  if (error) throw error;
  return data as Ticket;
}

/**
 * Get ticket history
 */
export async function getTicketHistory(
  ticketId: string,
): Promise<TicketHistoryEntry[]> {
  const { data, error } = await getSupabase()
    .from("ticket_history")
    .select(
      `
      *,
      performed_by_user:users!ticket_history_performed_by_fkey(id, full_name)
    `,
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TicketHistoryEntry[];
}

// ============================================================================
// Ticket Actions
// ============================================================================

/**
 * Approve a ticket - triggers Odoo sync for production orders
 */
export async function approveTicket(
  ticketId: string,
  userId: string,
  input?: ApproveTicketInput,
): Promise<ServiceResult> {
  try {
    const supabase = getSupabase();

    // Get the ticket
    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    if (ticket.status === "approved") {
      return { success: false, message: "Ticket is already approved" };
    }

    // Update ticket status
    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        approval_notes: input?.notes ?? null,
      })
      .eq("id", ticketId);

    if (updateError) {
      return {
        success: false,
        message: "Failed to update ticket",
        error: updateError.message,
      };
    }

    // Add history entry
    await addTicketHistory(
      ticketId,
      "approved",
      "status",
      ticket.status,
      "approved",
      input?.notes ?? null,
      userId,
    );

    // Handle production order approval
    if (ticket.type === "production_order" && ticket.production_order_id) {
      // Update production order status to approved
      await updateProductionOrderStatus(
        ticket.production_order_id,
        "approved",
        userId,
      );

      // Create MO in Odoo if not already synced
      const order = await getSupabase()
        .from("production_orders")
        .select("odoo_production_id")
        .eq("id", ticket.production_order_id)
        .single();

      if (!order.data?.odoo_production_id) {
        // Sync to Odoo
        const syncResult = await createManufacturingOrderInOdoo(
          ticket.production_order_id,
        );
        if (!syncResult.success) {
          console.error("Failed to sync to Odoo:", syncResult.error);
        }
      }

      // Mark as done in Odoo
      const doneResult = await markManufacturingOrderDoneInOdoo(
        ticket.production_order_id,
      );
      if (!doneResult.success) {
        console.error("Failed to mark MO as done:", doneResult.error);
      }
    }

    return { success: true, message: "Ticket approved successfully" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to approve ticket",
      error: errorMessage,
    };
  }
}

/**
 * Reject a ticket
 */
export async function rejectTicket(
  ticketId: string,
  userId: string,
  input: RejectTicketInput,
): Promise<ServiceResult> {
  try {
    const supabase = getSupabase();

    // Get the ticket
    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    // Update ticket status
    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        rejection_reason: input.reason,
      })
      .eq("id", ticketId);

    if (updateError) {
      return {
        success: false,
        message: "Failed to update ticket",
        error: updateError.message,
      };
    }

    // Add history entry
    await addTicketHistory(
      ticketId,
      "rejected",
      "status",
      ticket.status,
      "rejected",
      input.reason,
      userId,
    );

    // Handle production order rejection - revert to draft
    if (ticket.type === "production_order" && ticket.production_order_id) {
      await updateProductionOrderStatus(ticket.production_order_id, "draft");
    }

    return { success: true, message: "Ticket rejected" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to reject ticket",
      error: errorMessage,
    };
  }
}

/**
 * Request changes on a ticket
 */
export async function requestChanges(
  ticketId: string,
  userId: string,
  input: RequestChangesInput,
): Promise<ServiceResult> {
  try {
    const supabase = getSupabase();

    // Get the ticket
    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    // Update ticket status
    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "changes_requested",
        rejection_reason: input.reason,
      })
      .eq("id", ticketId);

    if (updateError) {
      return {
        success: false,
        message: "Failed to update ticket",
        error: updateError.message,
      };
    }

    // Add history entry
    await addTicketHistory(
      ticketId,
      "changes_requested",
      "status",
      ticket.status,
      "changes_requested",
      input.reason,
      userId,
    );

    // Handle production order - revert to draft for edits
    if (ticket.type === "production_order" && ticket.production_order_id) {
      await updateProductionOrderStatus(ticket.production_order_id, "draft");
    }

    return { success: true, message: "Changes requested" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to request changes",
      error: errorMessage,
    };
  }
}

/**
 * Add a comment to a ticket
 */
export async function addTicketComment(
  ticketId: string,
  userId: string,
  comment: string,
): Promise<ServiceResult> {
  try {
    await addTicketHistory(
      ticketId,
      "commented",
      null,
      null,
      null,
      comment,
      userId,
    );
    return { success: true, message: "Comment added" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to add comment",
      error: errorMessage,
    };
  }
}

/**
 * Assign a ticket to a user
 */
export async function assignTicket(
  ticketId: string,
  assigneeId: string | null,
  userId: string,
): Promise<ServiceResult> {
  try {
    const supabase = getSupabase();

    // Get the ticket
    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    // Update ticket
    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        assigned_to: assigneeId,
        status: assigneeId ? "in_review" : ticket.status,
      })
      .eq("id", ticketId);

    if (updateError) {
      return {
        success: false,
        message: "Failed to assign ticket",
        error: updateError.message,
      };
    }

    // Add history entry
    await addTicketHistory(
      ticketId,
      "assigned",
      "assigned_to",
      ticket.assigned_to ?? "unassigned",
      assigneeId ?? "unassigned",
      null,
      userId,
    );

    return {
      success: true,
      message: assigneeId ? "Ticket assigned" : "Ticket unassigned",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to assign ticket",
      error: errorMessage,
    };
  }
}

// ============================================================================
// Submit for Approval
// ============================================================================

/**
 * Submit a production order for approval
 * Creates a ticket and updates production order status
 */
export async function submitProductionOrderForApproval(
  orderId: string,
  userId: string,
  priority: TicketPriority = "medium",
  notes?: string,
  dueDate?: string,
): Promise<ServiceResult<Ticket>> {
  try {
    const supabase = getSupabase();

    // Get the production order
    const { data: order, error: orderError } = await supabase
      .from("production_orders")
      .select(
        `
        *,
        finished_good:finished_goods(id, name)
      `,
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return { success: false, message: "Production order not found" };
    }

    // Check if already pending approval
    if (order.status === "pending_approval") {
      return { success: false, message: "Order is already pending approval" };
    }

    // Check if already has a pending ticket
    const { data: existingTicket } = await supabase
      .from("tickets")
      .select("id, ticket_number")
      .eq("production_order_id", orderId)
      .in("status", ["pending", "in_review"])
      .single();

    if (existingTicket) {
      return {
        success: false,
        message: `Order already has pending ticket: ${existingTicket.ticket_number}`,
      };
    }

    // Create the ticket
    const ticketResult = await createTicket(
      {
        type: "production_order",
        title: `MO Approval: ${order.order_number} - ${order.finished_good?.name ?? "Unknown"}`,
        description:
          notes ??
          `Production order ${order.order_number} submitted for approval.`,
        priority,
        production_order_id: orderId,
        due_date: dueDate ?? null,
      },
      userId,
    );

    if (!ticketResult.success || !ticketResult.data) {
      return {
        success: false,
        message: "Failed to create approval ticket",
        error: ticketResult.error,
      };
    }

    // Update production order status and link ticket
    await supabase
      .from("production_orders")
      .update({
        status: "pending_approval",
        ticket_id: ticketResult.data.id,
        submitted_for_approval_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    return {
      success: true,
      message: `Submitted for approval - Ticket ${ticketResult.data.ticket_number}`,
      data: ticketResult.data,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to submit for approval",
      error: errorMessage,
    };
  }
}

// ============================================================================
// Dashboard & Stats
// ============================================================================

/**
 * Get approval queue statistics
 */
export async function getApprovalQueueStats(
  userId?: string,
): Promise<ApprovalQueueStats> {
  const supabase = getSupabase();

  // Get pending count
  const { count: pendingCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  // Get urgent count
  const { count: urgentCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "in_review"])
    .eq("priority", "urgent");

  // Get in_review count
  const { count: inReviewCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("status", "in_review");

  // Get total count
  const { count: totalCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true });

  // Get approved today count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: approvedTodayCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .gte("resolved_at", today.toISOString());

  // Get my assigned count if userId provided
  let myAssignedCount = 0;
  if (userId) {
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", userId)
      .in("status", ["pending", "in_review"]);
    myAssignedCount = count ?? 0;
  }

  return {
    pending: pendingCount ?? 0,
    urgent: urgentCount ?? 0,
    in_review: inReviewCount ?? 0,
    approved_today: approvedTodayCount ?? 0,
    total: totalCount ?? 0,
    my_assigned_count: myAssignedCount,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Add a history entry to a ticket
 */
async function addTicketHistory(
  ticketId: string,
  action: string,
  fieldChanged: string | null,
  oldValue: string | null,
  newValue: string | null,
  comment: string | null,
  performedBy: string,
): Promise<void> {
  await getSupabase().from("ticket_history").insert({
    ticket_id: ticketId,
    action,
    field_changed: fieldChanged,
    old_value: oldValue,
    new_value: newValue,
    comment,
    performed_by: performedBy,
  });
}

/**
 * Check if a user can approve tickets based on role
 */
export function canApproveTickets(userRole: string): boolean {
  const approverRoles = ["engineer", "accountant", "owner", "founder"];
  return approverRoles.includes(userRole);
}

/**
 * Check if a user has access to approvals page
 */
export function hasApprovalsAccess(userRole: string): boolean {
  const accessRoles = ["engineer", "accountant", "owner", "founder"];
  return accessRoles.includes(userRole);
}

/**
 * Get navigation items filtered by user role
 */
export function getNavigationForRole(userRole: string): string[] {
  const allNavItems = [
    "dashboard",
    "leads",
    "tasks",
    "production",
    "approvals",
    "settings",
  ];

  if (userRole === "production_supervisor") {
    return ["production"];
  }

  // All other roles see everything
  return allNavItems;
}
