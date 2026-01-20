"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Delivery,
  DeliveryWithLines,
  DeliveryStatus,
  ApiResponse,
} from "@maiyuri/shared";

// Client-side filter type (camelCase for API calls)
export interface ClientDeliveryFilters {
  status?: DeliveryStatus;
  driverId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// Query keys
export const deliveryKeys = {
  all: ["deliveries"] as const,
  lists: () => [...deliveryKeys.all, "list"] as const,
  list: (filters: ClientDeliveryFilters) =>
    [...deliveryKeys.lists(), filters] as const,
  details: () => [...deliveryKeys.all, "detail"] as const,
  detail: (id: string) => [...deliveryKeys.details(), id] as const,
};

// Fetch deliveries list (includes lines)
async function fetchDeliveries(
  filters: ClientDeliveryFilters,
): Promise<ApiResponse<DeliveryWithLines[]>> {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.driverId) params.set("driverId", filters.driverId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.offset) params.set("offset", filters.offset.toString());

  const response = await fetch(`/api/deliveries?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to fetch deliveries");
  }
  return response.json();
}

// Fetch single delivery with lines
async function fetchDelivery(
  id: string,
): Promise<ApiResponse<DeliveryWithLines>> {
  const response = await fetch(`/api/deliveries/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch delivery");
  }
  return response.json();
}

// Update delivery status
async function updateStatus(
  id: string,
  status: DeliveryStatus,
  notes?: string,
): Promise<ApiResponse<{ status: DeliveryStatus }>> {
  const response = await fetch(`/api/deliveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, notes }),
  });
  if (!response.ok) {
    throw new Error("Failed to update status");
  }
  return response.json();
}

// Assign driver
async function assignDriver(
  id: string,
  driverId: string,
): Promise<ApiResponse<{ driverId: string }>> {
  const response = await fetch(`/api/deliveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId }),
  });
  if (!response.ok) {
    throw new Error("Failed to assign driver");
  }
  return response.json();
}

// Complete delivery with POD
async function completeDelivery(
  id: string,
  data: {
    signatureData?: string;
    photoUrls?: string[];
    recipientName?: string;
    notes?: string;
  },
): Promise<ApiResponse<{ deliveryId: string; status: string }>> {
  const response = await fetch(`/api/deliveries/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to complete delivery");
  }
  return response.json();
}

// Sync deliveries from Odoo
async function syncDeliveries(
  dateFrom?: string,
): Promise<ApiResponse<{ synced: number; errors: number }>> {
  const response = await fetch("/api/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dateFrom }),
  });
  if (!response.ok) {
    throw new Error("Failed to sync deliveries");
  }
  return response.json();
}

// Hooks

export function useDeliveries(filters: ClientDeliveryFilters = {}) {
  return useQuery({
    queryKey: deliveryKeys.list(filters),
    queryFn: () => fetchDeliveries(filters),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useDelivery(id: string) {
  return useQuery({
    queryKey: deliveryKeys.detail(id),
    queryFn: () => fetchDelivery(id),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useUpdateDeliveryStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: DeliveryStatus;
      notes?: string;
    }) => updateStatus(id, status, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: deliveryKeys.detail(variables.id),
      });
    },
  });
}

export function useAssignDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string }) =>
      assignDriver(id, driverId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: deliveryKeys.detail(variables.id),
      });
    },
  });
}

export function useCompleteDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      signatureData?: string;
      photoUrls?: string[];
      recipientName?: string;
      notes?: string;
    }) => completeDelivery(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: deliveryKeys.detail(variables.id),
      });
    },
  });
}

export function useSyncDeliveries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dateFrom?: string) => syncDeliveries(dateFrom),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
    },
  });
}
