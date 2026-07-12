import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SmartQuote } from '@maiyuri/shared';
import { api } from '@/lib/api';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://mb.maiyuri.com';

/** Public share URL for a generated Smart Quote. */
export function quoteUrl(slug: string): string {
  return `${BASE_URL}/sq/${slug}`;
}

/**
 * Generate (or fetch the existing) AI Smart Quote for a lead.
 * Server returns the stored quote when one exists unless regenerate=true —
 * so this is safe to call as "get me the shareable link".
 */
export function useGenerateSmartQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts: { lead_id: string; regenerate?: boolean }) =>
      api.post<SmartQuote>('/api/smart-quotes/generate', opts),
    onSuccess: (_res, vars) =>
      void queryClient.invalidateQueries({ queryKey: ['leads', vars.lead_id] }),
  });
}
