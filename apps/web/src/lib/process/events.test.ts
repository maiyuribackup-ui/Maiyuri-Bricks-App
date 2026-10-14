/**
 * Durable per-destination delivery of process events (outbox).
 *
 * The store below is an in-memory twin of the SQL claim / settle functions
 * (same lease, attempt and dead-letter rules) so the TypeScript dispatcher
 * can be exercised end to end without a database. The SQL functions
 * themselves are covered by supabase/tests/process_os/40_deliveries.sql.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessEventDeliveryRow, ProcessEventRow } from "@maiyuri/shared";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

import {
  DELIVERY_MAX_ATTEMPTS,
  backoffSeconds,
  dispatchDueDeliveries,
  dispatchPendingEvents,
  postWebhook,
  sanitizeDeliveryError,
  type DeliveryStore,
} from "./events";

// ------------------------------------------------------------------ fakes

const ev = (id: string, instance = "inst"): ProcessEventRow => ({
  id,
  process_instance_id: instance,
  stage_instance_id: null,
  event_type: "process.stage_started",
  actor_type: "user",
  actor_id: null,
  before_value: null,
  after_value: null,
  reason: null,
  payload: { secret_note: "customer phone 98765" },
  created_at: "2026-09-13T00:00:00Z",
});

class FakeStore implements DeliveryStore {
  events = new Map<string, ProcessEventRow>();
  rows = new Map<string, ProcessEventDeliveryRow>();
  now = new Date("2026-09-13T10:00:00Z");
  claimCalls = 0;

  add(event: ProcessEventRow, destinations = ["notification", "webhook"]) {
    this.events.set(event.id, event);
    for (const destination of destinations) {
      const id = `${event.id}:${destination}`;
      this.rows.set(id, {
        id,
        event_id: event.id,
        process_instance_id: event.process_instance_id,
        destination: destination as ProcessEventDeliveryRow["destination"],
        status: "pending",
        attempts: 0,
        max_attempts: DELIVERY_MAX_ATTEMPTS,
        next_attempt_at: this.now.toISOString(),
        lease_expires_at: null,
        leased_by: null,
        last_attempt_at: null,
        delivered_at: null,
        last_error: null,
        created_at: this.now.toISOString(),
        updated_at: this.now.toISOString(),
      });
    }
  }

  row(eventId: string, destination: string) {
    return this.rows.get(`${eventId}:${destination}`)!;
  }

  async claim(args: {
    instanceId?: string | null;
    limit: number;
    worker: string;
    leaseSeconds: number;
  }) {
    this.claimCalls += 1;
    const out: ProcessEventDeliveryRow[] = [];
    for (const r of this.rows.values()) {
      if (out.length >= args.limit) break;
      if (args.instanceId && r.process_instance_id !== args.instanceId)
        continue;
      const due =
        (r.status === "pending" || r.status === "failed") &&
        new Date(r.next_attempt_at) <= this.now;
      const expired =
        r.status === "leased" &&
        !!r.lease_expires_at &&
        new Date(r.lease_expires_at) < this.now;
      if (!due && !expired) continue;
      r.status = "leased";
      r.leased_by = args.worker;
      r.attempts += 1;
      r.last_attempt_at = this.now.toISOString();
      r.lease_expires_at = new Date(
        this.now.getTime() + args.leaseSeconds * 1000,
      ).toISOString();
      out.push({ ...r });
    }
    return out;
  }

  async loadEvents(ids: string[]) {
    return ids.map((id) => this.events.get(id)!).filter(Boolean);
  }

  async settle(args: {
    deliveryId: string;
    worker: string;
    outcome: "delivered" | "failed" | "skipped";
    error?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    const r = this.rows.get(args.deliveryId);
    if (!r || r.status !== "leased" || r.leased_by !== args.worker) return null;
    r.leased_by = null;
    r.lease_expires_at = null;
    if (args.outcome === "delivered") {
      r.status = "delivered";
      r.delivered_at = this.now.toISOString();
      r.last_error = null;
    } else if (args.outcome === "skipped") {
      r.status = "skipped";
      r.last_error = null;
    } else {
      r.last_error = args.error ?? null;
      if (r.attempts >= r.max_attempts) {
        r.status = "dead";
      } else {
        r.status = "failed";
        r.next_attempt_at = new Date(
          this.now.getTime() + (args.retryAfterSeconds ?? 0) * 1000,
        ).toISOString();
      }
    }
    return { ...r };
  }
}

const okWebhook = vi.fn(async () => {});
const okNotify = vi.fn(async () => {});

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
  okWebhook.mockClear();
  okNotify.mockClear();
});

const deps = (over: Record<string, unknown> = {}) => ({
  store,
  notify: okNotify,
  webhook: okWebhook,
  webhookUrl: "https://n8n.example.test/hook",
  worker: "w1",
  ...over,
});

// ------------------------------------------------------------------ tests

describe("dispatchPendingEvents — happy path", () => {
  it("records notification and webhook deliveries as delivered, once", async () => {
    store.add(ev("a"));
    store.add(ev("b"));
    expect(await dispatchPendingEvents("inst", deps())).toBe(4);
    expect(okNotify).toHaveBeenCalledTimes(2);
    expect(okWebhook).toHaveBeenCalledTimes(2);
    for (const id of ["a", "b"]) {
      expect(store.row(id, "notification").status).toBe("delivered");
      expect(store.row(id, "notification").delivered_at).not.toBeNull();
      expect(store.row(id, "webhook").status).toBe("delivered");
    }
    // A second run finds nothing: delivered destinations are never re-sent.
    expect(await dispatchPendingEvents("inst", deps())).toBe(0);
    expect(okNotify).toHaveBeenCalledTimes(2);
    expect(okWebhook).toHaveBeenCalledTimes(2);
  });

  it("only touches the requested case", async () => {
    store.add(ev("a", "inst"));
    store.add(ev("z", "other"));
    await dispatchPendingEvents("inst", deps());
    expect(store.row("z", "notification").status).toBe("pending");
    expect(store.row("a", "notification").status).toBe("delivered");
  });
});

describe("failure isolation", () => {
  it("a notification failure does not block webhook delivery of the same event", async () => {
    store.add(ev("a"));
    const n = await dispatchPendingEvents(
      "inst",
      deps({
        notify: async () => {
          throw new Error("push down");
        },
      }),
    );
    expect(n).toBe(1);
    expect(store.row("a", "notification").status).toBe("failed");
    expect(store.row("a", "notification").last_error).toContain("push down");
    expect(store.row("a", "webhook").status).toBe("delivered");
  });

  it("a webhook failure does not erase a successful notification", async () => {
    store.add(ev("a"));
    await dispatchPendingEvents(
      "inst",
      deps({
        webhook: async () => {
          throw new Error("HTTP 500");
        },
      }),
    );
    expect(store.row("a", "notification").status).toBe("delivered");
    expect(store.row("a", "webhook").status).toBe("failed");
    // Retry: only the webhook is attempted again, the notification stays delivered.
    store.now = new Date(store.now.getTime() + 3600_000);
    await dispatchPendingEvents("inst", deps());
    expect(okNotify).toHaveBeenCalledTimes(1);
    expect(store.row("a", "webhook").status).toBe("delivered");
    expect(store.row("a", "notification").status).toBe("delivered");
  });

  it("a failing notifier never blocks the other events", async () => {
    store.add(ev("x"));
    store.add(ev("y"));
    const seen: string[] = [];
    await dispatchPendingEvents(
      "inst",
      deps({
        notify: async (e: ProcessEventRow) => {
          seen.push(e.id);
          if (e.id === "x") throw new Error("push down");
        },
      }),
    );
    expect(seen).toEqual(["x", "y"]);
    expect(store.row("y", "notification").status).toBe("delivered");
  });
});

describe("retry, backoff and dead letters", () => {
  it("advances attempt count and next-attempt time on failure", async () => {
    store.add(ev("a"), ["webhook"]);
    const failing = deps({
      webhook: async () => {
        throw new Error("boom");
      },
    });
    await dispatchPendingEvents("inst", failing);
    const first = store.row("a", "webhook");
    expect(first.attempts).toBe(1);
    expect(first.status).toBe("failed");
    const firstNext = new Date(first.next_attempt_at).getTime();
    expect(firstNext - store.now.getTime()).toBe(backoffSeconds(1) * 1000);
    // Not due yet: nothing is claimed.
    expect(await dispatchPendingEvents("inst", failing)).toBe(0);
    expect(store.row("a", "webhook").attempts).toBe(1);
    // Due: second attempt, longer wait.
    store.now = new Date(firstNext);
    await dispatchPendingEvents("inst", failing);
    const second = store.row("a", "webhook");
    expect(second.attempts).toBe(2);
    expect(
      new Date(second.next_attempt_at).getTime() - store.now.getTime(),
    ).toBe(backoffSeconds(2) * 1000);
  });

  it("backoff grows exponentially but is bounded", () => {
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(2)).toBe(60);
    expect(backoffSeconds(3)).toBe(120);
    expect(backoffSeconds(20)).toBe(3600);
    expect(backoffSeconds(1000)).toBe(3600);
    expect(backoffSeconds(0)).toBe(30);
  });

  it("dead-letters a delivery after the configured maximum attempts", async () => {
    store.add(ev("a"), ["webhook"]);
    const failing = deps({
      webhook: async () => {
        throw new Error("still down");
      },
    });
    for (let i = 0; i < DELIVERY_MAX_ATTEMPTS; i++) {
      await dispatchPendingEvents("inst", failing);
      store.now = new Date(store.now.getTime() + 2 * 3600_000);
    }
    const row = store.row("a", "webhook");
    expect(row.attempts).toBe(DELIVERY_MAX_ATTEMPTS);
    expect(row.status).toBe("dead");
    // Dead deliveries are never claimed again.
    expect(await dispatchPendingEvents("inst", failing)).toBe(0);
    expect(store.row("a", "webhook").attempts).toBe(DELIVERY_MAX_ATTEMPTS);
  });
});

describe("leases and concurrency", () => {
  it("two workers never claim the same delivery", async () => {
    store.add(ev("a"));
    const w1 = await store.claim({ limit: 10, worker: "w1", leaseSeconds: 60 });
    const w2 = await store.claim({ limit: 10, worker: "w2", leaseSeconds: 60 });
    expect(w1).toHaveLength(2);
    expect(w2).toHaveLength(0);
  });

  it("a live lease cannot be stolen; an expired lease can be reclaimed", async () => {
    store.add(ev("a"), ["webhook"]);
    await store.claim({ limit: 1, worker: "w1", leaseSeconds: 60 });
    expect(await dispatchPendingEvents("inst", deps({ worker: "w2" }))).toBe(0);
    expect(okWebhook).not.toHaveBeenCalled();
    // Worker w1 crashed; after the lease expires w2 picks it up.
    store.now = new Date(store.now.getTime() + 61_000);
    expect(await dispatchPendingEvents("inst", deps({ worker: "w2" }))).toBe(1);
    expect(store.row("a", "webhook").status).toBe("delivered");
    expect(store.row("a", "webhook").attempts).toBe(2);
  });

  it("a stale worker cannot settle a delivery another worker now holds", async () => {
    store.add(ev("a"), ["webhook"]);
    await store.claim({ limit: 1, worker: "w1", leaseSeconds: 1 });
    store.now = new Date(store.now.getTime() + 5_000);
    await store.claim({ limit: 1, worker: "w2", leaseSeconds: 60 });
    const settled = await store.settle({
      deliveryId: "a:webhook",
      worker: "w1",
      outcome: "delivered",
    });
    expect(settled).toBeNull();
    expect(store.row("a", "webhook").leased_by).toBe("w2");
  });
});

describe("webhook destination", () => {
  it("is recorded as skipped when PROCESS_EVENT_WEBHOOK_URL is not configured", async () => {
    store.add(ev("a"));
    const n = await dispatchPendingEvents(
      "inst",
      deps({ webhookUrl: null, webhook: undefined }),
    );
    expect(n).toBe(2);
    expect(store.row("a", "webhook").status).toBe("skipped");
    expect(store.row("a", "notification").status).toBe("delivered");
    expect(
      await dispatchPendingEvents("inst", deps({ webhookUrl: null })),
    ).toBe(0);
  });

  it.each([500, 429, 401])(
    "treats HTTP %s as a retryable failure, not a delivery",
    async (status) => {
      store.add(ev("a"), ["webhook"]);
      const fetchImpl = vi.fn(async () => new Response("nope", { status }));
      await dispatchPendingEvents(
        "inst",
        deps({ webhook: undefined, fetch: fetchImpl }),
      );
      const row = store.row("a", "webhook");
      expect(row.status).toBe("failed");
      expect(row.last_error).toContain(String(status));
      expect(row.delivered_at).toBeNull();
    },
  );

  it("treats a network error or timeout as retryable", async () => {
    store.add(ev("a"), ["webhook"]);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed: ECONNRESET");
    });
    await dispatchPendingEvents(
      "inst",
      deps({ webhook: undefined, fetch: fetchImpl }),
    );
    expect(store.row("a", "webhook").status).toBe("failed");
    expect(store.row("a", "webhook").last_error).toContain("ECONNRESET");
  });

  it("marks a 2xx response delivered and sends stable idempotency identifiers", async () => {
    store.add(ev("a"), ["webhook"]);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await dispatchPendingEvents(
      "inst",
      deps({
        webhook: undefined,
        fetch: fetchImpl,
        webhookSecret: "s3cret",
      }),
    );
    expect(store.row("a", "webhook").status).toBe("delivered");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://n8n.example.test/hook");
    const headers = new Headers(init.headers);
    expect(headers.get("idempotency-key")).toBe("a:webhook");
    expect(headers.get("x-process-event-id")).toBe("a");
    expect(headers.get("x-process-delivery-id")).toBe("a:webhook");
    expect(headers.get("x-process-secret")).toBe("s3cret");
    const body = JSON.parse(String(init.body));
    expect(body.id).toBe("a");
    expect(body.delivery_id).toBe("a:webhook");
    expect(body.attempt).toBe(1);
  });

  it("postWebhook checks response.ok itself", async () => {
    const delivery = { id: "d1", attempts: 3 };
    await expect(
      postWebhook(ev("a"), delivery, {
        url: "https://n8n.example.test/hook",
        fetchImpl: async () => new Response("", { status: 302 }),
      }),
    ).rejects.toThrow(/302/);
    await expect(
      postWebhook(ev("a"), delivery, {
        url: "https://n8n.example.test/hook",
        fetchImpl: async () => new Response("", { status: 200 }),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("error sanitisation", () => {
  it("strips secrets, query strings and bounds the length", () => {
    const long = "x".repeat(2000);
    const msg = sanitizeDeliveryError(
      new Error(
        `POST https://n8n.example.test/hook?token=abc123 failed: Authorization: Bearer eyJhbGciOi.secret ${long}`,
      ),
    );
    expect(msg.length).toBeLessThanOrEqual(500);
    expect(msg).not.toContain("abc123");
    expect(msg).not.toContain("eyJhbGciOi");
    expect(msg).toContain("https://n8n.example.test/hook");
    expect(sanitizeDeliveryError("plain string")).toBe("plain string");
    expect(sanitizeDeliveryError(null)).toBe("Unknown error");
  });

  it("never stores the event payload in last_error", async () => {
    store.add(ev("a"), ["notification"]);
    await dispatchPendingEvents(
      "inst",
      deps({
        notify: async () => {
          throw new Error("push down");
        },
      }),
    );
    expect(store.row("a", "notification").last_error).not.toContain("98765");
  });
});

describe("dispatchDueDeliveries (cron drain)", () => {
  it("retries due deliveries across every case and reports counts", async () => {
    store.add(ev("a", "one"), ["webhook"]);
    store.add(ev("b", "two"), ["webhook"]);
    store.row("a", "webhook").status = "failed";
    store.row("a", "webhook").attempts = 2;
    const result = await dispatchDueDeliveries(50, deps());
    expect(result).toEqual({ claimed: 2, delivered: 2, failed: 0, skipped: 0 });
    expect(store.row("a", "webhook").status).toBe("delivered");
    expect(store.row("b", "webhook").status).toBe("delivered");
  });
});

describe("the engine is never rolled back by delivery problems", () => {
  it("dispatchPendingEvents resolves (never throws) when the store cannot claim", async () => {
    const broken: DeliveryStore = {
      claim: async () => {
        throw new Error("db connection reset");
      },
      loadEvents: async () => [],
      settle: async () => null,
    };
    await expect(
      dispatchPendingEvents("inst", { store: broken, worker: "w1" }),
    ).resolves.toBe(0);
  });

  it("a settle failure after delivery is logged, not thrown, and the lease is left to expire", async () => {
    store.add(ev("a"), ["notification"]);
    const original = store.settle.bind(store);
    store.settle = async () => {
      throw new Error("settle failed: connection lost");
    };
    await expect(dispatchPendingEvents("inst", deps())).resolves.toBe(0);
    store.settle = original;
    // Lease still held (worker could not settle); it expires and is retried.
    expect(store.row("a", "notification").status).toBe("leased");
    store.now = new Date(store.now.getTime() + 121_000);
    expect(await dispatchPendingEvents("inst", deps())).toBe(1);
    expect(store.row("a", "notification").status).toBe("delivered");
  });
});
