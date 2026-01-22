/**
 * Supabase client exports
 *
 * This module re-exports both browser and admin clients for backwards compatibility.
 *
 * RECOMMENDED USAGE:
 * - Client components: import { getSupabase, supabase } from '@/lib/supabase-browser'
 * - Server/API routes: import { supabaseAdmin } from '@/lib/supabase-admin'
 *
 * The supabase-admin module includes 'server-only' pragma to prevent accidental
 * bundling of the service role key in client code.
 */

// Re-export browser client (safe for client components)
export { getSupabase, supabase, supabaseClient } from "./supabase-browser";

// Re-export admin client (server-only, will error if imported in client code)
export { getSupabaseAdmin, supabaseAdmin } from "./supabase-admin";
