/**
 * Operations Control dispatch route tests.
 *
 * The database owns the reconciliation identity, the completed-row freeze and
 * the atomic completion. These cover the API layer's own share: role gates,
 * the extra-trip reason, the product match on a load, the draft-may-be-
 * unbalanced rule, and the pass-through of the message that tells an operator
 * how many bricks are unexplained.
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
    "select", "eq", "neq", "in", "is", "order", "limit", "insert", "update",
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

import { POST as tripsPost } from "../trips/route";
import { POST as loadLinePost } from "../load-lines/route";
import { PATCH as loadLinePatch } from "../load-lines/[id]/route";
import { POST as completePost } from "../load-lines/[id]/complete/route";
import { POST as adjustmentPost } from "../load-lines/[id]/adjustments/route";

const FG = "11111111-1111-1111-1111-111111111111";
const SO_LINE = "22222222-2222-2222-2222-222222222222";
const STOP = "33333333-3333-3333-3333-333333333333";
const LINE = "44444444-4444-4444-4444-444444444444";

function req(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function signInAs(role: string) {
  mockGetUser.mockResolvedValue({ id: "user-1" });
  queue("users", { data: { role }, error: null });
}
async function body(res: Response) {
  return (await res.json()) as { data: unknown; error: string | null };
}
const params = { params: Promise.resolve({ id: LINE }) };

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  rpcCalls.length = 0;
  rpcResult = { data: null, error: null };
  mockGetUser.mockReset();
});

describe("role gates", () => {
  it("refuses an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue(null);
    expect((await tripsPost(req({ trip_date: "2026-08-30" }))).status).toBe(401);
  });

  it("refuses sales: dispatch planning is internal", async () => {
    signInAs("sales");
    expect((await tripsPost(req({ trip_date: "2026-08-30" }))).status).toBe(403);
  });
});

describe("POST /dispatch/trips", () => {
  it("allocates the next trip number for the day", async () => {
    signInAs("production_supervisor");
    queue("oc_settings", { data: { normal_max_trips_per_day: 2 }, error: null });
    queue("oc_trips", { data: { trip_no: 1 }, error: null });
    queue("oc_trips", { data: { id: "trip-2", trip_no: 2 }, error: null });
    const res = await tripsPost(req({ trip_date: "2026-08-30" }));
    expect(res.status).toBe(201);
  });

  it("refuses a third trip with no reason, but allows it with one", async () => {
    // PRD §54: an extra trip is a planning exception. It warns and demands a
    // reason — it does not forbid the trip.
    signInAs("owner");
    queue("oc_settings", { data: { normal_max_trips_per_day: 2 }, error: null });
    queue("oc_trips", { data: { trip_no: 2 }, error: null });
    const refused = await tripsPost(req({ trip_date: "2026-08-30" }));
    expect(refused.status).toBe(400);
    expect((await body(refused)).error).toContain("beyond the usual 2");

    signInAs("owner");
    queue("oc_settings", { data: { normal_max_trips_per_day: 2 }, error: null });
    queue("oc_trips", { data: { trip_no: 2 }, error: null });
    queue("oc_trips", { data: { id: "trip-3", trip_no: 3 }, error: null });
    const allowed = await tripsPost(
      req({ trip_date: "2026-08-30", override_reason: "urgent site handover" }),
    );
    expect(allowed.status).toBe(201);
  });
});

describe("POST /dispatch/load-lines", () => {
  it("refuses a load whose SO line is for a different product", async () => {
    // Loading 8" against a 6" order would consume the wrong reservation at
    // completion and credit the customer for bricks they never got.
    signInAs("owner");
    queue("oc_sales_order_lines", {
      data: {
        finished_good_id: "99999999-9999-9999-9999-999999999999",
        is_demand: true,
        source_active: true,
      },
      error: null,
    });
    const res = await loadLinePost(
      req({ stop_id: STOP, finished_good_id: FG, so_line_id: SO_LINE, planned_qty: 900 }),
    );
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("different product");
  });

  it("allows a load with no sales order line (stock delivery)", async () => {
    signInAs("production_supervisor");
    queue("oc_trip_load_lines", { data: { id: LINE }, error: null });
    const res = await loadLinePost(
      req({ stop_id: STOP, finished_good_id: FG, planned_qty: 500 }),
    );
    expect(res.status).toBe(201);
  });
});

describe("PATCH /dispatch/load-lines/[id] — the driver's report", () => {
  it("saves a draft that does NOT yet balance", async () => {
    // The driver reports in stages: loaded on departure, the rest on return.
    // Refusing to save an unbalanced draft would make the screen unusable.
    signInAs("production_supervisor");
    queue("oc_trip_load_lines", { data: { status: "draft" }, error: null });
    queue("oc_trip_load_lines", { data: { id: LINE, actual_loaded_qty: 900 }, error: null });
    const res = await loadLinePatch(
      req({ actual_loaded_qty: 900, lock_version: 0 }),
      params,
    );
    expect(res.status).toBe(200);
  });

  it("refuses to edit a completed delivery", async () => {
    signInAs("owner");
    queue("oc_trip_load_lines", { data: { status: "completed" }, error: null });
    const res = await loadLinePatch(
      req({ actual_unloaded_qty: 850, lock_version: 1 }),
      params,
    );
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("adjustment");
  });
});

describe("POST /dispatch/load-lines/[id]/complete", () => {
  it("delegates entirely to the atomic RPC", async () => {
    signInAs("production_supervisor");
    rpcResult = {
      data: { already_completed: false, net_inventory_impact: -880, customer_fulfilment: 850 },
      error: null,
    };
    const res = await completePost(req({ lock_version: 0 }), params);
    expect(res.status).toBe(200);
    expect(rpcCalls[0].fn).toBe("oc_complete_delivery_line");
    expect(rpcCalls[0].args.p_expected_lock).toBe(0);
  });

  it("passes the unexplained-bricks message through to the operator", async () => {
    // This sentence names exactly how many bricks need classifying. Masking
    // it would leave the operator with a refusal and no way to act on it.
    signInAs("owner");
    rpcResult = {
      data: null,
      error: {
        message:
          "loaded 900.00 but only 870.00 accounted for (unloaded 820.00 + returned 20.00 + damaged 30.00 + short 0.00) — classify the remaining 30.00 before completing",
      },
    };
    const res = await completePost(req({ lock_version: 0 }), params);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("classify the remaining 30");
  });

  it("turns a stale lock into a 409", async () => {
    signInAs("owner");
    rpcResult = { data: null, error: { message: "lock_version mismatch", code: "40001" } };
    expect((await completePost(req({ lock_version: 0 }), params)).status).toBe(409);
  });
});

describe("POST /dispatch/load-lines/[id]/adjustments", () => {
  it("refuses an adjustment on a draft — edit it instead", async () => {
    signInAs("owner");
    queue("oc_trip_load_lines", { data: { id: LINE, status: "draft" }, error: null });
    const res = await adjustmentPost(req({ delta_unloaded: 10, reason: "recount" }), params);
    expect(res.status).toBe(400);
  });

  it("refuses an adjustment of zero", async () => {
    signInAs("owner");
    const res = await adjustmentPost(req({ delta_unloaded: 0, reason: "nothing" }), params);
    expect(res.status).toBe(400);
  });

  it("records a delta against a completed delivery", async () => {
    signInAs("owner");
    queue("oc_trip_load_lines", { data: { id: LINE, status: "completed" }, error: null });
    queue("oc_delivery_actual_adjustments", { data: { id: "adj-1" }, error: null });
    const res = await adjustmentPost(req({ delta_unloaded: 10, reason: "customer recount" }), params);
    expect(res.status).toBe(201);
  });
});
