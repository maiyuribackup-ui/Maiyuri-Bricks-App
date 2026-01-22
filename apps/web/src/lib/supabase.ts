/**
 * Supabase client exports (BROWSER ONLY)
 *
 * This module exports ONLY the browser client for use in client components.
 * It is safe to import in any client-side code.
 *
 * USAGE:
 * - Client components: import { getSupabase, supabase } from '@/lib/supabase'
 * - Server/API routes: import { supabaseAdmin } from '@/lib/supabase-admin'
 *
 * IMPORTANT: Do NOT import supabase-admin from this file!
 * The admin client has 'server-only' pragma and will cause build errors
 * if imported in client components.
 */

// Re-export browser client ONLY (safe for client components)
export { getSupabase, supabase, supabaseClient } from "./supabase-browser";

// NOTE: For server-side code, import directly from '@/lib/supabase-admin'
// DO NOT re-export supabaseAdmin here - it has 'server-only' pragma
