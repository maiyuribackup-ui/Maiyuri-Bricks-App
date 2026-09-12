/**
 * Operations Control production route tests.
 *
 * The database owns the invariants that must hold whoever writes: the
 * quantity balance, the posted-row freeze, the atomic post. These tests cover
 * what only the API layer can get wrong — role gates, the readable pre-checks,
 * lock conflicts, the bag step, and the rule that a DRAFT is allowed to be
 * incomplete while a POST is not.
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
    "select", "eq", "in", "is", "order", "limit", "insert", "update",
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

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcResult: { data: unknown; error: { message: string; code?: string } | null } = {
  data: null,
  error: null,
};
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
  },
}));

import { GET as daysGet, POST as daysPost } from "../days/route";
import { POST as planLinePost } from "../plan-lines/route";
import { POST as allocationPost } from "../allocations/route";
import { POST as actualPost } from "../actuals/route";
import { POST as postActual } from "../actuals/[id]/post/route";
import { PUT as consumptionPut } from "../actuals/[id]/consumption/route";
import { POST as adjustmentPost } from "../actuals/[id]/adjustments/route";

const SHIFT = "11111111-1111-1111-1111-111111111111";
const FG = "22222222-2222-2222-2222-222222222222";
const SO_LINE = "33333333-3333-3333-3333-333333333333";
const PLAN_LINE = "44444444-4444-4444-4444-444444444444";
const ACTUAL = "55555555-5555-5555-5555-555555555555";

function req(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function getReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}
function signInAs(role: string) {
  mockGetUser.mockResolvedValue({ id: "user-1" });
  queue("users", { data: { role }, error: null });
}
async function body(res: Response) {
  return (await res.json()) as { data: unknown; error: string | null };
}
const params = { params: Promise.resolve({ id: ACTUAL }) };

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  rpcCalls.length = 0;
  rpcResult = { data: null, error: null };
  mockGetUser.mockReset();
});

describe("role gates", () => {
  it("refuses an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue(null);
    expect((await daysPost(req({ prod_date: "2026-08-30" }))).status).toBe(401);
  });

  it("refuses sales: production planning is internal", async () => {
    signInAs("sales");
    expect((await daysPost(req({ prod_date: "2026-08-30" }))).status).toBe(403);
  });
});

describe("POST /production/actuals — the draft rules", () => {
  it("refuses accepted + rejected exceeding gross", async () => {
    // Integrity, not a warning: it describes bricks that never existed.
    signInAs("production_supervisor");
    const res = await actualPost(
      req({ shift_id: SHIFT, finished_good_id: FG, gross_qty: 1000, accepted_qty: 900, rejected_qty: 200 }),
    );
    expect(res.status).toBe(400);
  });

  it("allows a draft whose output is not yet fully assigned", async () => {
    // The whole point of a draft: Rajesh is still entering.
    signInAs("production_supervisor");
    queue("oc_production_actuals", { data: null, error: null }); // no existing row
    queue("oc_production_plan_lines", { data: { planned_qty: 1500 }, error: null });
    queue("oc_production_actuals", { data: { id: ACTUAL, status: "draft" }, error: null });
    const res = await actualPost(
      req({ shift_id: SHIFT, finished_good_id: FG, gross_qty: 1250, accepted_qty: 1200, rejected_qty: 50 }),
    );
    expect(res.status).toBe(200);
  });

  it("refuses to edit an already-posted entry", async () => {
    signInAs("owner");
    queue("oc_production_actuals", {
      data: { id: ACTUAL, status: "posted", lock_version: 1 },
      error: null,
    });
    const res = await actualPost(
      req({ shift_id: SHIFT, finished_good_id: FG, gross_qty: 1000, accepted_qty: 1000, rejected_qty: 0 }),
    );
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("adjustment");
  });
});

describe("POST /production/allocations", () => {
  const ALLOC = { plan_line_id: PLAN_LINE, purpose: "sales_order", so_line_id: SO_LINE, planned_qty: 700 };

  it("refuses a sales-order allocation with no line named", async () => {
    signInAs("owner");
    const res = await allocationPost(
      req({ plan_line_id: PLAN_LINE, purpose: "sales_order", planned_qty: 700 }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a stock allocation that names a sales order line", async () => {
    // PRD §24: stock production must not masquerade as an order.
    signInAs("owner");
    const res = await allocationPost(
      req({ plan_line_id: PLAN_LINE, purpose: "stock", so_line_id: SO_LINE, planned_qty: 300 }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses an allocation whose SO line is for a different product", async () => {
    signInAs("owner");
    queue("oc_production_plan_lines", { data: { id: PLAN_LINE, finished_good_id: FG }, error: null });
    queue("oc_sales_order_lines", {
      data: { finished_good_id: "99999999-9999-9999-9999-999999999999", is_demand: true, source_active: true },
      error: null,
    });
    const res = await allocationPost(req(ALLOC));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("different product");
  });

  it("refuses an allocation against a retired demand line", async () => {
    signInAs("owner");
    queue("oc_production_plan_lines", { data: { id: PLAN_LINE, finished_good_id: FG }, error: null });
    queue("oc_sales_order_lines", {
      data: { finished_good_id: FG, is_demand: true, source_active: false },
      error: null,
    });
    const res = await allocationPost(req(ALLOC));
    expect(res.status).toBe(400);
  });

  it("accepts a stock allocation with no SO line", async () => {
    signInAs("production_supervisor");
    queue("oc_production_plan_lines", { data: { id: PLAN_LINE, finished_good_id: FG }, error: null });
    queue("oc_production_allocations", { data: { id: "alloc-1" }, error: null });
    const res = await allocationPost(
      req({ plan_line_id: PLAN_LINE, purpose: "stock", planned_qty: 300, stock_ref: "buffer" }),
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /production/actuals/[id]/post", () => {
  it("delegates entirely to the atomic RPC", async () => {
    // No business logic in the handler: splitting the work is exactly how a
    // half-posted actual becomes possible.
    signInAs("production_supervisor");
    rpcResult = {
      data: { already_posted: false, movement_id: "mv-1", reservations_created: 2 },
      error: null,
    };
    const res = await postActual(req({ lock_version: 0 }), params);
    expect(res.status).toBe(200);
    expect(rpcCalls[0].fn).toBe("oc_post_production_actual");
    expect(rpcCalls[0].args.p_expected_lock).toBe(0);
  });

  it("turns a stale lock into a 409", async () => {
    signInAs("owner");
    rpcResult = { data: null, error: { message: "lock_version mismatch", code: "40001" } };
    const res = await postActual(req({ lock_version: 0 }), params);
    expect(res.status).toBe(409);
  });

  it("passes the unassigned-output message through to the operator", async () => {
    // "allocation actuals total 1100 but accepted output is 1200" is the most
    // useful sentence in the flow; masking it would strand the operator.
    signInAs("owner");
    rpcResult = {
      data: null,
      error: {
        message:
          "allocation actuals total 1100 but accepted output is 1200 — assign the difference before posting",
      },
    };
    const res = await postActual(req({ lock_version: 0 }), params);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("assign the difference");
  });
});

describe("PUT /production/actuals/[id]/consumption", () => {
  it("refuses a bag figure off the configured step", async () => {
    signInAs("production_supervisor");
    queue("oc_settings", {
      data: { cement_bag_step: 0.5, ratio_amber_tolerance_pct: 5, ratio_red_tolerance_pct: 10 },
      error: null,
    });
    const res = await consumptionPut(req({ material: "cement", bags: 4.3 }), params);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("steps of 0.5");
  });

  it("accepts a half bag", async () => {
    signInAs("production_supervisor");
    queue("oc_settings", {
      data: { cement_bag_step: 0.5, ratio_amber_tolerance_pct: 5, ratio_red_tolerance_pct: 10 },
      error: null,
    });
    queue("oc_production_actuals", { data: { id: ACTUAL, status: "draft" }, error: null });
    queue("oc_material_consumption", { data: { id: "c-1", bags: 4.5 }, error: null });
    const res = await consumptionPut(req({ material: "cement", bags: 4.5 }), params);
    expect(res.status).toBe(200);
  });

  it("refuses cement on a posted entry", async () => {
    signInAs("owner");
    queue("oc_settings", {
      data: { cement_bag_step: 0.5, ratio_amber_tolerance_pct: 5, ratio_red_tolerance_pct: 10 },
      error: null,
    });
    queue("oc_production_actuals", { data: { id: ACTUAL, status: "posted" }, error: null });
    const res = await consumptionPut(req({ material: "cement", bags: 4.5 }), params);
    expect(res.status).toBe(409);
  });
});

describe("POST /production/actuals/[id]/adjustments", () => {
  it("refuses an adjustment on a draft — edit it instead", async () => {
    signInAs("owner");
    queue("oc_production_actuals", { data: { id: ACTUAL, status: "draft" }, error: null });
    const res = await adjustmentPost(req({ delta_accepted: -50, reason: "recount" }), params);
    expect(res.status).toBe(400);
  });

  it("refuses an adjustment with no reason", async () => {
    signInAs("owner");
    const res = await adjustmentPost(req({ delta_accepted: -50 }), params);
    expect(res.status).toBe(400);
  });

  it("refuses an adjustment of zero", async () => {
    signInAs("owner");
    const res = await adjustmentPost(req({ delta_accepted: 0, reason: "nothing changed" }), params);
    expect(res.status).toBe(400);
  });

  it("records a delta against a posted entry", async () => {
    signInAs("owner");
    queue("oc_production_actuals", { data: { id: ACTUAL, status: "posted" }, error: null });
    queue("oc_production_actual_adjustments", { data: { id: "adj-1" }, error: null });
    const res = await adjustmentPost(req({ delta_accepted: -50, reason: "recount" }), params);
    expect(res.status).toBe(201);
  });
});

describe("POST /production/plan-lines", () => {
  it("reports a duplicate product in the same shift readably", async () => {
    signInAs("production_supervisor");
    queue("oc_production_plan_lines", {
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const res = await planLinePost(
      req({ shift_id: SHIFT, finished_good_id: FG, planned_qty: 1500 }),
    );
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("already planned");
  });
});


describe("GET /production/days?date= — the payload the screen consumes", () => {
  /**
   * The screen cannot function without these three keys, and the first
   * version of it shipped unusable because nothing checked that the data it
   * needs to render its pickers was actually being returned. This test is
   * that check.
   */
  it("returns the day, the product picker and the demand picker together", async () => {
    signInAs("production_supervisor");
    queue("oc_production_days", { data: { id: "day-1", prod_date: "2026-08-30" }, error: null });
    queue("oc_production_shifts", { data: [], error: null });
    queue("finished_goods", { data: [{ id: FG, name: "8in brick" }], error: null });
    // loadPlanningOptions runs in parallel: its own products + demand reads.
    queue("finished_goods", { data: [{ id: FG, name: "8in brick" }], error: null });
    queue("oc_sales_order_lines", {
      data: [
        { id: SO_LINE, finished_good_id: FG, order_name: "S00501", partner_name: "Kumar",
          qty_ordered: 5000, qty_delivered: 1000 },
        { id: "done-line", finished_good_id: FG, order_name: "S00400", partner_name: "Old",
          qty_ordered: 1000, qty_delivered: 1000 },
      ],
      error: null,
    });

    const res = await daysGet(getReq("http://localhost/api?date=2026-08-30"));
    expect(res.status).toBe(200);
    const { data } = await body(res);
    const payload = data as {
      date: string;
      day: unknown;
      products: { id: string }[];
      demand: { id: string; remaining: number }[];
    };

    expect(payload.date).toBe("2026-08-30");
    expect(payload.day).not.toBeNull();
    expect(payload.products).toHaveLength(1);
    // A line delivered in full cannot be produced for — it must not appear in
    // the allocation picker, or the operator promises output to a closed order.
    expect(payload.demand).toHaveLength(1);
    expect(payload.demand[0].id).toBe(SO_LINE);
    expect(payload.demand[0].remaining).toBe(4000);
  });

  it("refuses sales", async () => {
    signInAs("sales");
    expect((await daysGet(getReq("http://localhost/api?date=2026-08-30"))).status).toBe(403);
  });
});
