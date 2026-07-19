import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase-server";
import {
  checkRateLimit,
  getClientIP,
  rateLimitConfigs,
} from "@/lib/rate-limit";

// Routes that don't require authentication (pages)
const publicRoutes = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
];

// Routes that require authentication (pages)
const protectedRoutes = [
  "/dashboard",
  "/daily-report", // server-rendered with real business data — must never serve anonymously
  "/onehub",
  "/leads",
  "/quotes",
  "/planning",
  "/projects",
  "/expenses",
  "/rate-card",
  "/approvals",
  "/production",
  "/deliveries",
  "/coaching",
  "/reports",
  "/knowledge",
  "/knowledgebase",
  "/kpi",
  "/business-health",
  "/analytics",
  "/observability",
  "/settings",
  "/tasks",
];

// API routes that DON'T require authentication
// All other /api/* routes WILL require authentication
const publicApiRoutes = [
  "/api/health", // Health check + health cron
  "/api/auth/login", // Login endpoint
  "/api/auth/logout", // Logout endpoint
  "/api/auth/forgot-password", // Password reset request (no auth needed)
  "/api/users/accept-invite", // Accept invitation (uses invite token)
  "/api/webhooks", // External webhooks
  "/api/telegram/webhook", // Telegram bot webhook (receives voice recordings)
  "/api/telegram/processing-callback", // Telegram callback
  "/api/notifications/telegram", // Telegram webhook
  "/api/notifications/daily-summary", // Daily summary cron job
  "/api/notifications/weekly-ceo-briefing", // Weekly CEO briefing cron job
  "/api/nudges/digest", // Nudge digest cron job
  "/api/nudges/quotes", // Quote nudges cron job
  "/api/odoo/cron", // Odoo sync cron job
  "/api/deliveries/cron", // Delivery sync cron job
  "/api/sq/", // Smart quote public pages (customer-facing)
  "/api/feedback/", // Factory-visit feedback (token-gated; the opaque token is the auth)
  "/api/salespulse/", // SalesPulse digest gather + send (token-gated; SALESPULSE_TOKEN bearer is the auth)
  "/api/recordings/process", // Call recording processor (verifies CRON_SECRET in-handler)
  // NOTE: "/api/admin/call-recordings" was previously exempted with a false
  // "uses internal auth" comment — the handlers have NO auth and would expose
  // every recording URL, transcript and lead contact to anonymous callers.
  // Removed: these admin endpoints now require a staff session (or machine bearer).
  // NOTE: "/api/nudges/events" was previously exempted but its handler has NO
  // auth — anyone could spam staff Telegram alerts / trigger AI for arbitrary
  // lead IDs. Removed: its only callers are internal (call-recording pipeline +
  // analyze route), which now send a machine bearer handled by the bypass below.
  // NOTE: "/api/leads/" was previously listed here, which exempted the ENTIRE
  // leads API from session auth — exposing customer PII, notes, call transcripts
  // and write/AI endpoints to anonymous callers. It is intentionally removed.
  // The one legitimate server-to-server caller (call-recording pipeline →
  // /api/leads/[id]/analyze) authenticates via the machine-bearer bypass below.
];

/**
 * Server-to-server machine auth. A request bearing the CRON_SECRET or the
 * Supabase service-role key is a trusted internal caller (cron jobs, the
 * call-recording → lead-analysis trigger). Browsers never hold these secrets,
 * so this lets internal pipelines reach otherwise session-protected APIs
 * without weakening them for the public internet.
 */
function hasMachineAuth(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  const cron = process.env.CRON_SECRET;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return (
    (!!cron && header === `Bearer ${cron}`) ||
    (!!serviceRole && header === `Bearer ${serviceRole}`)
  );
}

// Routes that need rate limiting
const rateLimitedRoutes = {
  auth: ["/api/auth", "/login", "/forgot-password", "/reset-password"],
  ai: ["/api/leads", "/api/knowledge", "/api/coaching"],
  passwordReset: ["/api/auth/forgot-password", "/api/auth/reset-password"],
};

/**
 * Add security headers to the response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  const isDev = process.env.NODE_ENV === "development";

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Prevent XSS attacks
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(self)",
  );

  // Content Security Policy
  // Note: 'unsafe-eval' is only needed for Next.js HMR in development
  // `blob:` is required so the voice-feedback mic capture can load its
  // AudioWorklet processor, which is shipped as an inline Blob URL. Without it
  // `audioWorklet.addModule(blob:...)` throws AbortError and the call drops.
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' blob:"
    : "'self' 'unsafe-inline' blob:";

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      // worker-src governs AudioWorklet/Worker module loading (falls back to
      // script-src in some engines, but Safari/iOS needs it explicit). blob: is
      // needed for the inline mic-capture worklet.
      "worker-src 'self' blob:",
      // fonts.googleapis.com serves the brand stylesheet (Cormorant + Noto Serif
      // Tamil); fonts.gstatic.com serves the font files.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      // Gemini Live runs over a WebSocket (wss://) — CSP treats https: and wss:
      // as distinct schemes, so the wss: origin must be listed explicitly or the
      // browser silently blocks the voice-feedback socket (onerror).
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com",
      "frame-ancestors 'none'",
      // Hardening (no app impact): block <base> tag hijacking, plugin/object
      // execution, and cross-origin form posts; clickjacking already covered by
      // frame-ancestors + X-Frame-Options.
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join("; "),
  );

  // HSTS (only in production)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
}

/**
 * Check rate limiting for a request
 */
function checkRateLimiting(
  request: NextRequest,
  pathname: string,
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
        error: "Too many requests",
        retryAfter: result.retryAfter,
      },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(result.retryAfter));
    response.headers.set("X-RateLimit-Limit", String(config.limit));
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Reset", String(result.reset));
    return { limited: true, response };
  }

  return { limited: false };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check rate limiting for API routes
  if (pathname.startsWith("/api")) {
    const { limited, response } = checkRateLimiting(request, pathname);
    if (limited && response) {
      return addSecurityHeaders(response);
    }
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.includes(".") // Static files
  ) {
    return NextResponse.next();
  }

  // Allow public routes (no auth needed)
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // Handle API routes - check if authentication is required
  if (pathname.startsWith("/api")) {
    // Check if this is a public API endpoint
    const isPublicApi = publicApiRoutes.some((route) =>
      pathname.startsWith(route),
    );

    if (isPublicApi) {
      // Public API - no auth required
      const response = NextResponse.next();
      return addSecurityHeaders(response);
    }

    // Trusted server-to-server caller (cron / internal pipeline) — allow without
    // a browser session. Secrets are never exposed to clients.
    if (hasMachineAuth(request)) {
      return addSecurityHeaders(
        NextResponse.next({ request: { headers: request.headers } }),
      );
    }

    // Protected API - require authentication
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    try {
      const supabase = createSupabaseMiddlewareClient(request, response);

      // Non-browser clients (the React Native app, future API integrations)
      // have no cookie jar and authenticate with `Authorization: Bearer
      // <supabase-access-token>`. Validate that token here. This is additive:
      // browser requests carry no user Bearer header and fall through to the
      // cookie-based check below, so web behaviour is unchanged.
      // getUser(jwt) revalidates the token against the Supabase auth server.
      const authHeader = request.headers.get("authorization");
      const bearer = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
      if (bearer) {
        const {
          data: { user: bearerUser },
        } = await supabase.auth.getUser(bearer);
        if (bearerUser) {
          return addSecurityHeaders(response);
        }
        // Invalid/expired token — reject rather than falling through.
        return addSecurityHeaders(
          NextResponse.json(
            { error: "Unauthorized: Invalid or expired token" },
            { status: 401 },
          ),
        );
      }

      // getUser() revalidates the JWT against the Supabase auth server, unlike
      // getSession() which only decodes the (client-tamperable) cookie. This is
      // the sole gate for service-role API routes, so it must be authentic.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // No authenticated user - return 401 Unauthorized
        return addSecurityHeaders(
          NextResponse.json(
            { error: "Unauthorized: Authentication required" },
            { status: 401 },
          ),
        );
      }

      // User is authenticated, allow the request
      return addSecurityHeaders(response);
    } catch (error) {
      console.error("API auth middleware error:", error);
      return addSecurityHeaders(
        NextResponse.json({ error: "Authentication error" }, { status: 401 }),
      );
    }
  }

  // Check if route needs protection
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  // If root path, redirect to dashboard (which will check auth)
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Only check auth for protected routes
  if (!isProtectedRoute) {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // Create response to pass to Supabase client
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const supabase = createSupabaseMiddlewareClient(request, response);

    // Revalidate the JWT with the auth server (not just decode the cookie).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If not authenticated and trying to access protected route, redirect to login
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // User is authenticated, allow access with security headers
    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Middleware auth error:", error);
    // On error, redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
