import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runHealthCheck } = vi.hoisted(() => ({
  runHealthCheck: vi.fn(),
}));
vi.mock("@/lib/health/runner", () => ({ runHealthCheck }));

import { POST } from "./route";

function request(authorization?: string) {
  return new NextRequest("http://localhost/api/health/cron?type=manual", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
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

describe("POST /api/health/cron authorization", () => {
  it("rejects an unauthenticated manual trigger without running alerts", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(runHealthCheck).not.toHaveBeenCalled();
  });

  it("allows an authenticated manual trigger", async () => {
    const response = await POST(request("Bearer test-secret"));
    expect(response.status).toBe(200);
    expect(runHealthCheck).toHaveBeenCalledWith("manual");
  });
});
