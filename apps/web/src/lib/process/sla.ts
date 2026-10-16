/**
 * SLA sweep (PRD §9 "SLA", §15). The database function marks warnings and
 * breaches idempotently and writes the events; this dispatches them.
 */
import { dispatchPendingEvents } from "./events";
import * as repo from "./repository";

export interface SlaSweepRow {
  stage_instance_id: string;
  process_instance_id: string;
  assigned_user_id: string | null;
  assigned_role: string;
  kind: "warning" | "breached";
  stage_name: string;
  due_at: string;
}

export async function runSlaSweep(
  now: Date = new Date(),
): Promise<{
  warnings: number;
  breaches: number;
  dispatched: number;
  rows: SlaSweepRow[];
}> {
  const rows =
    (await repo.rpc<SlaSweepRow[]>("process_sla_sweep", {
      p_now: now.toISOString(),
    })) ?? [];
  const instances = [...new Set(rows.map((r) => r.process_instance_id))];
  let dispatched = 0;
  for (const id of instances) dispatched += await dispatchPendingEvents(id);
  return {
    warnings: rows.filter((r) => r.kind === "warning").length,
    breaches: rows.filter((r) => r.kind === "breached").length,
    dispatched,
    rows,
  };
}
