// @vitest-environment node
/**
 * Middleware route classification (BUG: dotted application paths used to be
 * treated as static files and skipped authentication entirely).
 *
 * These tests exercise the real `middleware()` with the Supabase client and
 * rate limiter mocked, so they verify behaviour — redirects, 401s and
 * pass-throughs — not the source text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseMiddlewareClient: () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ success: true }),
  getClientIP: () => "127.0.0.1",
  rateLimitConfigs: { api: {}, auth: {}, ai: {}, passwordReset: {} },
}));

import { middleware } from "./middleware";

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://mb.example.test${path}`, { headers });
}

/** NextResponse.next() carries this header; redirects and JSON bodies do not. */
function passedThrough(res: Response): boolean {
  return res.headers.has("x-middleware-next");
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: null } });
});

describe("anonymous requests to protected pages", () => {
  it("redirects the Process version editor (dotted version segment) to login", async () => {
    const res = await middleware(
      req("/processes/LEAD_TO_DELIVERY/versions/1.0/edit"),
    );
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe(
      "/processes/LEAD_TO_DELIVERY/versions/1.0/edit",
    );
    expect(passedThrough(res)).toBe(false);
  });

  it.each([
    "/processes/TEST/versions/2.1/edit",
    "/projects/customer@example.com",
    "/projects/SO.1042",
    "/leads/v1.2.3",
  ])("treats %s as an application route, not a file", async (path) => {
    const res = await middleware(req(path));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("still redirects a plain protected dashboard route", async () => {
    const res = await middleware(req("/dashboard"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("ignores query strings when classifying the path", async () => {
    const res = await middleware(
      req("/processes/LEAD_TO_DELIVERY/versions/1.0/edit?tab=gates&x=a.js"),
    );
    expect(res.status).toBe(307);
  });
});

describe("signed-in requests to protected pages", () => {
  it("lets an authenticated user through the dotted route", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await middleware(
      req("/processes/LEAD_TO_DELIVERY/versions/1.0/edit"),
    );
    expect(res.status).toBe(200);
    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("genuine static assets", () => {
  it.each([
    "/_next/static/chunks/app/page-abc123.js",
    "/_next/image?url=%2Flogo.png&w=64&q=75",
    "/scripts/analytics.js",
    "/styles/print.css",
    "/logo.png",
    "/photos/site.jpg",
    "/photos/site.jpeg",
    "/icons/brick.svg",
    "/favicon.ico",
    "/hero.webp",
    "/fonts/Inter.woff2",
    "/fonts/NotoSerifTamil.ttf",
    "/site.webmanifest",
    "/robots.txt",
    "/onehub/mayur-avatar.png",
  ])("passes %s through without an auth redirect", async (path) => {
    const res = await middleware(req(path));
    expect(res.status).toBe(200);
    expect(passedThrough(res)).toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("public routes", () => {
  it.each(["/login", "/forgot-password", "/reset-password", "/accept-invite"])(
    "serves %s without authentication",
    async (path) => {
      const res = await middleware(req(path));
      expect(res.status).toBe(200);
      expect(passedThrough(res)).toBe(true);
      expect(getUser).not.toHaveBeenCalled();
    },
  );

  it("redirects / to the dashboard", async () => {
    const res = await middleware(req("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
      "/dashboard",
    );
  });
});

describe("API routes", () => {
  it("returns 401 for an anonymous protected API call", async () => {
    const res = await middleware(req("/api/process/work"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for an anonymous protected API call whose path contains a dot", async () => {
    const res = await middleware(
      req("/api/process/definitions/LEAD_TO_DELIVERY?version=1.0"),
    );
    expect(res.status).toBe(401);
    const dotted = await middleware(req("/api/projects/SO.1042"));
    expect(dotted.status).toBe(401);
    // Even an asset-looking suffix does not exempt an API path.
    const jsonish = await middleware(req("/api/reports/export.json"));
    expect(jsonish.status).toBe(401);
  });

  it("serves public API routes without a session", async () => {
    const res = await middleware(req("/api/health"));
    expect(res.status).toBe(200);
    expect(passedThrough(res)).toBe(true);
  });

  it("accepts a valid bearer session on a protected API", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await middleware(
      req("/api/process/work", { authorization: "Bearer good-token" }),
    );
    expect(res.status).toBe(200);
    expect(passedThrough(res)).toBe(true);
  });
});
