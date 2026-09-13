import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runHealthCheck } = vi.hoisted(() => ({
  runHealthCheck: vi.fn(),
}));
vi.mock("@/lib/health/runner", () => ({ runHealthCheck }));

import { GET, POST } from "./route";

function request(method: "GET" | "POST", authorization?: string) {
  return new NextRequest("http://localhost/api/health/cron?type=manual", {
    method,
    headers: authorization ? { authorization } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  runHealthCheck.mockResolvedValue({
    runId: "run-1",
    runType: "manual",
    overallStatus: "healthy",
    aiAnalysis: null,
    agentResults: [],
    totalDurationMs: 1,
    completedAt: "2026-09-01T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/health/cron authorization", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
  ] as const)("rejects an unauthenticated %s without running alerts", async (method, handler) => {
    const response = await handler(request(method));
    expect(response.status).toBe(401);
    expect(runHealthCheck).not.toHaveBeenCalled();
  });

  it("rejects an incorrect credential", async () => {
    const response = await POST(request("POST", "Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(runHealthCheck).not.toHaveBeenCalled();
  });

  it("allows an authenticated manual trigger", async () => {
    const response = await POST(request("POST", "Bearer test-secret"));
    expect(response.status).toBe(200);
    expect(runHealthCheck).toHaveBeenCalledWith("manual");
  });

  it("supports an authenticated silent manual trigger", async () => {
    const silentRequest = new NextRequest(
      "http://localhost/api/health/cron?type=manual&notify=false",
      {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      },
    );

    const response = await POST(silentRequest);
    expect(response.status).toBe(200);
    expect(runHealthCheck).toHaveBeenCalledWith("manual", {
      notificationsEnabled: false,
    });
  });

  it("fails closed in production when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET(request("GET"));
    expect(response.status).toBe(500);
    expect(runHealthCheck).not.toHaveBeenCalled();
  });
});
