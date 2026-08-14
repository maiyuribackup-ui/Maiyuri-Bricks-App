import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SmartQuote,
  SmartQuoteLineItem,
  SmartQuotePricingConfig,
} from '@maiyuri/shared';
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
  // Multi-product quotes are judged line by line, naming the line that fails:
  // a half-priced quote is worse than an unpriced one, because the total
  // still looks authoritative.
  const items = pricing?.items;
  if (items && items.length > 0) {
    for (const [i, item] of items.entries()) {
      const label = `Line ${i + 1}`;
      if (!item.product_id) {
        return { ready: false, reason: `${label}: choose the product being quoted.` };
      }
      if (item.rate == null || !(item.rate > 0)) {
        return {
          ready: false,
          reason: `${label}: set the rate before sharing — without it the customer sees rate-card pricing, not yours.`,
        };
      }
      if (item.quantity == null || !(item.quantity > 0)) {
        return { ready: false, reason: `${label}: enter the quantity being quoted.` };
      }
    }
    return { ready: true, reason: null };
  }

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

/** A product the engineer can quote. */
export interface QuotableProduct {
  id: string;
  name: string;
  unit: string | null;
  category: string | null;
}

/** The live catalogue, for the line editor's product picker. */
export function useQuotableProducts() {
  return useQuery({
    queryKey: ['products', 'quotable'],
    queryFn: async () => {
      const res = await api.get<QuotableProduct[]>('/api/products');
      return res.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Save the engineer's pricing.
 *
 * The first line is mirrored onto default_product / default_area_sqft /
 * quoted_rate. Those fields are what the older single-product paths still
 * read, so a multi-product quote written here stays coherent for anything
 * that has not learned about items[] yet.
 */
export function useSaveQuotePricing(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      quoteId: string;
      items: SmartQuoteLineItem[];
      distanceKm: number | null;
    }) => {
      const [first] = vars.items;
      return api.patch<SmartQuote>(`/api/smart-quotes/${vars.quoteId}`, {
        pricing_config: {
          items: vars.items,
          default_product: first?.product_id ?? null,
          default_area_sqft: first?.quantity ?? null,
          quoted_rate: first?.rate ?? null,
          default_distance_km: vars.distanceKm,
        },
      });
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['smart-quote', leadId], res.data ?? null);
    },
  });
}
