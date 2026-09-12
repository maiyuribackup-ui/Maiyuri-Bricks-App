/**
 * Planning week-grid route tests.
 *
 * The bulk save is the risky half: it opens production days, writes plan
 * lines and deletes cleared ones, all without a wrapping transaction. These
 * cover the two refusals that keep it safe — a posted day is history, and a
 * day split across shifts holds a division this screen cannot see — plus the
 * stale-tab guard that stops last week's grid overwriting this week's.
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

const writes: { table: string; op: string; payload?: unknown }[] = [];

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "not", "order", "limit", "gte", "lte"]) {
    chain[m] = () => chain;
  }
  chain.insert = (payload: unknown) => {
    writes.push({ table, op: "insert", payload });
    return chain;
  };
  chain.update = (payload: unknown) => {
    writes.push({ table, op: "update", payload });
    return chain;
  };
  chain.delete = () => {
    writes.push({ table, op: "delete" });
    return chain;
  };
  chain.single = () => Promise.resolve(nextResult(table));
  chain.maybeSingle = () => Promise.resolve(nextResult(table));
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { PUT as savePut } from "../production-cells/route";
import { GET as weekGet } from "../week/route";

const FG = "11111111-1111-1111-1111-111111111111";
const FG2 = "22222222-2222-2222-2222-222222222222";

function put(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/ops-control/planning/production-cells", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/ops-control/planning/week${qs}`);
}
function signInAs(role: string) {
  mockGetUser.mockResolvedValue({ id: "user-1" });
  queue("users", { data: { role }, error: null });
}
async function body(res: Response) {
  return (await res.json()) as { data: unknown; error: string | null };
}

/** A week whose days are all open with one shift and no posted actuals. */
function openWeek(dates: string[]) {
  queue(
    "oc_production_days",
    { data: dates.map((d, i) => ({ id: `day-${i}`, prod_date: d })), error: null },
  );
  queue("oc_production_shifts", {
    data: dates.map((_, i) => ({ id: `shift-${i}`, day_id: `day-${i}`, shift_no: 1 })),
    error: null,
  });
}

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  writes.length = 0;
  mockGetUser.mockReset();
});

describe("role gates", () => {
  it("refuses an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue(null);
    expect((await weekGet(get())).status).toBe(401);
  });

  it("refuses sales: planning is internal", async () => {
    signInAs("sales");
    expect(
      (await savePut(put({ week_start: "2026-09-05", cells: [] }))).status,
    ).toBe(403);
  });

  it("admits the production supervisor, who does the planning", async () => {
    signInAs("production_supervisor");
    openWeek(["2026-09-05"]);
    queue("oc_production_actuals", { data: [], error: null });
    queue("oc_production_plan_lines", { data: [], error: null });
    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 900 }],
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("PUT production-cells", () => {
  it("rejects a cell that is not in the week it claims — the stale-tab guard", async () => {
    signInAs("owner");
    const res = await savePut(
      put({
        week_start: "2026-09-05",
        // 2026-09-14 is the NEXT factory week.
        cells: [{ finished_good_id: FG, date: "2026-09-14", quantity: 900 }],
      }),
    );
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("not in the week");
  });

  it("opens a production day and its shift when the date has never been planned", async () => {
    signInAs("owner");
    queue("oc_production_days", { data: [], error: null }); // nothing exists
    queue("oc_production_days", {
      data: [{ id: "day-new", prod_date: "2026-09-05" }],
      error: null,
    }); // the insert returning
    queue("oc_production_shifts", { data: null, error: null }); // shift insert
    queue("oc_production_shifts", {
      data: [{ id: "shift-new", day_id: "day-new", shift_no: 1 }],
      error: null,
    });
    queue("oc_production_actuals", { data: [], error: null });
    queue("oc_production_plan_lines", { data: [], error: null });

    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 900 }],
      }),
    );
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({ written: 1, cleared: 0 });
    // A day cannot hold a plan line without a shift, so both must be created.
    expect(writes.filter((w) => w.table === "oc_production_days" && w.op === "insert"))
      .toHaveLength(1);
    expect(writes.filter((w) => w.table === "oc_production_shifts" && w.op === "insert"))
      .toHaveLength(1);
  });

  it("refuses to rewrite a day whose production is already posted", async () => {
    // The plan is what the variance report measures against. Once the day is
    // posted, rewriting the plan would rewrite the past.
    signInAs("owner");
    openWeek(["2026-09-05"]);
    queue("oc_production_actuals", {
      data: [{ shift_id: "shift-0", status: "posted" }],
      error: null,
    });
    queue("oc_production_plan_lines", { data: [], error: null });

    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 900 }],
      }),
    );
    expect(res.status).toBe(200);
    const data = (await body(res)).data as {
      written: number;
      skipped: { reason: string }[];
    };
    expect(data.written).toBe(0);
    expect(data.skipped[0].reason).toContain("posted production");
    expect(writes.filter((w) => w.table === "oc_production_plan_lines")).toHaveLength(0);
  });

  it("leaves a draft actual alone — only POSTED days are history", async () => {
    signInAs("owner");
    openWeek(["2026-09-05"]);
    queue("oc_production_actuals", {
      data: [{ shift_id: "shift-0", status: "draft" }],
      error: null,
    });
    queue("oc_production_plan_lines", { data: [], error: null });

    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 900 }],
      }),
    );
    expect((await body(res)).data).toMatchObject({ written: 1 });
  });

  it("refuses to overwrite a product split across two shifts", async () => {
    // The grid shows the day total but does not know the supervisor put 1000
    // in shift 1 and 800 in shift 2. Writing 1800 into one line would erase
    // that division silently.
    signInAs("owner");
    openWeek(["2026-09-05"]);
    queue("oc_production_actuals", { data: [], error: null });
    queue("oc_production_plan_lines", {
      data: [
        { id: "pl-1", shift_id: "shift-0", finished_good_id: FG, planned_qty: 1000 },
        { id: "pl-2", shift_id: "shift-0", finished_good_id: FG, planned_qty: 800 },
      ],
      error: null,
    });

    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 1800 }],
      }),
    );
    const data = (await body(res)).data as {
      written: number;
      skipped: { reason: string }[];
    };
    expect(data.written).toBe(0);
    expect(data.skipped[0].reason).toContain("splits this product across 2 shifts");
    expect(writes.filter((w) => w.table === "oc_production_plan_lines")).toHaveLength(0);
  });

  it("updates an existing single plan line rather than adding a second", async () => {
    signInAs("owner");
    openWeek(["2026-09-05"]);
    queue("oc_production_actuals", { data: [], error: null });
    queue("oc_production_plan_lines", {
      data: [{ id: "pl-1", shift_id: "shift-0", finished_good_id: FG, planned_qty: 900 }],
      error: null,
    });

    await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 1200 }],
      }),
    );
    const planWrites = writes.filter((w) => w.table === "oc_production_plan_lines");
    expect(planWrites).toHaveLength(1);
    expect(planWrites[0].op).toBe("update");
    expect(planWrites[0].payload).toEqual({ planned_qty: 1200 });
  });

  it("treats zero as clearing the cell, not as an invalid quantity", async () => {
    // Deleting a plan is as ordinary an edit as writing one.
    signInAs("owner");
    openWeek(["2026-09-05"]);
    queue("oc_production_actuals", { data: [], error: null });
    queue("oc_production_plan_lines", {
      data: [{ id: "pl-1", shift_id: "shift-0", finished_good_id: FG, planned_qty: 900 }],
      error: null,
    });

    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 0 }],
      }),
    );
    expect((await body(res)).data).toMatchObject({ written: 0, cleared: 1 });
    expect(writes.filter((w) => w.table === "oc_production_plan_lines")[0].op).toBe("delete");
  });

  it("clearing an already-empty cell is a no-op, not an error", async () => {
    signInAs("owner");
    openWeek(["2026-09-05"]);
    queue("oc_production_actuals", { data: [], error: null });
    queue("oc_production_plan_lines", { data: [], error: null });
    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: 0 }],
      }),
    );
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({ written: 0, cleared: 0 });
  });

  it("saves several products across several days in one request", async () => {
    // The whole point of the grid: one save, not one per cell.
    signInAs("owner");
    openWeek(["2026-09-05", "2026-09-06"]);
    queue("oc_production_actuals", { data: [], error: null });
    queue("oc_production_plan_lines", { data: [], error: null });

    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [
          { finished_good_id: FG, date: "2026-09-05", quantity: 900 },
          { finished_good_id: FG2, date: "2026-09-05", quantity: 1000 },
          { finished_good_id: FG, date: "2026-09-06", quantity: 450 },
        ],
      }),
    );
    expect((await body(res)).data).toMatchObject({ written: 3 });
  });

  it("rejects a negative quantity at the schema", async () => {
    signInAs("owner");
    const res = await savePut(
      put({
        week_start: "2026-09-05",
        cells: [{ finished_good_id: FG, date: "2026-09-05", quantity: -5 }],
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET planning/week", () => {
  it("rejects a malformed week_start rather than guessing", async () => {
    signInAs("owner");
    expect((await weekGet(get("?week_start=next-week"))).status).toBe(400);
  });

  it("rejects an out-of-range horizon", async () => {
    signInAs("owner");
    expect((await weekGet(get("?horizon=999"))).status).toBe(400);
  });
});
