/**
 * Event dispatch (PRD §32). The plpgsql functions INSERT process_events
 * inside their transaction; this module reads the ones not yet dispatched,
 * fans them out to notification handlers and the optional outbound webhook
 * (n8n), then marks them. Consumers never read engine internals — only the
 * event stream — so notifications, analytics and AI stay decoupled.
 *
 * Idempotency: `payload.dispatched_at` on the event row. A retry after a
 * crash re-sends only what was never marked (PRD §33 "no duplicates").
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ProcessEventRow } from "@maiyuri/shared";
import { notifyForEvent } from "./notify";

const WEBHOOK_TIMEOUT_MS = 5_000;

async function postWebhook(event: ProcessEventRow): Promise<void> {
  const url = process.env.PROCESS_EVENT_WEBHOOK_URL;
  if (!url) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PROCESS_EVENT_WEBHOOK_SECRET
          ? { "x-process-secret": process.env.PROCESS_EVENT_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        id: event.id,
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
  } catch (err) {
    console.error("[ProcessOS] webhook failed (ignored):", err);
  } finally {
    clearTimeout(timer);
  }
}

export interface DispatchDeps {
  notify?: typeof notifyForEvent;
  webhook?: typeof postWebhook;
}

/** Dispatch every undispatched event of a case, oldest first. */
export async function dispatchPendingEvents(
  instanceId: string,
  deps: DispatchDeps = {},
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("process_events")
    .select("*")
    .eq("process_instance_id", instanceId)
    .is("payload->>dispatched_at", null)
    .order("created_at")
    .limit(100);
  if (error) {
    console.error("[ProcessOS] could not read pending events:", error.message);
    return 0;
  }
  const events = (data ?? []) as ProcessEventRow[];
  let done = 0;
  for (const ev of events) {
    // Mark first so a slow push can never double-send on a concurrent call.
    const { data: marked } = await supabaseAdmin
      .from("process_events")
      .update({
        payload: { ...ev.payload, dispatched_at: new Date().toISOString() },
      })
      .eq("id", ev.id)
      .is("payload->>dispatched_at", null)
      .select("id");
    if (!marked || marked.length === 0) continue;
    try {
      await (deps.notify ?? notifyForEvent)(ev);
    } catch (err) {
      console.error("[ProcessOS] notify failed (ignored):", ev.event_type, err);
    }
    await (deps.webhook ?? postWebhook)(ev);
    done += 1;
  }
  return done;
}
