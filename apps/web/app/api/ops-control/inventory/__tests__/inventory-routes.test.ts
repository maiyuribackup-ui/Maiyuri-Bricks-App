/**
 * Operations Control inventory and reservation route tests.
 *
 * The database enforces the hard invariants (append-only movements, the
 * adjustment-reason CHECK, atomic transfer). These tests cover the API layer's
 * own responsibilities: role gates, the over-reservation and over-promise
 * blocks, one opening balance per product, and lock_version conflicts.
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

import { GET as inventoryGet } from "../route";
import { POST as movementPost } from "../movements/route";
import { GET as reconcileGet } from "../reconcile/route";
import { POST as reservationPost } from "../../reservations/route";
import { POST as transferPost } from "../../reservations/transfer/route";
import { POST as releasePost } from "../../reservations/[id]/release/route";

const FG = "11111111-1111-1111-1111-111111111111";
const SO_LINE = "22222222-2222-2222-2222-222222222222";
const OTHER_LINE = "33333333-3333-3333-3333-333333333333";
const RESERVATION = "44444444-4444-4444-4444-444444444444";

function req(body?: Record<string, unknown>, url = "http://localhost/api"): NextRequest {
  return new NextRequest(url, {
    method: body ? "POST" : "GET",
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

/** The reads loadInventory() performs, in order. */
function queueInventory(opts: {
  onHand: number;
  movements?: unknown[];
  reservations?: unknown[];
}) {
  queue("finished_goods", {
    data: [{ id: FG, name: '8" brick', stock_qty: opts.onHand, stock_synced_at: null }],
    error: null,
  });
  queue("oc_inventory_movements", { data: opts.movements ?? [], error: null });
  queue("oc_stock_reservations", { data: opts.reservations ?? [], error: null });
}

const soLineRow = (over: Record<string, unknown> = {}) => ({
  id: SO_LINE,
  finished_good_id: FG,
  qty_ordered: 5000,
  qty_delivered: 1000,
  is_demand: true,
  source_active: true,
  order_name: "S00501",
  ...over,
});

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  rpcCalls.length = 0;
  rpcResult = { data: null, error: null };
  mockGetUser.mockReset();
});

describe("GET /inventory — the four buckets", () => {
  it("refuses an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue(null);
    expect((await inventoryGet(req())).status).toBe(401);
  });

  it("lets sales read: they are the ones asked when we can ship", async () => {
    signInAs("sales");
    queueInventory({ onHand: 0 });
    expect((await inventoryGet(req())).status).toBe(200);
  });

  it("reports coverage and readiness as different facts", async () => {
    signInAs("production_supervisor");
    queueInventory({
      onHand: 900,
      movements: [
        { finished_good_id: FG, quantity: 900, movement_date: "2026-08-22", available_from: "2099-01-01" },
      ],
      reservations: [
        { finished_good_id: FG, quantity: 900, available_from: "2099-01-01", status: "active" },
      ],
    });
    const res = await inventoryGet(req());
    const { data } = await body(res);
    const product = (data as { products: Record<string, number | string>[] }).products[0];
    expect(product.reservedCuring).toBe(900);
    expect(product.readyPhysical).toBe(0);
    expect(product.nextReadyFrom).toBe("2099-01-01");
  });

  it("rejects a malformed as_of rather than silently using today", async () => {
    signInAs("owner");
    const res = await inventoryGet(req(undefined, "http://localhost/api?as_of=next-friday"));
    expect(res.status).toBe(400);
  });
});

describe("POST /inventory/movements", () => {
  it("refuses sales: reading stock is not the same as moving it", async () => {
    signInAs("sales");
    const res = await movementPost(
      req({ movement_type: "opening", finished_good_id: FG, quantity: 100 }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses an adjustment with no reason", async () => {
    signInAs("owner");
    const res = await movementPost(
      req({ movement_type: "adjustment", finished_good_id: FG, quantity: -50 }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a second opening balance for the same product", async () => {
    signInAs("owner");
    queue("oc_inventory_movements", { data: [{ id: "existing" }], error: null });
    const res = await movementPost(
      req({ movement_type: "opening", finished_good_id: FG, quantity: 100 }),
    );
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("opening balance already exists");
  });

  it("refuses to write a production receipt by hand", async () => {
    // Receipts come from posting a production actual (Phase 4), through its
    // own transactional RPC — a hand-written one would bypass the reservation
    // and labour effects that must happen with it.
    signInAs("owner");
    const res = await movementPost(
      req({ movement_type: "production_receipt", finished_good_id: FG, quantity: 900 }),
    );
    expect(res.status).toBe(400);
  });

  it("records an adjustment with its reason", async () => {
    signInAs("production_supervisor");
    // No opening-balance pre-check runs for an adjustment, so the first
    // queued result is the insert itself.
    queue("oc_inventory_movements", { data: { id: "mv-1" }, error: null });
    const res = await movementPost(
      req({
        movement_type: "adjustment",
        finished_good_id: FG,
        quantity: -50,
        reason: "Recount after breakage",
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("GET /inventory/reconcile — drift is surfaced, not absorbed", () => {
  it("returns only the products that disagree with Odoo", async () => {
    signInAs("owner");
    queueInventory({
      onHand: 8000,
      movements: [
        { finished_good_id: FG, quantity: 8300, movement_date: "2026-08-01", available_from: null },
      ],
    });
    const { data } = await body(await reconcileGet(req()));
    const payload = data as { checked: number; exception_count: number; rows: { drift: number }[] };
    expect(payload.checked).toBe(1);
    expect(payload.exception_count).toBe(1);
    expect(payload.rows[0].drift).toBe(300);
  });

  it("reports no exceptions when the ledger agrees", async () => {
    signInAs("owner");
    queueInventory({
      onHand: 1000,
      movements: [
        { finished_good_id: FG, quantity: 1000, movement_date: "2026-08-01", available_from: null },
      ],
    });
    const { data } = await body(await reconcileGet(req()));
    expect((data as { exception_count: number }).exception_count).toBe(0);
  });
});

describe("POST /reservations", () => {
  const RESERVE = { so_line_id: SO_LINE, finished_good_id: FG, quantity: 900 };

  it("refuses a reservation against a retired line", async () => {
    signInAs("owner");
    queue("oc_sales_order_lines", { data: soLineRow({ source_active: false }), error: null });
    const res = await reservationPost(req(RESERVE));
    expect(res.status).toBe(400);
  });

  it("refuses a reservation whose product is not the line's product", async () => {
    signInAs("owner");
    queue("oc_sales_order_lines", {
      data: soLineRow({ finished_good_id: "99999999-9999-9999-9999-999999999999" }),
      error: null,
    });
    const res = await reservationPost(req(RESERVE));
    expect(res.status).toBe(400);
  });

  it("refuses to reserve more than the line still needs", async () => {
    signInAs("owner");
    queue("oc_sales_order_lines", { data: soLineRow(), error: null });
    // 4,000 outstanding, 3,500 already reserved → only 500 left to reserve.
    queue("oc_stock_reservations", { data: [{ quantity: 3500 }], error: null });
    const res = await reservationPost(req(RESERVE));
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("still needs 500");
  });

  it("refuses to promise stock that is not free", async () => {
    signInAs("owner");
    queue("oc_sales_order_lines", { data: soLineRow(), error: null });
    queue("oc_stock_reservations", { data: [], error: null });
    queueInventory({
      onHand: 400,
      movements: [
        { finished_good_id: FG, quantity: 400, movement_date: "2026-08-01", available_from: null },
      ],
    });
    const res = await reservationPost(req(RESERVE));
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("only 400 ready");
  });

  it("allows reserving stock that is still curing (PRD §4)", async () => {
    // The whole point: bricks made today for this order are spoken for now,
    // even though they cannot ship for a week.
    signInAs("production_supervisor");
    queue("oc_sales_order_lines", { data: soLineRow(), error: null });
    queue("oc_stock_reservations", { data: [], error: null });
    queueInventory({
      onHand: 900,
      movements: [
        { finished_good_id: FG, quantity: 900, movement_date: "2026-08-22", available_from: "2099-01-01" },
      ],
    });
    queue("oc_stock_reservations", { data: { id: "res-1" }, error: null });
    const res = await reservationPost(req({ ...RESERVE, available_from: "2099-01-01" }));
    expect(res.status).toBe(201);
  });
});

describe("POST /reservations/transfer", () => {
  const TRANSFER = {
    reservation_id: RESERVATION,
    to_so_line_id: OTHER_LINE,
    quantity: 900,
    reason: "Kumar's site is not ready",
    lock_version: 0,
  };

  it("refuses a transfer with no reason", async () => {
    signInAs("owner");
    const res = await transferPost(req({ ...TRANSFER, reason: "" }));
    expect(res.status).toBe(400);
  });

  it("delegates to the atomic RPC rather than two writes", async () => {
    signInAs("owner");
    rpcResult = { data: { new_reservation_id: "res-2", source_remaining: 100 }, error: null };
    const res = await transferPost(req({ ...TRANSFER, quantity: 900 }));
    expect(res.status).toBe(200);
    expect(rpcCalls[0].fn).toBe("oc_transfer_reservation");
    expect(rpcCalls[0].args.p_expected_lock).toBe(0);
  });

  it("turns a stale lock into a 409 the operator can act on", async () => {
    signInAs("owner");
    rpcResult = { data: null, error: { message: "lock_version mismatch", code: "40001" } };
    const res = await transferPost(req(TRANSFER));
    expect(res.status).toBe(409);
    expect((await body(res)).error).toContain("reload");
  });
});

describe("POST /reservations/[id]/release", () => {
  const params = { params: Promise.resolve({ id: RESERVATION }) };

  it("refuses to release an already-consumed reservation", async () => {
    signInAs("owner");
    queue("oc_stock_reservations", {
      data: { id: RESERVATION, so_line_id: SO_LINE, quantity: 900, status: "consumed", lock_version: 3 },
      error: null,
    });
    const res = await releasePost(req({ lock_version: 3, reason: "cancelled" }), params);
    expect(res.status).toBe(409);
  });

  it("409s when the row moved between the read and the update", async () => {
    signInAs("owner");
    queue("oc_stock_reservations", {
      data: { id: RESERVATION, so_line_id: SO_LINE, quantity: 900, status: "active", lock_version: 3 },
      error: null,
    });
    queue("oc_stock_reservations", { data: null, error: null }); // guarded update matched nothing
    const res = await releasePost(req({ lock_version: 3, reason: "cancelled" }), params);
    expect(res.status).toBe(409);
  });

  it("releases an active reservation with its reason", async () => {
    signInAs("owner");
    queue("oc_stock_reservations", {
      data: { id: RESERVATION, so_line_id: SO_LINE, quantity: 900, status: "active", lock_version: 3 },
      error: null,
    });
    queue("oc_stock_reservations", { data: { id: RESERVATION, status: "released" }, error: null });
    const res = await releasePost(req({ lock_version: 3, reason: "Order cancelled" }), params);
    expect(res.status).toBe(200);
  });
});
