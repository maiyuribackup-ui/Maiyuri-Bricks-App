import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from },
}));

vi.mock("@/lib/supabase-server", () => ({
  getUserFromRequest: vi.fn(),
}));

vi.mock("@/lib/push/fcm", () => ({
  filterByPushPref: vi.fn(),
  getUserIdsByRoles: vi.fn(),
  notifyLeadPush: vi.fn(),
}));

import { DELETE, GET, PUT } from "./route";

const invalidParams = { params: Promise.resolve({ id: "undefined" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/leads/[id]", () => {
  it("rejects malformed lead IDs before querying Supabase", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/leads/undefined"),
      invalidParams,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      data: null,
      error: "Invalid lead ID",
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("mutations /api/leads/[id]", () => {
  it("rejects malformed lead IDs before an update reaches Supabase", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/leads/undefined", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_status: "connected" }),
      }),
      invalidParams,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid lead ID" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects malformed lead IDs before a delete reaches Supabase", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/leads/undefined", { method: "DELETE" }),
      invalidParams,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid lead ID" });
    expect(from).not.toHaveBeenCalled();
  });
});
