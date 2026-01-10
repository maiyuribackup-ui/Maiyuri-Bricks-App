import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Product,
  FactorySettings,
  Estimate,
  CreateEstimateInput,
  UpdateEstimateInput,
  DiscountSuggestion,
  DistanceCalculation,
} from '@maiyuri/shared';

// ============================================
// API Response Types
// ============================================

interface ApiResponse<T> {
  data: T;
  error?: string;
}

// ============================================
// Products API
// ============================================

async function fetchProducts(category?: string): Promise<ApiResponse<Product[]>> {
  const url = category ? `/api/products?category=${category}` : '/api/products';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export function useProducts(category?: string) {
  return useQuery({
    queryKey: category ? ['products', category] : ['products'],
    queryFn: () => fetchProducts(category),
  });
}

// ============================================
// Factory Settings API
// ============================================

async function fetchFactorySettings(): Promise<ApiResponse<FactorySettings | null>> {
  const res = await fetch('/api/settings/factory');
  if (!res.ok) throw new Error('Failed to fetch factory settings');
  return res.json();
}

async function updateFactorySettings(
  data: Partial<FactorySettings>
): Promise<ApiResponse<FactorySettings>> {
  const res = await fetch('/api/settings/factory', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update factory settings');
  }
  return res.json();
}

export function useFactorySettings() {
  return useQuery({
    queryKey: ['factory-settings'],
    queryFn: fetchFactorySettings,
  });
}

export function useUpdateFactorySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateFactorySettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory-settings'] });
    },
  });
}

// ============================================
// Estimates API
// ============================================

async function fetchEstimates(leadId: string): Promise<ApiResponse<Estimate[]>> {
  const res = await fetch(`/api/leads/${leadId}/estimates`);
  if (!res.ok) throw new Error('Failed to fetch estimates');
  return res.json();
}

async function fetchEstimate(id: string): Promise<ApiResponse<Estimate>> {
  const res = await fetch(`/api/estimates/${id}`);
  if (!res.ok) throw new Error('Failed to fetch estimate');
  return res.json();
}

async function createEstimate(
  leadId: string,
  data: CreateEstimateInput
): Promise<ApiResponse<Estimate>> {
  const res = await fetch(`/api/leads/${leadId}/estimates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create estimate');
  }
  return res.json();
}

async function updateEstimate(
  id: string,
  data: UpdateEstimateInput
): Promise<ApiResponse<Estimate>> {
  const res = await fetch(`/api/estimates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update estimate');
  }
  return res.json();
}

async function deleteEstimate(id: string): Promise<void> {
  const res = await fetch(`/api/estimates/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete estimate');
}

export function useEstimates(leadId: string) {
  return useQuery({
    queryKey: ['estimates', leadId],
    queryFn: () => fetchEstimates(leadId),
    enabled: !!leadId,
  });
}

export function useEstimate(id: string) {
  return useQuery({
    queryKey: ['estimate', id],
    queryFn: () => fetchEstimate(id),
    enabled: !!id,
  });
}

export function useCreateEstimate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, data }: { leadId: string; data: CreateEstimateInput }) =>
      createEstimate(leadId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['estimates', variables.leadId] });
    },
  });
}

export function useUpdateEstimate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEstimateInput }) =>
      updateEstimate(id, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      queryClient.invalidateQueries({ queryKey: ['estimate', response.data?.id] });
    },
  });
}

export function useDeleteEstimate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteEstimate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
    },
  });
}

// ============================================
// Discount Suggestion API
// ============================================

async function getDiscountSuggestion(
  estimateId: string
): Promise<ApiResponse<DiscountSuggestion>> {
  const res = await fetch(`/api/estimates/${estimateId}/suggest-discount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get discount suggestion');
  }
  return res.json();
}

export function useSuggestDiscount() {
  return useMutation({
    mutationFn: getDiscountSuggestion,
  });
}

// Quick discount suggestion without requiring an estimate
interface QuickDiscountParams {
  leadId: string;
  subtotal: number;
  itemsCount: number;
  distanceKm?: number;
}

async function getQuickDiscountSuggestion(
  params: QuickDiscountParams
): Promise<ApiResponse<DiscountSuggestion>> {
  const res = await fetch(`/api/leads/${params.leadId}/suggest-discount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subtotal: params.subtotal,
      items_count: params.itemsCount,
      distance_km: params.distanceKm,
    }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get discount suggestion');
  }
  return res.json();
}

export function useQuickDiscountSuggestion() {
  return useMutation({
    mutationFn: getQuickDiscountSuggestion,
  });
}

// ============================================
// Distance Calculation API
// ============================================

interface CalculateDistanceParams {
  destination_latitude: number;
  destination_longitude: number;
  destination_address?: string;
}

async function calculateDistance(
  params: CalculateDistanceParams
): Promise<ApiResponse<DistanceCalculation>> {
  const res = await fetch('/api/distance/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to calculate distance');
  }
  return res.json();
}

export function useCalculateDistance() {
  return useMutation({
    mutationFn: calculateDistance,
  });
}

// ============================================
// Estimate Summary Calculation (Client-side)
// ============================================

interface EstimateSummary {
  subtotal: number;
  transportCost: number;
  discountAmount: number;
  total: number;
}

export function calculateEstimateSummary(
  items: Array<{ quantity: number; unit_price: number }>,
  transportCost: number,
  discountPercentage: number
): EstimateSummary {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
  const discountAmount = (subtotal * discountPercentage) / 100;
  const total = subtotal + transportCost - discountAmount;

  return {
    subtotal,
    transportCost,
    discountAmount,
    total,
  };
}
