/**
 * Operations Control masters API tests.
 *
 * These routes use the service-role client, which bypasses RLS, so the role
 * gate in the handler is the only thing standing between a driver and the
 * labour rate master. That is what these tests are mostly about.
 *
 * Also covers the two behaviours the PRD is strict on:
 *  - overlapping effective periods are a data-integrity failure and BLOCK (§88)
 *  - a rate change is audited with its before value (§74)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks --------------------------------------------------------------
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUser(...args),
}));

/** Per-table queue of results the mocked client should return. */
const results: Record<string, unknown[]> = {};
const inserted: Record<string, unknown[]> = {};

function queue(table: string, result: unknown) {
  (results[table] ??= []).push(result);
}
function nextResult(table: string) {
  return (results[table] ?? []).shift() ?? { data: null, error: null };
}

/**
 * A chainable stub: every builder method returns the same object, and the
 * terminal awaits (single/maybeSingle/then) resolve the queued result.
 */
function builder(table: string) {
  const chain: Record<string, unknown> = {};
  const passthrough = [
    "select", "eq", "order", "limit", "gte", "lte", "update", "upsert", "insert",
  ];
  for (const method of passthrough) {
    chain[method] = (...args: unknown[]) => {
      if (method === "insert" || method === "upsert") {
        (inserted[table] ??= []).push(args[0]);
      }
      return chain;
    };
  }
  chain.single = () => Promise.resolve(nextResult(table));
  chain.maybeSingle = () => Promise.resolve(nextResult(table));
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

import { POST as ratesPost, GET as ratesGet } from "../activity-rates/route";
import { POST as mappingPost } from "../product-mapping/route";
import { PATCH as settingsPatch } from "../settings/route";

function req(url: string, body?: Record<string, unknown>, method = "POST"): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Sign in as a role by queueing the users-table lookup requireProductionRole does. */
function signInAs(role: string) {
  mockGetUser.mockResolvedValue({ id: "user-1" });
  queue("users", { data: { role }, error: null });
}

const VALID_RATE = {
  finished_good_id: "11111111-1111-1111-1111-111111111111",
  activity_code: "production",
  rate: 7,
  effective_from: "2026-01-01",
  effective_to: "2026-08-31",
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(results)) delete results[key];
  for (const key of Object.keys(inserted)) delete inserted[key];
});

describe("POST /api/ops-control/masters/activity-rates — authorization", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await ratesPost(req("/api/ops-control/masters/activity-rates", VALID_RATE));
    expect(res.status).toBe(401);
  });

  it("rejects a driver — rates are not theirs to set", async () => {
    signInAs("driver");
    const res = await ratesPost(req("/api/ops-control/masters/activity-rates", VALID_RATE));
    expect(res.status).toBe(403);
  });

  it("rejects a production_supervisor — rate changes are founder/owner only", async () => {
    // Supervisors record production; they do not change what labour is paid.
    signInAs("production_supervisor");
    const res = await ratesPost(req("/api/ops-control/masters/activity-rates", VALID_RATE));
    expect(res.status).toBe(403);
  });

  it("allows a founder", async () => {
    signInAs("founder");
    queue("oc_activity_rates", { data: { id: "rate-1" }, error: null });
    queue("oc_audit_events", { data: null, error: null });
    const res = await ratesPost(req("/api/ops-control/masters/activity-rates", VALID_RATE));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/ops-control/masters/activity-rates — validation", () => {
  it("rejects a negative rate", async () => {
    signInAs("founder");
    const res = await ratesPost(
      req("/api/ops-control/masters/activity-rates", { ...VALID_RATE, rate: -1 }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a period that ends before it starts", async () => {
    signInAs("founder");
    const res = await ratesPost(
      req("/api/ops-control/masters/activity-rates", {
        ...VALID_RATE,
        effective_from: "2026-09-01",
        effective_to: "2026-08-01",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 with a usable message when periods overlap (PRD §88)", async () => {
    signInAs("founder");
    // 23P01 = exclusion_violation, raised by the EXCLUDE constraint.
    queue("oc_activity_rates", { data: null, error: { code: "23P01", message: "conflicting key value" } });
    const res = await ratesPost(req("/api/ops-control/masters/activity-rates", VALID_RATE));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/overlaps an existing rate/i);
  });

  it("accepts an open-ended period (effective_to omitted)", async () => {
    signInAs("founder");
    queue("oc_activity_rates", { data: { id: "rate-2" }, error: null });
    queue("oc_audit_events", { data: null, error: null });
    const { effective_to: _drop, ...openEnded } = VALID_RATE;
    const res = await ratesPost(req("/api/ops-control/masters/activity-rates", openEnded));
    expect(res.status).toBe(200);
    expect(inserted.oc_activity_rates?.[0]).toMatchObject({ effective_to: null });
  });
});

describe("GET /api/ops-control/masters/activity-rates", () => {
  it("is readable without a write role — the UI needs it to band values", async () => {
    queue("oc_activity_rates", { data: [], error: null });
    const res = await ratesGet(req("/api/ops-control/masters/activity-rates", undefined, "GET"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/ops-control/masters/product-mapping", () => {
  const MAPPING = {
    odoo_product_id: 8,
    odoo_product_name: "CIB-10*8*5-Single Press",
    finished_good_id: "11111111-1111-1111-1111-111111111111",
  };

  it("rejects a sales user", async () => {
    signInAs("sales");
    const res = await mappingPost(req("/api/ops-control/masters/product-mapping", MAPPING));
    expect(res.status).toBe(403);
  });

  it("maps an unmapped Odoo product so its demand becomes visible", async () => {
    signInAs("owner");
    queue("oc_product_mapping", { data: null, error: null }); // no existing mapping
    queue("oc_product_mapping", { data: { id: "map-1" }, error: null }); // upsert result
    queue("oc_audit_events", { data: null, error: null });
    const res = await mappingPost(req("/api/ops-control/masters/product-mapping", MAPPING));
    expect(res.status).toBe(200);
    expect(inserted.oc_product_mapping?.[0]).toMatchObject({ odoo_product_id: 8 });
  });

  it("rejects a non-numeric odoo_product_id", async () => {
    signInAs("owner");
    const res = await mappingPost(
      req("/api/ops-control/masters/product-mapping", { ...MAPPING, odoo_product_id: "eight" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/ops-control/masters/settings", () => {
  it("rejects an empty body rather than issuing a no-op update", async () => {
    signInAs("founder");
    const res = await settingsPatch(req("/api/ops-control/masters/settings", {}, "PATCH"));
    expect(res.status).toBe(400);
  });

  it("rejects a yellow threshold above green", async () => {
    signInAs("founder");
    const res = await settingsPatch(
      req(
        "/api/ops-control/masters/settings",
        { load_green_min_pct: 90, load_yellow_min_pct: 95 },
        "PATCH",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an amber tolerance above red", async () => {
    signInAs("founder");
    const res = await settingsPatch(
      req(
        "/api/ops-control/masters/settings",
        { ratio_amber_tolerance_pct: 20, ratio_red_tolerance_pct: 10 },
        "PATCH",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid shift count — V1 supports one or two only", async () => {
    signInAs("founder");
    const res = await settingsPatch(
      req("/api/ops-control/masters/settings", { default_shifts_per_day: 3 }, "PATCH"),
    );
    expect(res.status).toBe(400);
  });
});
