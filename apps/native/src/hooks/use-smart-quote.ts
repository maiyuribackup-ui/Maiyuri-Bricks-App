import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SmartQuote, SmartQuotePricingConfig } from '@maiyuri/shared';
import { api } from '@/lib/api';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://mb.maiyuri.com';

/** Public share URL for a generated Smart Quote. */
export function quoteUrl(slug: string): string {
  return `${BASE_URL}/sq/${slug}`;
}

/**
 * The branded quotation PDF. Public in the same sense as the quote page — the
 * unguessable slug is the capability — so opening it in the device browser
 * downloads the document without any auth handshake.
 */
export function quotePdfUrl(slug: string): string {
  return `${BASE_URL}/api/sq/${slug}/pdf`;
}

/**
 * Is this quote safe to put in a customer's hands?
 *
 * Mirror of apps/web/src/lib/pricing/quote-readiness.ts, which is the
 * authority on this rule: a quote with no engineer rate silently falls back
 * to the rate card, so the customer would see a price nobody authorised.
 * The web staff UI blocks sharing for the same reasons with the same words.
 */
export function getQuoteReadiness(
  pricing: Partial<SmartQuotePricingConfig> | null | undefined,
): { ready: boolean; reason: string | null } {
  const rate = pricing?.quoted_rate;
  if (rate == null) {
    return {
      ready: false,
      reason:
        'Set the rate before sharing — without it the customer sees rate-card pricing, not yours.',
    };
  }
  if (!(rate > 0)) {
    return { ready: false, reason: 'Rate must be greater than ₹0.' };
  }
  if (!pricing?.default_product) {
    return { ready: false, reason: 'Choose the product being quoted before sharing.' };
  }
  const quantity = pricing?.default_area_sqft;
  if (quantity == null || !(quantity > 0)) {
    return { ready: false, reason: 'Enter the quantity being quoted before sharing.' };
  }
  return { ready: true, reason: null };
}

/**
 * The lead's existing Smart Quote, or null when none has been generated.
 *
 * A plain GET, deliberately separate from the generate mutation: without it
 * the phone showed no link for a lead that already had a quote, and a second
 * tap on "Generate" was one AI run away from re-writing a page the customer
 * may already have open.
 */
export function useSmartQuote(leadId: string) {
  return useQuery({
    queryKey: ['smart-quote', leadId],
    queryFn: async () => {
      const res = await api.get<SmartQuote[]>('/api/smart-quotes', {
        lead_id: leadId,
      });
      return res.data?.[0] ?? null;
    },
    retry: false,
  });
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
    onSuccess: (res, vars) => {
      // The fresh quote replaces the cached one immediately; the invalidate
      // keeps any other lead-derived views honest.
      queryClient.setQueryData(['smart-quote', vars.lead_id], res.data ?? null);
      void queryClient.invalidateQueries({ queryKey: ['leads', vars.lead_id] });
    },
  });
}
