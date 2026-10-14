/**
 * Event delivery (PRD §32, §33). The plpgsql functions INSERT process_events
 * inside their transaction and a trigger enqueues one delivery row per
 * destination alongside them (migration 20260914100000). This module is the
 * worker: it claims due deliveries with an atomic lease, calls the outside
 * world with NO database transaction open, then settles each row as
 * delivered, failed (retry with bounded backoff), skipped or dead.
 *
 * Guarantees:
 * - Committing process state never waits on push / Telegram / n8n.
 * - Notification and webhook delivery are tracked independently.
 * - A crash mid-delivery leaves the row reclaimable after its lease expires.
 * - A destination is marked delivered only after real success (2xx for the
 *   webhook), and never delivered twice.
 * - Failures are recorded (sanitised, bounded) and retried by the next call
 *   for the case or by the hourly cron drain, up to DELIVERY_MAX_ATTEMPTS.
 */
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ProcessEventDeliveryRow, ProcessEventRow } from "@maiyuri/shared";
import { notifyForEvent } from "./notify";

export const DELIVERY_MAX_ATTEMPTS = 8;
const LEASE_SECONDS = 120;
const CLAIM_LIMIT_PER_CASE = 100;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_MAX_SECONDS = 3600;
const WEBHOOK_TIMEOUT_MS = 5_000;
const MAX_ERROR_LENGTH = 500;

/** 30s, 60s, 120s … capped at one hour. */
export function backoffSeconds(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const exp = Math.min(30, n - 1); // avoid overflow before the cap applies
  return Math.min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * 2 ** exp);
}

/**
 * Error text safe to persist: no bearer tokens / secrets, no URL query
 * strings (they carry tokens), collapsed whitespace, bounded length. Never
 * includes the event payload.
 */
export function sanitizeDeliveryError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err == null
          ? ""
          : String(err);
  const text = raw
    .replace(/\?[^\s'"]*/g, "") // query strings
    .replace(/bearer\s+[^\s'"]+/gi, "Bearer [redacted]")
    .replace(
      /(token|secret|key|password|authorization)(["']?\s*[:=]\s*)[^\s'",;]+/gi,
      "$1$2[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim();
  return (text || "Unknown error").slice(0, MAX_ERROR_LENGTH);
}

// ------------------------------------------------------------------ store

/** The three database operations the worker needs; injectable for tests. */
export interface DeliveryStore {
  claim(args: {
    instanceId?: string | null;
    limit: number;
    worker: string;
    leaseSeconds: number;
  }): Promise<ProcessEventDeliveryRow[]>;
  loadEvents(eventIds: string[]): Promise<ProcessEventRow[]>;
  settle(args: {
    deliveryId: string;
    worker: string;
    outcome: "delivered" | "failed" | "skipped";
    error?: string | null;
    retryAfterSeconds?: number | null;
  }): Promise<ProcessEventDeliveryRow | null>;
}

const supabaseStore: DeliveryStore = {
  async claim({ instanceId, limit, worker, leaseSeconds }) {
    const { data, error } = await supabaseAdmin.rpc(
      "process_claim_deliveries",
      {
        p_worker: worker,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
        p_instance_id: instanceId ?? null,
      },
    );
    if (error) throw new Error(`claim failed: ${error.message}`);
    return (data ?? []) as ProcessEventDeliveryRow[];
  },
  async loadEvents(eventIds) {
    if (eventIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("process_events")
      .select("*")
      .in("id", eventIds);
    if (error) throw new Error(`load events failed: ${error.message}`);
    return (data ?? []) as ProcessEventRow[];
  },
  async settle({ deliveryId, worker, outcome, error, retryAfterSeconds }) {
    const { data, error: rpcError } = await supabaseAdmin.rpc(
      "process_settle_delivery",
      {
        p_delivery_id: deliveryId,
        p_worker: worker,
        p_outcome: outcome,
        p_error: error ?? null,
        p_retry_after_seconds: retryAfterSeconds ?? null,
      },
    );
    if (rpcError) throw new Error(`settle failed: ${rpcError.message}`);
    return (data as ProcessEventDeliveryRow | null) ?? null;
  },
};

// ------------------------------------------------------------------ webhook

export interface WebhookOptions {
  url: string;
  secret?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * POST one event to the outbound webhook (n8n). Throws on any failure —
 * network, timeout, or a non-2xx status — so the caller records it and
 * retries. Stable identifiers travel in headers and body so the receiver can
 * deduplicate retries.
 */
export async function postWebhook(
  event: ProcessEventRow,
  delivery: Pick<ProcessEventDeliveryRow, "id" | "attempts">,
  opts: WebhookOptions,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? WEBHOOK_TIMEOUT_MS,
  );
  try {
    const res = await (opts.fetchImpl ?? fetch)(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": delivery.id,
        "x-process-event-id": event.id,
        "x-process-delivery-id": delivery.id,
        ...(opts.secret ? { "x-process-secret": opts.secret } : {}),
      },
      body: JSON.stringify({
        id: event.id,
        delivery_id: delivery.id,
        attempt: delivery.attempts,
        type: event.event_type,
        process_instance_id: event.process_instance_id,
        stage_instance_id: event.stage_instance_id,
        actor_id: event.actor_id,
        payload: event.payload,
        reason: event.reason,
        created_at: event.created_at,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`webhook responded HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ worker

export interface DispatchDeps {
  /** Direct application notifications (push / Telegram). */
  notify?: (event: ProcessEventRow) => Promise<void>;
  /** Outbound webhook; throw to signal failure. Default posts to the env URL. */
  webhook?: (
    event: ProcessEventRow,
    delivery: ProcessEventDeliveryRow,
  ) => Promise<void>;
  store?: DeliveryStore;
  worker?: string;
  /** `undefined` = read PROCESS_EVENT_WEBHOOK_URL; `null`/"" = not configured. */
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  fetch?: typeof fetch;
}

export interface DispatchResult {
  claimed: number;
  delivered: number;
  failed: number;
  skipped: number;
}

/** Structured, PII-free log line (ids and counts only, never payloads). */
function log(level: "info" | "warn", fields: Record<string, unknown>) {
  console.warn(JSON.stringify({ scope: "process.delivery", level, ...fields }));
}

async function processClaimed(
  claimed: ProcessEventDeliveryRow[],
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const store = deps.store ?? supabaseStore;
  const worker = deps.worker ?? `web-${randomUUID().slice(0, 8)}`;
  const result: DispatchResult = {
    claimed: claimed.length,
    delivered: 0,
    failed: 0,
    skipped: 0,
  };
  if (claimed.length === 0) return result;

  const webhookUrl =
    deps.webhookUrl === undefined
      ? (process.env.PROCESS_EVENT_WEBHOOK_URL ?? "")
      : (deps.webhookUrl ?? "");
  const webhookSecret =
    deps.webhookSecret === undefined
      ? (process.env.PROCESS_EVENT_WEBHOOK_SECRET ?? null)
      : deps.webhookSecret;

  const events = new Map(
    (await store.loadEvents([...new Set(claimed.map((d) => d.event_id))])).map(
      (e) => [e.id, e],
    ),
  );

  for (const delivery of claimed) {
    const event = events.get(delivery.event_id);
    const base = {
      delivery_id: delivery.id,
      event_id: delivery.event_id,
      destination: delivery.destination,
      attempt: delivery.attempts,
    };
    try {
      if (!event) throw new Error("event row not found");
      if (delivery.destination === "webhook" && !deps.webhook && !webhookUrl) {
        await store.settle({
          deliveryId: delivery.id,
          worker,
          outcome: "skipped",
        });
        result.skipped += 1;
        continue;
      }
      if (delivery.destination === "notification") {
        await (deps.notify ?? notifyForEvent)(event);
      } else if (deps.webhook) {
        await deps.webhook(event, delivery);
      } else {
        await postWebhook(event, delivery, {
          url: webhookUrl,
          secret: webhookSecret,
          fetchImpl: deps.fetch,
        });
      }
      const settled = await store.settle({
        deliveryId: delivery.id,
        worker,
        outcome: "delivered",
      });
      if (settled) result.delivered += 1;
      else log("warn", { ...base, outcome: "lease_lost_after_success" });
    } catch (err) {
      const message = sanitizeDeliveryError(err);
      try {
        const settled = await store.settle({
          deliveryId: delivery.id,
          worker,
          outcome: "failed",
          error: message,
          retryAfterSeconds: backoffSeconds(delivery.attempts),
        });
        result.failed += 1;
        log("warn", {
          ...base,
          outcome: settled?.status ?? "lease_lost",
          error: message,
        });
      } catch (settleErr) {
        // The lease will expire and the row will be reclaimed; nothing is lost.
        log("warn", {
          ...base,
          outcome: "settle_failed",
          error: sanitizeDeliveryError(settleErr),
        });
      }
    }
  }
  return result;
}

/**
 * Deliver every due delivery of one case (called right after each process
 * mutation). Returns the number of deliveries settled as delivered or
 * skipped; failures stay queued for retry.
 */
export async function dispatchPendingEvents(
  instanceId: string,
  deps: DispatchDeps = {},
): Promise<number> {
  const store = deps.store ?? supabaseStore;
  const worker = deps.worker ?? `web-${randomUUID().slice(0, 8)}`;
  let claimed: ProcessEventDeliveryRow[];
  try {
    claimed = await store.claim({
      instanceId,
      limit: CLAIM_LIMIT_PER_CASE,
      worker,
      leaseSeconds: LEASE_SECONDS,
    });
  } catch (err) {
    log("warn", {
      instance_id: instanceId,
      outcome: "claim_failed",
      error: sanitizeDeliveryError(err),
    });
    return 0;
  }
  const r = await processClaimed(claimed, { ...deps, worker });
  return r.delivered + r.skipped;
}

/**
 * Cron drain: retry due deliveries across every case (failed ones whose
 * backoff has elapsed, and leases left behind by crashed workers).
 */
export async function dispatchDueDeliveries(
  limit = 200,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const store = deps.store ?? supabaseStore;
  const worker = deps.worker ?? `cron-${randomUUID().slice(0, 8)}`;
  const claimed = await store.claim({
    instanceId: null,
    limit,
    worker,
    leaseSeconds: LEASE_SECONDS,
  });
  const r = await processClaimed(claimed, { ...deps, worker });
  if (r.claimed > 0) log("info", { outcome: "drain", ...r });
  return r;
}
