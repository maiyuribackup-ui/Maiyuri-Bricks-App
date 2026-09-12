/**
 * /api/process route tests: auth gating, body validation and the mapping of
 * engine errors onto HTTP statuses. Engine behaviour itself is covered by
 * src/lib/process/*.test.ts and the SQL suites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUser(...args),
}));

let role = "sales";
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"])
        chain[m] = () => chain;
      chain.single = () => Promise.resolve({ data: { role }, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    },
  },
}));

const { engine, queue } = vi.hoisted(() => ({
  engine: {
    advance: vi.fn(),
    cancel: vi.fn(),
    startProcess: vi.fn(),
    getInstanceView: vi.fn(),
  },
  queue: { loadWorkQueue: vi.fn() },
}));
vi.mock("@/lib/process/engine", () => engine);
vi.mock("@/lib/process/work-queue", () => queue);

import { ProcessError } from "@/lib/process/errors";
import { POST as advancePost } from "../instances/[id]/advance/route";
import { POST as cancelPost } from "../instances/[id]/cancel/route";
import { POST as startPost } from "../instances/route";
import { GET as workGet } from "../work/route";

const SI = "11111111-1111-1111-1111-111111111111";
const params = { params: Promise.resolve({ id: "inst-1" }) };

function req(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/process/x", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function body(res: Response) {
  return (await res.json()) as { data: unknown; error: string | null };
}

beforeEach(() => {
  vi.clearAllMocks();
  role = "sales";
  mockGetUser.mockResolvedValue({ id: "user-1", email: "u@x" });
});

describe("auth", () => {
  it("rejects anonymous callers with 401", async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await workGet(req());
    expect(res.status).toBe(401);
  });
  it("serves the work queue to a signed-in user", async () => {
    queue.loadWorkQueue.mockResolvedValue({
      mine: [],
      role: [],
      handovers: [],
      overdue: [],
      summary: { mine: 0, role: 0, handovers: 0, overdue: 0 },
    });
    const res = await workGet(req());
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({ summary: { mine: 0 } });
  });
});

describe("validation + error mapping", () => {
  it("400 on an invalid body", async () => {
    const res = await advancePost(
      req({ expected_stage_instance_id: "not-a-uuid" }),
      params,
    );
    expect(res.status).toBe(400);
    expect(engine.advance).not.toHaveBeenCalled();
  });
  it("422 with the gate key when a gate fails", async () => {
    engine.advance.mockRejectedValue(
      new ProcessError(
        "GATE_FAILED",
        "Advance is not verified",
        422,
        "ADVANCE_VERIFIED",
      ),
    );
    const res = await advancePost(
      req({ expected_stage_instance_id: SI }),
      params,
    );
    expect(res.status).toBe(422);
    expect((await body(res)).error).toBe(
      "Advance is not verified [ADVANCE_VERIFIED]",
    );
  });
  it("403 when the engine refuses the role, 409 when stale", async () => {
    engine.advance.mockRejectedValueOnce(
      new ProcessError("FORBIDDEN", "only the FINANCE may complete"),
    );
    expect(
      (await advancePost(req({ expected_stage_instance_id: SI }), params))
        .status,
    ).toBe(403);
    engine.advance.mockRejectedValueOnce(
      new ProcessError("STALE_STAGE", "moved on"),
    );
    expect(
      (await advancePost(req({ expected_stage_instance_id: SI }), params))
        .status,
    ).toBe(409);
  });
  it("cancel requires a reason", async () => {
    const res = await cancelPost(req({ reason: "x" }), params);
    expect(res.status).toBe(400);
    engine.cancel.mockResolvedValue({ instance: { status: "cancelled" } });
    const ok = await cancelPost(req({ reason: "customer lost" }), params);
    expect(ok.status).toBe(200);
  });
  it("starting mid-process is partner-only", async () => {
    const res = await startPost(
      req({
        process_key: "LEAD_TO_DELIVERY",
        entity_type: "lead",
        entity_id: "l1",
        imported_existing_case: true,
        start_stage_key: "QUOTATION",
      }),
    );
    expect(res.status).toBe(403);
    expect(engine.startProcess).not.toHaveBeenCalled();
    role = "founder";
    engine.startProcess.mockResolvedValue({ instance: { id: "i" } });
    const ok = await startPost(
      req({
        process_key: "LEAD_TO_DELIVERY",
        entity_type: "lead",
        entity_id: "l1",
        imported_existing_case: true,
        start_stage_key: "QUOTATION",
      }),
    );
    expect(ok.status).toBe(201);
  });
  it("unexpected errors are 500 without leaking internals", async () => {
    engine.advance.mockRejectedValue(new Error("pg connection reset"));
    const res = await advancePost(
      req({ expected_stage_instance_id: SI }),
      params,
    );
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("Failed to move the case forward");
  });
});
