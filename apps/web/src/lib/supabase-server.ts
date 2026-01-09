import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export function createSupabaseMiddlewareClient(
  request: NextRequest,
  response: NextResponse
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value,
          ...options,
        });
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value: '',
          ...options,
        });
        response.cookies.set({
          name,
          value: '',
          ...options,
        });
      },
    },
  });
}

// Create a Supabase client for API routes (read-only cookies)
export function createSupabaseRouteClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set() {
        // API routes are read-only for cookies in this context
      },
      remove() {
        // API routes are read-only for cookies in this context
      },
    },
  });
}

// Helper to get user from request (checks both cookies and Bearer token)
export async function getUserFromRequest(request: NextRequest) {
  // First try to get user from cookies (browser session)
  const supabase = createSupabaseRouteClient(request);
  const { data: { user: cookieUser } } = await supabase.auth.getUser();

  if (cookieUser) {
    return cookieUser;
  }

  // Fall back to Bearer token (for API clients)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { data: { user: tokenUser } } = await supabase.auth.getUser(token);
    return tokenUser || null;
  }

  return null;
}
