/**
 * Role-based work queues (PRD §14). "Mine" is what is assigned to me;
 * "role" is unassigned work anyone with my process role may claim;
 * "handovers" are packages waiting for my decision; "overdue" is the subset
 * past its SLA.
 */
import type { AuthenticatedUser } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  ProcessHandoverRow,
  ProcessInstanceRow,
  ProcessStageInstanceRow,
  ProcessWorkQueue,
  ProcessWorkStageItem,
} from "@maiyuri/shared";
import { ProcessError } from "./errors";
import { processRolesFor } from "./permissions";
import { loadRoleDefaultsMap } from "./repository";

type Row = ProcessStageInstanceRow & {
  stage: ProcessWorkStageItem["stage"] | null;
  instance:
    | (Pick<
        ProcessInstanceRow,
        "id" | "entity_type" | "entity_id" | "status" | "context"
      > & {
        definition: ProcessWorkStageItem["definition"] | null;
      })
    | null;
};

const SELECT =
  "*, stage:process_stages(id, stage_key, name, stage_type, owner_role, sla_minutes), instance:process_instances!inner(id, entity_type, entity_id, status, context, definition:process_definitions(id, process_key, name, category))";

async function loadOpenStages(
  filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>,
): Promise<Row[]> {
  const { data, error } = await filter(base());
  if (error) throw new ProcessError("PROCESS_ERROR", error.message, 500);
  return (data ?? []) as unknown as Row[];
}

function base() {
  return supabaseAdmin
    .from("process_stage_instances")
    .select(SELECT)
    .in("status", ["current", "blocked"])
    .in("instance.status", ["active", "blocked"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);
}

export async function loadWorkQueue(
  user: AuthenticatedUser,
  now: Date = new Date(),
): Promise<ProcessWorkQueue> {
  const roles = processRolesFor(
    user.role,
    user.id,
    await loadRoleDefaultsMap(),
  );
  const [mine, roleRows] = await Promise.all([
    loadOpenStages((q) => q.eq("assigned_user_id", user.id)),
    roles.length
      ? loadOpenStages((q) =>
          q.is("assigned_user_id", null).in("assigned_role", roles),
        )
      : Promise.resolve([] as Row[]),
  ]);
  const all = [...mine, ...roleRows];
  const ids = all.map((r) => r.id);

  const [tasksRes, handoversRes] = await Promise.all([
    ids.length
      ? supabaseAdmin
          .from("process_tasks")
          .select("stage_instance_id, status, required")
          .in("stage_instance_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabaseAdmin
          .from("process_handovers")
          .select("*")
          .in("stage_instance_id", ids)
          .eq("status", "PENDING")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const openByStage = new Map<string, { open: number; required: number }>();
  for (const t of (tasksRes.data ?? []) as {
    stage_instance_id: string;
    status: string;
    required: boolean;
  }[]) {
    if (t.status !== "open") continue;
    const cur = openByStage.get(t.stage_instance_id) ?? {
      open: 0,
      required: 0,
    };
    cur.open += 1;
    if (t.required) cur.required += 1;
    openByStage.set(t.stage_instance_id, cur);
  }
  const handoverByStage = new Map<string, ProcessHandoverRow>();
  for (const h of (handoversRes.data ?? []) as ProcessHandoverRow[])
    handoverByStage.set(h.stage_instance_id, h);

  const toItem = (r: Row): ProcessWorkStageItem => {
    const { stage, instance, ...si } = r;
    const counts = openByStage.get(si.id) ?? { open: 0, required: 0 };
    return {
      stage_instance: si as ProcessStageInstanceRow,
      stage: stage ?? {
        id: si.process_stage_id,
        stage_key: "?",
        name: "Stage",
        stage_type: "ACTION",
        owner_role: si.assigned_role,
        sla_minutes: null,
      },
      instance: instance
        ? {
            id: instance.id,
            entity_type: instance.entity_type,
            entity_id: instance.entity_id,
            status: instance.status,
            context: instance.context,
          }
        : {
            id: si.process_instance_id,
            entity_type: "generic",
            entity_id: "",
            status: "active",
            context: {},
          },
      definition: instance?.definition ?? {
        id: "",
        process_key: "",
        name: "Process",
        category: "SALES",
      },
      open_task_count: counts.open,
      required_open_task_count: counts.required,
      is_overdue: !!si.due_at && new Date(si.due_at) < now,
      handover: handoverByStage.get(si.id) ?? null,
    };
  };

  const mineItems = mine.map(toItem);
  const roleItems = roleRows.map(toItem);
  const handovers = [...mineItems, ...roleItems].filter(
    (i) =>
      i.handover &&
      (i.handover.to_user_id === user.id ||
        (!i.handover.to_user_id && roles.includes(i.handover.to_role))),
  );
  const overdue = [...mineItems, ...roleItems].filter((i) => i.is_overdue);
  return {
    mine: mineItems,
    role: roleItems,
    handovers,
    overdue,
    summary: {
      mine: mineItems.length,
      role: roleItems.length,
      handovers: handovers.length,
      overdue: overdue.length,
    },
  };
}
