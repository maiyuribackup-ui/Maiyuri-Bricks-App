import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Ticket,
  TicketHistoryEntry,
  TicketFilters,
  ApprovalQueueStats,
  CreateTicketData,
  ApproveTicketData,
  RejectTicketData,
  RequestChangesData,
  AddTicketCommentData,
  SubmitForApprovalData,
} from "@maiyuri/shared";

// ============================================
// API Response Types
// ============================================

interface ApiResponse<T> {
  data: T;
  error?: string;
}

// ============================================
// Tickets API Functions
// ============================================

async function fetchTickets(
  filters?: TicketFilters,
): Promise<ApiResponse<Ticket[]>> {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.type) params.append("type", filters.type);
  if (filters?.created_by) params.append("created_by", filters.created_by);
  if (filters?.assigned_to) params.append("assigned_to", filters.assigned_to);
  if (filters?.from_date) params.append("from_date", filters.from_date);
  if (filters?.to_date) params.append("to_date", filters.to_date);
  if (filters?.search) params.append("search", filters.search);

  const url = `/api/tickets${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
}

async function fetchTicket(ticketId: string): Promise<ApiResponse<Ticket>> {
  const res = await fetch(`/api/tickets/${ticketId}`);
  if (!res.ok) throw new Error("Failed to fetch ticket");
  return res.json();
}

async function fetchTicketHistory(
  ticketId: string,
): Promise<ApiResponse<TicketHistoryEntry[]>> {
  const res = await fetch(`/api/tickets/${ticketId}/history`);
  if (!res.ok) throw new Error("Failed to fetch ticket history");
  return res.json();
}

async function createTicket(
  data: CreateTicketData,
): Promise<ApiResponse<Ticket>> {
  const res = await fetch("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to create ticket");
  }
  return res.json();
}

async function approveTicket(
  ticketId: string,
  data?: ApproveTicketData,
): Promise<ApiResponse<{ message: string }>> {
  const res = await fetch(`/api/tickets/${ticketId}/approve`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data ?? {}),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to approve ticket");
  }
  return res.json();
}

async function rejectTicket(
  ticketId: string,
  data: RejectTicketData,
): Promise<ApiResponse<{ message: string }>> {
  const res = await fetch(`/api/tickets/${ticketId}/reject`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to reject ticket");
  }
  return res.json();
}

async function requestTicketChanges(
  ticketId: string,
  data: RequestChangesData,
): Promise<ApiResponse<{ message: string }>> {
  const res = await fetch(`/api/tickets/${ticketId}/request-changes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to request changes");
  }
  return res.json();
}

async function addTicketComment(
  ticketId: string,
  data: AddTicketCommentData,
): Promise<ApiResponse<{ message: string }>> {
  const res = await fetch(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to add comment");
  }
  return res.json();
}

async function fetchApprovalQueueStats(): Promise<
  ApiResponse<ApprovalQueueStats>
> {
  const res = await fetch("/api/approvals/queue");
  if (!res.ok) throw new Error("Failed to fetch approval queue stats");
  return res.json();
}

async function submitForApproval(
  orderId: string,
  data: SubmitForApprovalData,
): Promise<ApiResponse<Ticket>> {
  const res = await fetch(
    `/api/production/orders/${orderId}/submit-for-approval`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to submit for approval");
  }
  return res.json();
}

// ============================================
// React Query Hooks
// ============================================

/**
 * Fetch tickets with optional filters
 */
export function useTickets(filters?: TicketFilters) {
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn: () => fetchTickets(filters),
  });
}

/**
 * Fetch a single ticket by ID
 */
export function useTicket(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => fetchTicket(ticketId!),
    enabled: !!ticketId,
  });
}

/**
 * Fetch ticket history
 */
export function useTicketHistory(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-history", ticketId],
    queryFn: () => fetchTicketHistory(ticketId!),
    enabled: !!ticketId,
  });
}

/**
 * Create a new ticket
 */
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
    },
  });
}

/**
 * Approve a ticket
 */
export function useApproveTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data?: ApproveTicketData;
    }) => approveTicket(ticketId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({
        queryKey: ["ticket", variables.ticketId],
      });
      queryClient.invalidateQueries({
        queryKey: ["ticket-history", variables.ticketId],
      });
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

/**
 * Reject a ticket
 */
export function useRejectTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: RejectTicketData;
    }) => rejectTicket(ticketId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({
        queryKey: ["ticket", variables.ticketId],
      });
      queryClient.invalidateQueries({
        queryKey: ["ticket-history", variables.ticketId],
      });
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

/**
 * Request changes on a ticket
 */
export function useRequestChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: RequestChangesData;
    }) => requestTicketChanges(ticketId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({
        queryKey: ["ticket", variables.ticketId],
      });
      queryClient.invalidateQueries({
        queryKey: ["ticket-history", variables.ticketId],
      });
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}

/**
 * Add a comment to a ticket
 */
export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: AddTicketCommentData;
    }) => addTicketComment(ticketId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["ticket-history", variables.ticketId],
      });
    },
  });
}

/**
 * Fetch approval queue statistics
 */
export function useApprovalQueue() {
  return useQuery({
    queryKey: ["approval-queue"],
    queryFn: fetchApprovalQueueStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Submit a production order for approval
 */
export function useSubmitForApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      data,
    }: {
      orderId: string;
      data: SubmitForApprovalData;
    }) => submitForApproval(orderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
    },
  });
}
