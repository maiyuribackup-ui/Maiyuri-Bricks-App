/**
 * Operations Control schedule route tests.
 *
 * The database enforces the hard invariants (draft-only lines, one open
 * version, composite FKs, atomic confirm). These tests cover the API layer's
 * own responsibilities: role gates (sales IS allowed — PRD §7.3), readable
 * pre-checks, the over-scheduling block, and lock_version conflicts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUser(...args),
}));

const results: Record<string, unknown[]> = {};
function queue(table: string, result: unknown) {
  (results[table] ??= []).push(result);
}
function nextResult(table: string) {
  return (results[table] ?? []).shift() ?? { data: null, error: null };
}
function builder(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select", "eq", "in", "is", "ilike", "order", "limit", "insert", "update",
    "delete", "upsert", "gte", "lte",
  ]) {
    chain[m] = () => chain;
  }
  chain.single = () => Promise.resolve(nextResult(table));
  chain.maybeSingle = () => Promise.resolve(nextResult(table));
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

const rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
  },
}));

import { POST as schedulesPost } from "../route";
import { POST as versionsPost } from "../[id]/versions/route";
import { PUT as linesPut } from "../[id]/versions/[vid]/lines/route";
import { POST as confirmPost } from "../[id]/versions/[vid]/confirm/route";

function req(body?: Record<string, unknown>, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/ops-control/schedules", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function signInAs(role: string) {
  mockGetUser.mockResolvedValue({ id: "user-1" });
  queue("users", { data: { role }, error: null });
}
const params = (id: string, vid?: string) => ({
  params: Promise.resolve(vid ? { id, vid } : { id }) as never,
});

const SO_LINE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const soLineRow = (over: Record<string, unknown> = {}) => ({
  id: SO_LINE,
  odoo_order_id: 501,
  order_name: "S00501",
  odoo_partner_id: 9,
  partner_name: "Kumar",
  product_name: "MIB-10*8*5",
  line_kind: "product",
  is_demand: true,
  source_active: true,
  qty_ordered: 5000,
  qty_delivered: 1000,
  ...over,
});
const CREATE_BODY = {
  odoo_order_id: 501,
  lines: [{ so_line_id: SO_LINE, delivery_date: "2026-08-28", quantity: 1500 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(results)) delete results[k];
  rpcCalls.length = 0;
  rpcResult = { data: null, error: null };
});

describe("POST /schedules — roles", () => {
  it("allows sales to create a schedule (PRD §7.3)", async () => {
    signInAs("sales");
    queue("oc_sales_order_lines", { data: [soLineRow()], error: null });
    // header insert fails fast so we stop after the role+validation we test
    queue("oc_delivery_schedules", { data: null, error: { code: "23505", message: "dup" } });
    const res = await schedulesPost(req(CREATE_BODY));
    expect(res.status).toBe(409); // got PAST the role gate to the dup check
  });

  it("denies a driver", async () => {
    signInAs("driver");
    const res = await schedulesPost(req(CREATE_BODY));
    expect(res.status).toBe(403);
  });
});

describe("POST /schedules — over-scheduling (PRD §26)", () => {
  it("blocks scheduling beyond the open order without a reason", async () => {
    signInAs("founder");
    // remaining = 4000; scheduling 5000
    queue("oc_sales_order_lines", { data: [soLineRow()], error: null });
    const res = await schedulesPost(
      req({ ...CREATE_BODY, lines: [{ so_line_id: SO_LINE, delivery_date: "2026-08-28", quantity: 5000 }] }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds the open order by 1000/);
  });

  it("sales cannot override even WITH a reason", async () => {
    signInAs("sales");
    queue("oc_sales_order_lines", { data: [soLineRow()], error: null });
    const res = await schedulesPost(
      req({
        ...CREATE_BODY,
        lines: [{ so_line_id: SO_LINE, delivery_date: "2026-08-28", quantity: 5000 }],
        overschedule_override_reason: "customer insisted",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a retired or non-product line with a readable message", async () => {
    signInAs("founder");
    queue("oc_sales_order_lines", {
      data: [soLineRow({ source_active: false })],
      error: null,
    });
    const res = await schedulesPost(req(CREATE_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no longer exists on the Odoo order/);
  });
});

describe("POST /schedules/[id]/versions", () => {
  it("requires a revision reason once a confirmed version exists (PRD §14)", async () => {
    signInAs("production_supervisor");
    queue("oc_delivery_schedules", {
      data: {
        id: "sched-1", order_name: "S00501", odoo_partner_id: 9, customer_name: "Kumar",
        site_location_id: null, active_confirmed_version_id: "v1",
      },
      error: null,
    });
    const res = await versionsPost(req({}), params("sched-1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/revision reason is required/);
  });

  it("maps the one-open-version index violation to a clean 409", async () => {
    signInAs("founder");
    queue("oc_delivery_schedules", {
      data: {
        id: "sched-1", order_name: "S00501", odoo_partner_id: 9, customer_name: "Kumar",
        site_location_id: null, active_confirmed_version_id: null,
      },
      error: null,
    });
    queue("oc_delivery_schedule_versions", { data: { version_no: 1 }, error: null }); // max version
    queue("oc_delivery_schedule_versions", {
      data: null,
      error: { message: 'duplicate key value violates "uq_oc_sched_one_open_version"' },
    });
    const res = await versionsPost(req({}), params("sched-1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Another version is still open/);
  });
});

describe("PUT …/lines — immutability and locking", () => {
  it("409s on a stale lock_version before touching anything", async () => {
    signInAs("founder");
    queue("oc_delivery_schedules", {
      data: { id: "sched-1", odoo_order_id: 501, lock_version: 3 },
      error: null,
    });
    const res = await linesPut(
      req({ lock_version: 1, lines: CREATE_BODY.lines }, "PUT"),
      params("sched-1", "v2"),
    );
    expect(res.status).toBe(409);
  });

  it("409s when the version is no longer draft", async () => {
    signInAs("founder");
    queue("oc_delivery_schedules", {
      data: { id: "sched-1", odoo_order_id: 501, lock_version: 0 },
      error: null,
    });
    queue("oc_delivery_schedule_versions", { data: { id: "v2", status: "sent" }, error: null });
    const res = await linesPut(
      req({ lock_version: 0, lines: CREATE_BODY.lines }, "PUT"),
      params("sched-1", "v2"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/immutable/);
  });
});

describe("POST …/confirm", () => {
  it("maps the RPC's lock_version mismatch to 409", async () => {
    signInAs("sales");
    queue("oc_delivery_schedules", { data: { odoo_order_id: 501 }, error: null });
    queue("oc_delivery_schedule_versions", {
      data: { overschedule_override_reason: "already overridden" },
      error: null,
    });
    rpcResult = { data: null, error: { message: "lock_version mismatch (expected 0, have 2)" } };
    const res = await confirmPost(
      req({ lock_version: 0, confirmation_note: "ok" }),
      params("sched-1", "v1"),
    );
    expect(res.status).toBe(409);
    expect(rpcCalls[0]?.fn).toBe("oc_confirm_schedule_version");
  });

  it("re-checks over-scheduling against CURRENT Odoo quantities at confirm", async () => {
    signInAs("founder");
    queue("oc_delivery_schedules", { data: { odoo_order_id: 501 }, error: null });
    queue("oc_delivery_schedule_versions", {
      data: { overschedule_override_reason: null },
      error: null,
    });
    // version lines total 5000 but only 4000 remains open
    queue("oc_delivery_schedule_lines", {
      data: [{ so_line_id: SO_LINE, delivery_date: "2026-08-28", quantity: 5000 }],
      error: null,
    });
    queue("oc_sales_order_lines", { data: [soLineRow()], error: null });
    const res = await confirmPost(
      req({ lock_version: 0 }),
      params("sched-1", "v1"),
    );
    expect(res.status).toBe(409);
    expect(rpcCalls.length).toBe(0); // blocked before the RPC
  });
});
