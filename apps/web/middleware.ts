import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase-server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth'];

// Routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/leads',
  '/coaching',
  '/reports',
  '/knowledgebase',
  '/settings',
  '/tasks',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // Static files
  ) {
    return NextResponse.next();
  }

  // Check if route needs protection
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // If root path, redirect to dashboard (which will check auth)
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Only check auth for protected routes
  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // Create response to pass to Supabase client
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const supabase = createSupabaseMiddlewareClient(request, response);

    // Get session from cookies
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // If no session and trying to access protected route, redirect to login
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // User is authenticated, allow access
    return response;
  } catch (error) {
    console.error('Middleware auth error:', error);
    // On error, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
