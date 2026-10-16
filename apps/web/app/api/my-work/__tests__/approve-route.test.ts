/**
 * POST /api/my-work/[id]/approve: maker-checker and the approval audit row.
 * The database CHECK (work_items_approver_not_assignee) is covered by
 * supabase/tests/process_os/50_work_approval.sql.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { auth, service, db } = vi.hoisted(() => ({
  auth: { user: { id: "sup-1", email: "s@x", role: "production_supervisor" } },
  service: {
    getWorkItemForUser: vi.fn(),
    logWorkEvent: vi.fn(),
  },
  db: {
    update: vi.fn(),
    result: { data: null as unknown, error: null as unknown },
  },
}));

vi.mock("@/lib/api-helpers", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api-helpers")>()),
  requireAuth: () => Promise.resolve(auth.user),
}));

vi.mock("@/lib/my-work-service", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/my-work-service")>()),
  getWorkItemForUser: (...a: unknown[]) => service.getWorkItemForUser(...a),
  logWorkEvent: (...a: unknown[]) => service.logWorkEvent(...a),
}));

vi.mock("@/lib/my-work-notify", () => ({ notifyWorkApproved: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.update = (patch: unknown) => {
        db.update(patch);
        return chain;
      };
      for (const m of ["eq", "select"]) chain[m] = () => chain;
      chain.single = () => Promise.resolve(db.result);
      return chain;
    },
  },
}));

import { POST } from "../[id]/approve/route";

const params = { params: Promise.resolve({ id: "wi-1" }) };
const submitted = {
  id: "wi-1",
  status: "submitted",
  assigned_user_id: "worker-1",
};

function req(): NextRequest {
  return new NextRequest("http://localhost/api/my-work/wi-1/approve", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: "sup-1", email: "s@x", role: "production_supervisor" };
  service.getWorkItemForUser.mockResolvedValue(submitted);
  db.result = { data: { ...submitted, status: "completed" }, error: null };
});

describe("POST /api/my-work/[id]/approve", () => {
  it("approves another person's submission and records the approver", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", approved_by: "sup-1" }),
    );
    expect(service.logWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "approved", performed_by: "sup-1" }),
    );
  });

  it("refuses to let a supervisor approve their own submission", async () => {
    service.getWorkItemForUser.mockResolvedValue({
      ...submitted,
      assigned_user_id: "sup-1",
    });
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
    expect(service.logWorkEvent).not.toHaveBeenCalled();
  });

  it("maps the database maker-checker violation to 403", async () => {
    db.result = { data: null, error: { code: "23514", message: "check" } };
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(service.logWorkEvent).not.toHaveBeenCalled();
  });

  it("rejects non-supervisors", async () => {
    auth.user = { id: "worker-1", email: "w@x", role: "engineer" };
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("only approves submitted work", async () => {
    service.getWorkItemForUser.mockResolvedValue({
      ...submitted,
      status: "in_progress",
    });
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
  });
});
