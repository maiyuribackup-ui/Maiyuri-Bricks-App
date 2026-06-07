/**
 * Push notification API route tests.
 *
 * Covers the registration + self-test pipeline that powers app notifications:
 * - auth works via Bearer token / cookie (getUserFromRequest), not cookie-only
 * - tokens are upserted (refreshing last_seen)
 * - the test endpoint reports configuration + device count honestly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks --------------------------------------------------------------
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUser(...args),
}));

const mockUpsert = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn(() => ({ eq: mockEq }));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: (...args: unknown[]) => mockUpsert(...args),
      select: (...args: unknown[]) => mockSelect(...args),
    })),
  },
}));

const mockIsFcmConfigured = vi.fn();
const mockSendPushToUser = vi.fn();
vi.mock("@/lib/push/fcm", () => ({
  isFcmConfigured: () => mockIsFcmConfigured(),
  sendPushToUser: (...args: unknown[]) => mockSendPushToUser(...args),
}));

import { POST as registerPost } from "../register/route";
import { GET as testGet, POST as testPost } from "../test/route";

function req(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/push/register", () => {
  it("rejects unauthenticated requests", async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await registerPost(req({ token: "abc" }));
    expect(res.status).toBe(401);
  });

  it("rejects a missing token", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    const res = await registerPost(req({}));
    expect(res.status).toBe(400);
  });

  it("upserts the token for an authenticated user (Bearer or cookie)", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockUpsert.mockResolvedValue({ error: null });
    const res = await registerPost(
      req({ token: "tok-123", platform: "android" }),
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        token: "tok-123",
        platform: "android",
      }),
      { onConflict: "token" },
    );
  });

  it("defaults an unknown platform to android", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockUpsert.mockResolvedValue({ error: null });
    await registerPost(req({ token: "tok", platform: "windows" }));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "android" }),
      expect.anything(),
    );
  });
});

describe("GET /api/push/test (status)", () => {
  it("reports configuration and device count", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockIsFcmConfigured.mockReturnValue(true);
    mockEq.mockResolvedValue({ count: 3 });
    const res = await testGet(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ configured: true, deviceCount: 3 });
  });

  it("requires auth", async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await testGet(req());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/push/test (send)", () => {
  it("returns configured:false when FCM is not set up", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockIsFcmConfigured.mockReturnValue(false);
    const res = await testPost(req());
    const json = await res.json();
    expect(json.data).toEqual({ configured: false });
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("sends and reports the result when configured", async () => {
    mockGetUser.mockResolvedValue({ id: "u1" });
    mockIsFcmConfigured.mockReturnValue(true);
    mockSendPushToUser.mockResolvedValue({ sent: 2, failed: 0 });
    const res = await testPost(req());
    const json = await res.json();
    expect(json.data).toEqual({ configured: true, sent: 2, failed: 0 });
    expect(mockSendPushToUser).toHaveBeenCalledWith("u1", expect.any(Object));
  });
});
