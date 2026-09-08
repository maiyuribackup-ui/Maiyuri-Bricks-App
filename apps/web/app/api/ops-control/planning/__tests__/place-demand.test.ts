/**
 * Placing unscheduled demand from the planning grid.
 *
 * This is the one part of the grid that touches customer-facing records, so
 * the tests are mostly about what it REFUSES: adding to a version the
 * customer is holding, revising a confirmed schedule without a stated
 * reason, and over-scheduling counted against what a draft already promises.
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

import { POST as placePost } from "../place-demand/route";

const SO = "11111111-1111-1111-1111-111111111111";

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/ops-control/planning/place-demand", {
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

/** A schedulable SO line: 1000 ordered, none delivered. */
function schedulableLine(over: Partial<Record<string, unknown>> = {}) {
  queue("oc_sales_order_lines", {
    data: [
      {
        id: SO,
        odoo_order_id: 42,
        order_name: "SO1254",
        odoo_partner_id: 7,
        partner_name: "Umapathi",
        product_name: "CIB 8in",
        line_kind: "product",
        is_demand: true,
        source_active: true,
        qty_ordered: 1000,
        qty_delivered: 0,
        ...over,
      },
    ],
    error: null,
  });
}

const onePlacement = {
  placements: [{ so_line_id: SO, delivery_date: "2026-09-18", quantity: 900 }],
};

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  writes.length = 0;
  mockGetUser.mockReset();
});

describe("role gates", () => {
  it("refuses an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue(null);
    expect((await placePost(post(onePlacement))).status).toBe(401);
  });

  it("admits sales — scheduling a customer's delivery is their job (PRD §7.3)", async () => {
    signInAs("sales");
    schedulableLine();
    queue("oc_delivery_schedules", { data: null, error: null }); // no schedule
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: null },
      error: null,
    });
    queue("oc_delivery_schedule_versions", { data: null, error: null }); // no open
    queue("oc_delivery_schedule_versions", { data: null, error: null }); // max ver
    queue("oc_delivery_schedule_versions", { data: { id: "v1" }, error: null });
    queue("oc_delivery_schedule_lines", { data: [], error: null });
    const res = await placePost(post(onePlacement));
    expect(res.status).toBe(200);
  });
});

describe("validation", () => {
  it("rejects the whole request when a line is no longer on the Odoo order", async () => {
    // A stale grid must not quietly schedule the lines it still got right.
    signInAs("owner");
    schedulableLine({ source_active: false });
    const res = await placePost(post(onePlacement));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("no longer on the Odoo order");
  });

  it("rejects a service line", async () => {
    signInAs("owner");
    schedulableLine({ line_kind: "service", is_demand: false });
    const res = await placePost(post(onePlacement));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("not a schedulable product line");
  });

  it("rejects a zero quantity at the schema", async () => {
    signInAs("owner");
    const res = await placePost(
      post({ placements: [{ so_line_id: SO, delivery_date: "2026-09-18", quantity: 0 }] }),
    );
    expect(res.status).toBe(400);
  });
});

describe("outcomes", () => {
  it("CREATED: opens a schedule and a draft V1 when none exists", async () => {
    signInAs("owner");
    schedulableLine();
    queue("oc_delivery_schedules", { data: null, error: null });
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: null },
      error: null,
    });
    queue("oc_delivery_schedule_versions", { data: null, error: null });
    queue("oc_delivery_schedule_versions", { data: null, error: null });
    queue("oc_delivery_schedule_versions", { data: { id: "v1" }, error: null });
    queue("oc_delivery_schedule_lines", { data: [], error: null });

    const res = await placePost(post(onePlacement));
    const data = (await body(res)).data as { placed: number; results: { outcome: string }[] };
    expect(data.placed).toBe(1);
    expect(data.results[0].outcome).toBe("created");
    const lineWrite = writes.find(
      (w) => w.table === "oc_delivery_schedule_lines" && w.op === "insert",
    );
    expect(lineWrite).toBeTruthy();
    expect((lineWrite!.payload as { delivery_date: string }[])[0].delivery_date).toBe(
      "2026-09-18",
    );
  });

  it("APPENDED: adds to an existing open DRAFT rather than opening a second version", async () => {
    signInAs("owner");
    schedulableLine();
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: null },
      error: null,
    });
    queue("oc_delivery_schedule_versions", {
      data: { id: "v2", version_no: 2, status: "draft" },
      error: null,
    });
    queue("oc_delivery_schedule_lines", { data: [], error: null });

    const res = await placePost(post(onePlacement));
    const data = (await body(res)).data as { results: { outcome: string }[] };
    expect(data.results[0].outcome).toBe("appended");
    // No new version row may be written when a draft is already open.
    expect(
      writes.filter((w) => w.table === "oc_delivery_schedule_versions" && w.op === "insert"),
    ).toHaveLength(0);
  });

  it("SKIPPED: will not add to a version the customer is holding", async () => {
    // The database forbids a second open version, but the real reason is
    // that a sent schedule is mid-conversation with a customer.
    signInAs("owner");
    schedulableLine();
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: null },
      error: null,
    });
    queue("oc_delivery_schedule_versions", {
      data: { id: "v2", version_no: 2, status: "sent" },
      error: null,
    });

    const res = await placePost(post(onePlacement));
    const data = (await body(res)).data as {
      placed: number;
      skipped: number;
      results: { outcome: string; reason: string }[];
    };
    expect(data.placed).toBe(0);
    expect(data.skipped).toBe(1);
    expect(data.results[0].reason).toContain("with the customer");
    expect(writes.filter((w) => w.table === "oc_delivery_schedule_lines")).toHaveLength(0);
  });

  it("SKIPPED: refuses to revise a confirmed schedule without a reason", async () => {
    signInAs("owner");
    schedulableLine();
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: "v1" },
      error: null,
    });
    queue("oc_delivery_schedule_versions", { data: null, error: null }); // none open

    const res = await placePost(post(onePlacement));
    const data = (await body(res)).data as { results: { outcome: string; reason: string }[] };
    expect(data.results[0].outcome).toBe("skipped");
    expect(data.results[0].reason).toContain("opens a revision, which needs a reason");
    expect(
      writes.filter((w) => w.table === "oc_delivery_schedule_versions" && w.op === "insert"),
    ).toHaveLength(0);
  });

  it("REVISED: opens a revision when a reason is supplied, and records it", async () => {
    signInAs("owner");
    schedulableLine();
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: "v1" },
      error: null,
    });
    queue("oc_delivery_schedule_versions", { data: null, error: null }); // none open
    queue("oc_delivery_schedule_versions", { data: { version_no: 1 }, error: null });
    queue("oc_delivery_schedule_versions", { data: { id: "v2" }, error: null });
    queue("oc_delivery_schedule_lines", { data: [], error: null });

    const res = await placePost(
      post({ ...onePlacement, revision_reason: "Second load agreed on the phone" }),
    );
    const data = (await body(res)).data as { results: { outcome: string }[] };
    expect(data.results[0].outcome).toBe("revised");
    const verWrite = writes.find(
      (w) => w.table === "oc_delivery_schedule_versions" && w.op === "insert",
    );
    expect((verWrite!.payload as { revision_reason: string; version_no: number }))
      .toMatchObject({ revision_reason: "Second load agreed on the phone", version_no: 2 });
  });
});

describe("over-scheduling", () => {
  it("counts what the draft already promises, not just the new lines", async () => {
    // 800 already in the draft plus 900 placed against a 1,000 order. Neither
    // number alone exceeds it; together they do.
    signInAs("owner");
    schedulableLine();
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: null },
      error: null,
    });
    queue("oc_delivery_schedule_versions", {
      data: { id: "v1", version_no: 1, status: "draft" },
      error: null,
    });
    queue("oc_delivery_schedule_lines", {
      data: [{ so_line_id: SO, quantity: 800 }],
      error: null,
    });

    const res = await placePost(post(onePlacement));
    const data = (await body(res)).data as { results: { outcome: string; reason: string }[] };
    expect(data.results[0].outcome).toBe("skipped");
    expect(data.results[0].reason).toContain("exceeds the open order by 700");
    expect(
      writes.filter((w) => w.table === "oc_delivery_schedule_lines" && w.op === "insert"),
    ).toHaveLength(0);
  });

  it("proceeds when an authorised role gives an override reason, and stores it", async () => {
    signInAs("founder");
    schedulableLine();
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: null },
      error: null,
    });
    queue("oc_delivery_schedule_versions", {
      data: { id: "v1", version_no: 1, status: "draft" },
      error: null,
    });
    queue("oc_delivery_schedule_lines", {
      data: [{ so_line_id: SO, quantity: 800 }],
      error: null,
    });

    const res = await placePost(
      post({ ...onePlacement, overschedule_override_reason: "Customer increased by phone" }),
    );
    const data = (await body(res)).data as { placed: number };
    expect(data.placed).toBe(1);
    const override = writes.find(
      (w) => w.table === "oc_delivery_schedule_versions" && w.op === "update",
    );
    expect((override!.payload as { overschedule_override_reason: string })
      .overschedule_override_reason).toBe("Customer increased by phone");
  });

  it("refuses the override for a role that may not give one", async () => {
    signInAs("sales");
    schedulableLine();
    queue("oc_delivery_schedules", {
      data: { id: "sch-1", order_name: "SO1254", odoo_partner_id: 7, customer_name: "Umapathi", site_location_id: null, active_confirmed_version_id: null },
      error: null,
    });
    queue("oc_delivery_schedule_versions", {
      data: { id: "v1", version_no: 1, status: "draft" },
      error: null,
    });
    queue("oc_delivery_schedule_lines", {
      data: [{ so_line_id: SO, quantity: 800 }],
      error: null,
    });

    const res = await placePost(
      post({ ...onePlacement, overschedule_override_reason: "because" }),
    );
    const data = (await body(res)).data as { results: { reason: string }[] };
    expect(data.results[0].reason).toContain("Your role cannot override");
  });
});
