/**
 * Operations Control labour route tests.
 *
 * The database owns generation, the differential walk and the locked-week
 * rule. These cover the API layer's own share: labour is a money question so
 * the read gate is narrower than every other ops module; the settlement
 * ladder must refuse a backward step with a message that tells the operator
 * what to do instead; and backfill must call the generator once per source
 * event rather than once per unpriced row.
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
  return (results[table] ?? []).shift() ?? { data: [], error: null };
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
const rpcResults: Record<string, unknown[]> = {};
function queueRpc(fn: string, result: unknown) {
  (rpcResults[fn] ??= []).push(result);
}
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(
        (rpcResults[fn] ?? []).shift() ?? { data: null, error: null },
      );
    },
  },
}));

import { GET as weekGet } from "../week/route";
import { GET as settlementsGet, POST as settlementsPost } from "../settlements/route";
import { GET as unpricedGet } from "../unpriced/route";
import { POST as backfillPost } from "../backfill/route";

const FG = "11111111-1111-1111-1111-111111111111";

function get(path: string): NextRequest {
  return new NextRequest(`http://localhost/api/ops-control/labour${path}`);
}
function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/ops-control/labour", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function signInAs(role: string) {
  mockGetUser.mockResolvedValue({ id: "user-1" });
  queue("users", { data: { role }, error: null });
}
async function body(res: Response) {
  return (await res.json()) as { data: unknown; error: string | null };
}

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  for (const k of Object.keys(rpcResults)) delete rpcResults[k];
  rpcCalls.length = 0;
  mockGetUser.mockReset();
});

describe("role gates", () => {
  it("refuses an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue(null);
    expect((await weekGet(get("/week"))).status).toBe(401);
  });

  it("refuses the production supervisor: labour is a money question", async () => {
    // Rajesh plans and posts production, but what it PAYS is not his to see.
    // This is deliberately narrower than every other ops read gate.
    signInAs("production_supervisor");
    expect((await weekGet(get("/week"))).status).toBe(403);
  });

  it("refuses sales", async () => {
    signInAs("sales");
    expect((await unpricedGet(get("/unpriced?from=2026-08-29&to=2026-09-04"))).status)
      .toBe(403);
  });

  it("admits the owner", async () => {
    signInAs("owner");
    queue("oc_labour_ledger", { data: [], error: null });
    queue("oc_labour_settlements", { data: null, error: null });
    queue("finished_goods", { data: [], error: null });
    expect((await weekGet(get("/week?week_start=2026-08-29"))).status).toBe(200);
  });
});

describe("GET /labour/week", () => {
  it("resolves any date inside the week to its Saturday start", async () => {
    signInAs("founder");
    queue("oc_labour_ledger", {
      data: [
        {
          id: "e1",
          entry_date: "2026-09-02",
          week_start: "2026-08-29",
          activity_code: "production",
          finished_good_id: FG,
          source_type: "production_actual",
          eligible_qty: "1000",
          rate_applied: "7.0000",
          amount: "7000",
          settlement_id: null,
        },
      ],
      error: null,
    });
    queue("oc_labour_settlements", { data: null, error: null });
    queue("finished_goods", { data: [{ id: FG, name: 'CIB 8in' }], error: null });

    // Wednesday 2 September sits in the Sat 29 Aug – Fri 4 Sep week.
    const res = await weekGet(get("/week?week_start=2026-09-02"));
    expect(res.status).toBe(200);
    const data = (await body(res)).data as {
      summary: { week_start: string; week_end: string; total: number };
      entries: { product_name: string | null; amount: number }[];
    };
    expect(data.summary.week_start).toBe("2026-08-29");
    expect(data.summary.week_end).toBe("2026-09-04");
    // Numerics arrive from Postgres as strings; the screen must not add them.
    expect(data.summary.total).toBe(7000);
    expect(data.entries[0].product_name).toBe('CIB 8in');
  });

  it("rejects a malformed week_start rather than guessing", async () => {
    signInAs("founder");
    const res = await weekGet(get("/week?week_start=last-saturday"));
    expect(res.status).toBe(400);
  });
});

describe("POST /labour/settlements", () => {
  it("moves a draft week forward and calls the settlement RPC", async () => {
    signInAs("founder");
    queue("oc_labour_settlements", { data: { status: "draft" }, error: null });
    queueRpc("oc_settle_labour_week", {
      data: { week_start: "2026-08-29", status: "approved" },
      error: null,
    });
    const res = await settlementsPost(
      post({ week_start: "2026-08-29", status: "approved" }),
    );
    expect(res.status).toBe(200);
    expect(rpcCalls[0].fn).toBe("oc_settle_labour_week");
    expect(rpcCalls[0].args.p_status).toBe("approved");
  });

  it("treats a week with no settlement row as draft", async () => {
    signInAs("owner");
    queue("oc_labour_settlements", { data: null, error: null });
    queueRpc("oc_settle_labour_week", { data: { status: "reviewed" }, error: null });
    expect(
      (await settlementsPost(post({ week_start: "2026-08-29", status: "reviewed" })))
        .status,
    ).toBe(200);
  });

  it("refuses approved → reviewed: money is already committed", async () => {
    signInAs("founder");
    queue("oc_labour_settlements", { data: { status: "approved" }, error: null });
    const res = await settlementsPost(
      post({ week_start: "2026-08-29", status: "reviewed" }),
    );
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("cannot go back");
    expect(rpcCalls).toHaveLength(0);
  });

  it("allows reviewed → draft: nothing is committed below approval", async () => {
    signInAs("founder");
    queue("oc_labour_settlements", { data: { status: "reviewed" }, error: null });
    queueRpc("oc_settle_labour_week", { data: { status: "draft" }, error: null });
    expect(
      (await settlementsPost(post({ week_start: "2026-08-29", status: "draft" })))
        .status,
    ).toBe(200);
  });

  it("refuses to reopen a locked week, and says where the correction goes", async () => {
    // The point of the message: a locked week is not a dead end, it is a
    // redirection. §67 — the correction is a differential in the open week.
    signInAs("founder");
    queue("oc_labour_settlements", { data: { status: "locked" }, error: null });
    const res = await settlementsPost(
      post({ week_start: "2026-08-29", status: "approved" }),
    );
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("differential");
    expect(rpcCalls).toHaveLength(0);
  });

  it("maps a serialization failure to 409, not a 500", async () => {
    signInAs("owner");
    queue("oc_labour_settlements", { data: { status: "draft" }, error: null });
    queueRpc("oc_settle_labour_week", {
      data: null,
      error: { message: "settlement changed", code: "40001" },
    });
    const res = await settlementsPost(
      post({ week_start: "2026-08-29", status: "approved", lock_version: 1 }),
    );
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("reload");
  });

  it("lists recent settlements for the owner", async () => {
    signInAs("owner");
    queue("oc_labour_settlements", { data: [{ week_start: "2026-08-29" }], error: null });
    const res = await settlementsGet(get("/settlements"));
    expect(res.status).toBe(200);
    expect((await body(res)).data).toHaveLength(1);
  });
});

describe("GET /labour/unpriced", () => {
  it("demands an explicit date range", async () => {
    signInAs("founder");
    expect((await unpricedGet(get("/unpriced?from=2026-08-29"))).status).toBe(400);
  });

  it("returns unpriced work with its roll-up", async () => {
    signInAs("founder");
    queueRpc("oc_unpriced_labour", {
      data: [
        {
          source_type: "production_actual",
          source_id: "a1",
          entry_date: "2026-08-30",
          activity_code: "production",
          finished_good_id: FG,
          eligible_qty: 1000,
        },
      ],
      error: null,
    });
    const res = await unpricedGet(get("/unpriced?from=2026-08-29&to=2026-09-04"));
    expect(res.status).toBe(200);
    const data = (await body(res)).data as { rows: unknown[] };
    expect(data.rows).toHaveLength(1);
  });
});

describe("POST /labour/backfill", () => {
  it("calls the generator once per source event, not once per unpriced row", async () => {
    // One posted production actual earns production labour for several
    // products; the RPC prices the whole event. Calling it per row would
    // hammer it identically N times for the same event.
    signInAs("founder");
    queueRpc("oc_unpriced_labour", {
      data: [
        { source_type: "production_actual", source_id: "a1", entry_date: "2026-08-30", activity_code: "production", finished_good_id: FG, eligible_qty: 1000 },
        { source_type: "production_actual", source_id: "a1", entry_date: "2026-08-30", activity_code: "loading", finished_good_id: FG, eligible_qty: 1000 },
        { source_type: "trip_load_line", source_id: "l1", entry_date: "2026-08-31", activity_code: "loading", finished_good_id: FG, eligible_qty: 900 },
      ],
      error: null,
    });
    queueRpc("oc_generate_labour", { data: { entries_created: 2, skipped_no_rate: 0 }, error: null });
    queueRpc("oc_generate_labour", { data: { entries_created: 1, skipped_no_rate: 1 }, error: null });

    const res = await backfillPost(post({ from: "2026-08-29", to: "2026-09-04" }));
    expect(res.status).toBe(200);
    const generate = rpcCalls.filter((c) => c.fn === "oc_generate_labour");
    expect(generate).toHaveLength(2);
    expect(generate.map((c) => c.args.p_source_id)).toEqual(["a1", "l1"]);
    expect((await body(res)).data).toEqual({
      sources_processed: 2,
      entries_created: 3,
      still_unpriced: 1,
    });
  });

  it("rejects a reversed range", async () => {
    signInAs("founder");
    const res = await backfillPost(post({ from: "2026-09-04", to: "2026-08-29" }));
    expect(res.status).toBe(400);
  });

  it("refuses the production supervisor", async () => {
    signInAs("production_supervisor");
    expect(
      (await backfillPost(post({ from: "2026-08-29", to: "2026-09-04" }))).status,
    ).toBe(403);
  });
});
