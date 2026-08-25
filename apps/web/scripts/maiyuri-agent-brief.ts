#!/usr/bin/env -S npx tsx
import { createClient } from "@supabase/supabase-js";
import {
  buildChiefOfStaffBrief,
  buildSalesFollowupBrief,
  logAgentEventToClickHouse,
  type CfoBrief,
} from "../src/lib/maiyuri-agents/index";
import {
  buildCfoBriefFromSnapshot,
  mapLeadRowsToSalesInputs,
  mapTodoistTasksToSalesInputs,
  renderChiefOfStaffBriefMarkdown,
  renderCfoBriefMarkdown,
  renderSalesBriefMarkdown,
  type CfoProfitabilitySnapshot,
  type SupabaseLeadRow,
  type TodoistTaskSnapshot,
} from "../src/lib/maiyuri-agents/collectors";

interface SupabaseTaskRow {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  due_date?: string | null;
  lead_id?: string | null;
  assignee?: { full_name?: string | null; name?: string | null; email?: string | null } | null;
  lead?: { id?: string | null; name?: string | null } | null;
}

interface TodoistProjectApiRow {
  id: string;
  name: string;
}

interface TodoistTaskApiRow {
  id: string;
  content: string;
  description?: string;
  project_id: string;
  responsible_uid?: string | number | null;
  due?: { date?: string | null } | null;
}

interface TodoistCollaboratorApiRow {
  id?: string | number;
  user_id?: string | number;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function readJsonEnv<T>(name: string, fallback: T): T {
  const raw = process.env[name];
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

async function fetchTodoistPage<T>(path: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL(`https://api.todoist.com/api/v1/${path}`);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      headers: { authorization: ["Bearer", token].join(" ") },
    });
    if (!response.ok) throw new Error(`Todoist ${path} read failed: ${response.status}`);
    const body = (await response.json()) as { results?: T[]; next_cursor?: string | null } | T[];
    if (Array.isArray(body)) {
      items.push(...body);
      cursor = null;
    } else {
      items.push(...(body.results ?? []));
      cursor = body.next_cursor ?? null;
    }
  } while (cursor);
  return items;
}

async function fetchTodoistSnapshots(): Promise<TodoistTaskSnapshot[]> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return [];

  const projects = await fetchTodoistPage<TodoistProjectApiRow>("projects", token);
  const maiyuriProjects = projects.filter((project) => project.name.toLowerCase().includes("maiyuri"));
  if (!maiyuriProjects.length) return [];

  const projectById = new Map(projects.map((project) => [String(project.id), project]));
  const collaboratorNames = new Map<string, string>();

  await Promise.all(
    maiyuriProjects.map(async (project) => {
      try {
        const collaborators = await fetchTodoistPage<TodoistCollaboratorApiRow>(
          `projects/${project.id}/collaborators`,
          token,
        );
        for (const collaborator of collaborators) {
          const id = String(collaborator.id ?? collaborator.user_id ?? "");
          const name = collaborator.full_name ?? collaborator.name ?? collaborator.email ?? null;
          if (id && name) collaboratorNames.set(id, name);
        }
      } catch {
        // Collaborator access can vary by Todoist project. Keep task reads usable.
      }
    }),
  );

  const tasks = await fetchTodoistPage<TodoistTaskApiRow>("tasks", token);
  const maiyuriProjectIds = new Set(maiyuriProjects.map((project) => String(project.id)));
  return tasks
    .filter((task) => maiyuriProjectIds.has(String(task.project_id)))
    .map((task) => ({
      id: String(task.id),
      content: [task.content, task.description].filter(Boolean).join(" "),
      assigneeName: task.responsible_uid ? collaboratorNames.get(String(task.responsible_uid)) ?? null : null,
      dueDate: task.due?.date ?? null,
      projectName: projectById.get(String(task.project_id))?.name ?? "Maiyuri Todoist",
    }));
}

async function fetchSupabaseData(): Promise<{
  leads: SupabaseLeadRow[];
  todoistTasks: TodoistTaskSnapshot[];
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [liveTodoistTasks, explicitTodoistTasks] = await Promise.all([
    fetchTodoistSnapshots(),
    Promise.resolve(readJsonEnv<TodoistTaskSnapshot[]>("MAIYURI_TODOIST_TASKS_JSON", [])),
  ]);

  if (!url || !key) {
    return { leads: [], todoistTasks: [...liveTodoistTasks, ...explicitTodoistTasks] };
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });

  const [{ data: leads, error: leadsError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase
      .from("leads")
      .select("id,name,lead_temperature,pipeline_stage,lead_status,assigned_staff,follow_up_date,budget,notes,requirement_type,site_location,updated_at,created_at")
      .eq("is_archived", false)
      .order("follow_up_date", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("tasks")
      .select("id,title,description,status,due_date,lead_id,assignee:users!tasks_assigned_to_fkey(full_name,name,email),lead:leads!tasks_lead_id_fkey(id,name)")
      .neq("status", "completed")
      .limit(200),
  ]);

  if (leadsError) throw new Error(`Supabase leads read failed: ${leadsError.message}`);
  if (tasksError) throw new Error(`Supabase tasks read failed: ${tasksError.message}`);

  const taskSnapshots: TodoistTaskSnapshot[] = ((tasks as SupabaseTaskRow[] | null) ?? []).map((task) => ({
    id: task.id,
    content: [task.title, task.description, task.lead_id ? `lead_id:${task.lead_id}` : null, task.lead?.name]
      .filter(Boolean)
      .join(" "),
    assigneeName: task.assignee?.full_name ?? task.assignee?.name ?? task.assignee?.email ?? null,
    dueDate: task.due_date ?? null,
    projectName: "Supabase tasks",
  }));

  return {
    leads: (leads as SupabaseLeadRow[] | null) ?? [],
    todoistTasks: [...taskSnapshots, ...liveTodoistTasks, ...explicitTodoistTasks],
  };
}

function fallbackCfoBrief(): CfoBrief {
  const snapshot = readJsonEnv<CfoProfitabilitySnapshot | null>("MAIYURI_CFO_SNAPSHOT_JSON", null);
  if (snapshot) return buildCfoBriefFromSnapshot(snapshot);
  return buildCfoBriefFromSnapshot({
    grain: "month",
    postedRevenue: 0,
    collectionsReceived: 0,
    openReceivables: 0,
    overdueReceivables: 0,
    invoiceProfits: [],
  });
}

async function logSummaryEvents(input: {
  salesActions: number;
  overdueCount: number;
  ownershipMismatchCount: number;
  blockedProfitItems: number;
  topActionsCount: number;
  cadence: string;
}) {
  const base = {
    surface: "manual-brief",
    environment: process.env.NODE_ENV ?? "local",
  };
  await Promise.all([
    logAgentEventToClickHouse({
      ...base,
      eventName: "agent.sales_followup.brief_generated",
      source: "agent.sales_followup",
      properties: {
        actionsCount: input.salesActions,
        overdueCount: input.overdueCount,
        ownershipMismatchCount: input.ownershipMismatchCount,
      },
    }),
    logAgentEventToClickHouse({
      ...base,
      eventName: "agent.cfo_profit.brief_generated",
      source: "agent.cfo_profit",
      properties: { blockedProfitItems: input.blockedProfitItems },
    }),
    logAgentEventToClickHouse({
      ...base,
      eventName: "agent.chief_of_staff.brief_generated",
      source: "agent.chief_of_staff",
      properties: { topActionsCount: input.topActionsCount, cadence: input.cadence },
    }),
  ]);
}

async function main() {
  const cadence = (process.argv.includes("--night") ? "night" : "morning") as "morning" | "night";
  const { leads, todoistTasks } = await fetchSupabaseData();
  const salesInputs = leads.length
    ? mapLeadRowsToSalesInputs({ leads, todoistTasks })
    : mapTodoistTasksToSalesInputs(todoistTasks);
  const salesBrief = buildSalesFollowupBrief({ leads: salesInputs, today: todayISO() });
  const cfoBrief = fallbackCfoBrief();
  const chiefBrief = buildChiefOfStaffBrief({ cadence, salesBrief, cfoBrief });

  await logSummaryEvents({
    salesActions: salesBrief.actions.length,
    overdueCount: salesBrief.summary.overdueCount,
    ownershipMismatchCount: salesBrief.summary.ownershipMismatchCount,
    blockedProfitItems: cfoBrief.blockedProfitItems.length,
    topActionsCount: chiefBrief.topActions.length,
    cadence,
  });

  const markdown = [
    renderChiefOfStaffBriefMarkdown(chiefBrief),
    "\n---\n",
    renderSalesBriefMarkdown(salesBrief),
    "\n---\n",
    renderCfoBriefMarkdown(cfoBrief),
  ].join("\n");
  console.log(markdown);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
