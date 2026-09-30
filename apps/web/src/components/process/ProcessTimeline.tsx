"use client";

/**
 * Audit timeline (PRD §28): "HH:MM · event · actor · reason", grouped by day.
 */
import type { ProcessHistoryEvent } from "@/hooks/useProcess";

export interface ProcessTimelineProps {
  events: ProcessHistoryEvent[];
  isLoading?: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  "process.started": "Process started",
  "process.stage_started": "Stage started",
  "process.task_completed": "Task completed",
  "process.evidence_added": "Evidence added",
  "process.gate_failed": "Gate failed",
  "process.gate_overridden": "Gate overridden",
  "process.stage_completed": "Stage completed",
  "process.blocked": "Exception raised",
  "process.unblocked": "Exception cleared",
  "process.handover_requested": "Handover sent",
  "process.handover_accepted": "Handover accepted",
  "process.handover_rejected": "Handover returned",
  "process.sla_warning": "SLA warning",
  "process.sla_breached": "SLA breached",
  "process.completed": "Process completed",
  "process.cancelled": "Process cancelled",
  "process.version_published": "Version published",
  "process.version_retired": "Version retired",
};

const ALERT_EVENTS = new Set([
  "process.gate_failed",
  "process.blocked",
  "process.handover_rejected",
  "process.sla_breached",
  "process.cancelled",
]);

export function eventLabel(type: string): string {
  return (
    EVENT_LABELS[type] ?? type.replace(/^process\./, "").replace(/_/g, " ")
  );
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** A short human detail from the event payload (stage / task / outcome). */
function eventDetail(event: ProcessHistoryEvent): string | null {
  const payload = event.payload ?? {};
  const candidates = [
    payload.stage_name,
    payload.task_title,
    payload.title,
    payload.outcome,
    payload.gate_key,
    payload.transition_key,
  ];
  const first = candidates.find((v) => typeof v === "string" && v.length > 0);
  return typeof first === "string" ? first : null;
}

export function groupEventsByDay(events: ProcessHistoryEvent[]) {
  const groups = new Map<string, ProcessHistoryEvent[]>();
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  for (const event of sorted) {
    const key = dayKey(event.created_at);
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

export function ProcessTimeline({
  events,
  isLoading = false,
}: ProcessTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-5 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500">
        Nothing has happened on this case yet.
      </p>
    );
  }
  const groups = groupEventsByDay(events);
  return (
    <div className="space-y-5">
      {groups.map(([day, list]) => (
        <section key={day} aria-label={day}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {day}
          </h3>
          <ol className="space-y-2 border-l border-slate-200 pl-4 dark:border-slate-700">
            {list.map((event) => {
              const alert = ALERT_EVENTS.has(event.event_type);
              const detail = eventDetail(event);
              return (
                <li key={event.id} className="relative text-sm">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
                      alert ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                  <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                    {timeOf(event.created_at)}
                  </span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span
                    className={`font-medium ${
                      alert
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-slate-900 dark:text-white"
                    }`}
                  >
                    {eventLabel(event.event_type)}
                  </span>
                  {detail && (
                    <span className="text-slate-600 dark:text-slate-300">
                      {" "}
                      — {detail}
                    </span>
                  )}
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {event.actor_name ??
                      (event.actor_type === "user"
                        ? "Unknown user"
                        : event.actor_type)}
                  </span>
                  {event.reason && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {event.reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
