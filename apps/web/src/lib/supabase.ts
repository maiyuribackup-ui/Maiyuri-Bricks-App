import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// Lazy initialization to avoid build-time errors when env vars are not available
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

// Browser client (uses anon key) - uses SSR package for proper cookie handling
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
    }

    // Use createBrowserClient from @supabase/ssr for proper cookie handling
    // This ensures the session is stored in cookies that middleware can read
    _supabase = createBrowserClient(url, key);
  }
  return _supabase;
}

// For backwards compatibility - lazy getter
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabase(), prop);
  },
});

// Server client (uses service role key for API routes)
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error('Missing Supabase environment variables for admin client');
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

// For backwards compatibility - lazy getter
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabaseAdmin(), prop);
  },
});

// Helper to get user from request
export async function getUserFromRequest(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const client = getSupabase();
  const { data: { user }, error } = await client.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}
