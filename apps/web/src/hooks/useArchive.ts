import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ArchiveConfig,
  ArchiveSuggestionsResponse,
  ArchiveSuggestionActionInput,
  BatchArchiveInput,
  BatchRestoreInput,
} from '@maiyuri/shared';

// ============================================
// API Functions
// ============================================

async function fetchArchiveSuggestions(refresh = false): Promise<ArchiveSuggestionsResponse> {
  const params = refresh ? '?refresh=true' : '';
  const res = await fetch(`/api/archive/suggestions${params}`);
  if (!res.ok) throw new Error('Failed to fetch archive suggestions');
  const json = await res.json();
  return json.data;
}

async function processArchiveSuggestions(
  input: ArchiveSuggestionActionInput
): Promise<{ processed_count: number; archived_count?: number }> {
  const res = await fetch('/api/archive/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to process suggestions');
  }
  const json = await res.json();
  return json.data;
}

async function batchArchiveLeads(
  input: BatchArchiveInput
): Promise<{ archived_count: number; lead_ids: string[] }> {
  const res = await fetch('/api/archive/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to archive leads');
  }
  const json = await res.json();
  return json.data;
}

async function batchRestoreLeads(
  input: BatchRestoreInput
): Promise<{ restored_count: number; lead_ids: string[] }> {
  const res = await fetch('/api/archive/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to restore leads');
  }
  const json = await res.json();
  return json.data;
}

async function fetchArchiveConfig(): Promise<ArchiveConfig> {
  const res = await fetch('/api/archive/config');
  if (!res.ok) throw new Error('Failed to fetch archive config');
  const json = await res.json();
  return json.data;
}

async function updateArchiveConfig(
  config: Partial<ArchiveConfig>
): Promise<ArchiveConfig> {
  const res = await fetch('/api/archive/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update config');
  }
  const json = await res.json();
  return json.data;
}

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch pending archive suggestions
 */
export function useArchiveSuggestions(refresh = false) {
  return useQuery({
    queryKey: ['archive-suggestions', refresh],
    queryFn: () => fetchArchiveSuggestions(refresh),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch archive configuration
 */
export function useArchiveConfig() {
  return useQuery({
    queryKey: ['archive-config'],
    queryFn: fetchArchiveConfig,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Process archive suggestions (accept or dismiss)
 */
export function useProcessSuggestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: processArchiveSuggestions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

/**
 * Batch archive leads
 */
export function useBatchArchive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: batchArchiveLeads,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

/**
 * Batch restore leads
 */
export function useBatchRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: batchRestoreLeads,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

/**
 * Update archive configuration
 */
export function useUpdateArchiveConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateArchiveConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-config'] });
    },
  });
}

/**
 * Refresh archive suggestions
 */
export function useRefreshSuggestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fetchArchiveSuggestions(true),
    onSuccess: (data) => {
      queryClient.setQueryData(['archive-suggestions', false], data);
      queryClient.setQueryData(['archive-suggestions', true], data);
    },
  });
}
