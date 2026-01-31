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
