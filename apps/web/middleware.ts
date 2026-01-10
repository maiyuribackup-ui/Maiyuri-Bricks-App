import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase-server';
import {
  checkRateLimit,
  getClientIP,
  rateLimitConfigs,
} from '@/lib/rate-limit';

// Routes that don't require authentication
const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/accept-invite', '/api/auth'];

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

// Routes that need rate limiting
const rateLimitedRoutes = {
  auth: ['/api/auth', '/login', '/forgot-password', '/reset-password'],
  ai: ['/api/leads', '/api/knowledge', '/api/coaching'],
  passwordReset: ['/api/auth/forgot-password', '/api/auth/reset-password'],
};

/**
 * Add security headers to the response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent XSS attacks
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(self)'
  );

  // Content Security Policy (basic - adjust as needed)
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js needs unsafe-eval for dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://generativelanguage.googleapis.com",
      "frame-ancestors 'none'",
    ].join('; ')
  );

  // HSTS (only in production)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  return response;
}

/**
 * Check rate limiting for a request
 */
function checkRateLimiting(
  request: NextRequest,
  pathname: string
): { limited: boolean; response?: NextResponse } {
  const clientIP = getClientIP(request);

  // Check which rate limit category applies
  let config = rateLimitConfigs.api; // Default
  let identifier = `api:${clientIP}`;

  if (rateLimitedRoutes.passwordReset.some((r) => pathname.startsWith(r))) {
    config = rateLimitConfigs.passwordReset;
    identifier = `pwd:${clientIP}`;
  } else if (rateLimitedRoutes.auth.some((r) => pathname.startsWith(r))) {
    config = rateLimitConfigs.auth;
    identifier = `auth:${clientIP}`;
  } else if (rateLimitedRoutes.ai.some((r) => pathname.startsWith(r))) {
    config = rateLimitConfigs.ai;
    identifier = `ai:${clientIP}`;
  }

  const result = checkRateLimit(identifier, config);

  if (!result.success) {
    const response = NextResponse.json(
      {
        error: 'Too many requests',
        retryAfter: result.retryAfter,
      },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(result.retryAfter));
    response.headers.set('X-RateLimit-Limit', String(config.limit));
    response.headers.set('X-RateLimit-Remaining', '0');
    response.headers.set('X-RateLimit-Reset', String(result.reset));
    return { limited: true, response };
  }

  return { limited: false };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check rate limiting for API routes
  if (pathname.startsWith('/api')) {
    const { limited, response } = checkRateLimiting(request, pathname);
    if (limited && response) {
      return addSecurityHeaders(response);
    }
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.includes('.') // Static files
  ) {
    return NextResponse.next();
  }

  // Allow public routes (no auth needed)
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // Allow API routes (handled separately by each route)
  if (pathname.startsWith('/api')) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
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
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // Create response to pass to Supabase client
  let response = NextResponse.next({
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

    // User is authenticated, allow access with security headers
    return addSecurityHeaders(response);
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
