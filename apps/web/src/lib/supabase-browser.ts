/**
 * Browser-only Supabase client
 *
 * This module should ONLY be imported in client components.
 * It uses the anon key which is safe to expose in the browser.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// Lazy initialization to avoid build-time errors when env vars are not available
let _supabase: SupabaseClient | null = null;

/**
 * Get the browser Supabase client (uses anon key)
 * Uses SSR package for proper cookie handling
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required",
      );
    }

    // Use createBrowserClient from @supabase/ssr for proper cookie handling
    // This ensures the session is stored in cookies that middleware can read
    _supabase = createBrowserClient(url, key);
  }
  return _supabase;
}

/**
 * Browser Supabase client proxy for backwards compatibility
 * @deprecated Use getSupabase() directly for explicit initialization
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabase(), prop);
  },
});

// Re-export for convenience
export { supabase as supabaseClient };
