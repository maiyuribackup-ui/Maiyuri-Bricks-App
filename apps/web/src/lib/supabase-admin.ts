/**
 * Server-only Supabase admin client
 *
 * SECURITY: This module uses the service role key which has full database access.
 * It MUST only be used in:
 * - API routes (app/api/*)
 * - Server components
 * - Server actions
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy initialization to avoid build-time errors when env vars are not available
let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Get the admin Supabase client (uses service role key)
 * This bypasses RLS and has full database access.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    // Use fallbacks to match the working cloudcore pattern
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "";

    if (!url || !key) {
      throw new Error(
        "Missing Supabase environment variables for admin client: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
      );
    }

    _supabaseAdmin = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        /**
         * Never serve a cached row.
         *
         * Next patches global fetch and puts eligible GETs in the Data Cache.
         * supabase-js issues plain GETs for selects, so a read lands there and,
         * with no revalidate, stays there indefinitely. `dynamic =
         * "force-dynamic"` opts the route out of full-route caching but does
         * not reliably opt these fetches out.
         *
         * Observed in production: a lead's name was corrected at 17:41 and the
         * quotation still printed the old name an hour later — while the phone
         * and site address on the very same row were current, because the
         * cached snapshot had been taken between the two edits. Staff
         * regenerated and still saw the old name, since nothing they could
         * touch invalidated this cache.
         *
         * This client holds the service-role key and is used only by dynamic
         * API routes, where a stale read is always a bug, never an
         * optimisation.
         */
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return _supabaseAdmin;
}

/**
 * Admin Supabase client proxy for backwards compatibility
 * @deprecated Use getSupabaseAdmin() directly for explicit initialization
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabaseAdmin(), prop);
  },
});
