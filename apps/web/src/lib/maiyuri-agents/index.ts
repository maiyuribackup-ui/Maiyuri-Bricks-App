export type AgentCadence = "morning" | "night";
export type CfoPeriod = "day" | "month";
export type CogsConfidence = "clean" | "partial" | "dirty" | "unknown";

export interface SalesLeadInput {
  id: string;
  name: string;
  stage?: string | null;
  supabaseOwner?: string | null;
  todoistAssignee?: string | null;
  nextFollowupDate?: string | null;
  estimatedValue?: number | null;
  buyingSignal?: string | null;
}

export interface SalesAction {
  owner: string;
  leadId: string;
  leadName: string;
  action: string;
  deadline: string;
  reason: string;
  priorityScore: number;
}

export interface ProposedTask {
  title: string;
  owner: string;
  dueDate: string;
  sourceLeadId: string;
  requiresApproval: true;
}

export interface SalesBrief {
  summary: {
    totalLeads: number;
    overdueCount: number;
    dueTodayCount: number;
    unassignedCount: number;
    ownershipMismatchCount: number;
  };
  actions: SalesAction[];
  escalations: SalesAction[];
  proposedTasks: ProposedTask[];
}

export interface InvoiceProfitInput {
  invoiceName: string;
  customerName: string;
  postedRevenue: number;
  cogs: number | null;
  cogsConfidence: CogsConfidence;
  warning?: string | null;
}

export interface ProfitabilitySignal {
  invoiceName: string;
  customerName: string;
  postedRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  confidence: "clean";
}

export interface BlockedProfitItem {
  invoiceName: string;
  customerName: string;
  reason: string;
  cogsConfidence: Exclude<CogsConfidence, "clean">;
}

export interface MoneyAction {
  owner: string;
  target: string;
  action: string;
  deadline: string;
  impact: string;
  priorityScore: number;
}

export interface CfoBrief {
  period: CfoPeriod;
  financialTruth: {
    postedRevenue: number;
    collectionsReceived: number;
    openReceivables: number;
    overdueReceivables: number;
  };
  profitabilitySignals: ProfitabilitySignal[];
  blockedProfitItems: BlockedProfitItem[];
  moneyActions: MoneyAction[];
  dataHygiene: string[];
}

export interface OrchestratedAction {
  sourceAgent: "sales_followup" | "cfo_profit";
  owner: string;
  action: string;
  deadline: string;
  reason: string;
  priorityScore: number;
}

export interface ChiefOfStaffBrief {
  cadence: AgentCadence;
  ceoSignal: string;
  topActions: OrchestratedAction[];
  escalations: OrchestratedAction[];
  decisionsNeeded: Array<{ decision: string; recommendation: string }>;
  whatChanged: string[];
}

export interface AgentEventPayload {
  event_name: string;
  source: string;
  surface: string;
  environment: string;
  properties_json: string;
  trace_id?: string;
}

const HIGH_INTENT_STAGES = new Set(["hot", "warm", "qualified", "quote sent"]);

function normaliseOwner(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Unassigned";
}

function isOverdue(date: string | null | undefined, today: string): boolean {
  return Boolean(date && date < today);
}

function isDueToday(date: string | null | undefined, today: string): boolean {
  return date === today;
}

function hasOwnershipMismatch(lead: SalesLeadInput): boolean {
  const supabaseOwner = normaliseOwner(lead.supabaseOwner);
  const todoistAssignee = normaliseOwner(lead.todoistAssignee);
  return (
    supabaseOwner !== "Unassigned" &&
    todoistAssignee !== "Unassigned" &&
    supabaseOwner.toLowerCase() !== todoistAssignee.toLowerCase()
  );
}

function leadPriorityScore(lead: SalesLeadInput, today: string): number {
  const stage = lead.stage?.toLowerCase() ?? "";
  let score = 0;
  if (HIGH_INTENT_STAGES.has(stage)) score += 30;
  if (isOverdue(lead.nextFollowupDate, today)) score += 35;
  if (isDueToday(lead.nextFollowupDate, today)) score += 20;
  if (hasOwnershipMismatch(lead)) score += 25;
  if (normaliseOwner(lead.supabaseOwner) === "Unassigned") score += 25;
  score += Math.min(20, Math.floor((lead.estimatedValue ?? 0) / 10000));
  return score;
}

export function buildSalesFollowupBrief(input: {
  leads: SalesLeadInput[];
  today: string;
}): SalesBrief {
  const actionable = input.leads
    .map((lead) => {
      const owner = normaliseOwner(lead.supabaseOwner ?? lead.todoistAssignee);
      const deadline = lead.nextFollowupDate ?? input.today;
      const reasons: string[] = [];
      if (isOverdue(lead.nextFollowupDate, input.today)) reasons.push("overdue follow-up");
      if (isDueToday(lead.nextFollowupDate, input.today)) reasons.push("due today");
      if (normaliseOwner(lead.supabaseOwner) === "Unassigned") reasons.push("unassigned lead");
      if (hasOwnershipMismatch(lead)) reasons.push("ownership mismatch between Supabase and Todoist");
      if (lead.buyingSignal) reasons.push(lead.buyingSignal);

      return {
        owner,
        leadId: lead.id,
        leadName: lead.name,
        action: `Follow up with ${lead.name} and record next step`,
        deadline,
        reason: reasons.length ? reasons.join("; ") : "lead needs next action",
        priorityScore: leadPriorityScore(lead, input.today),
      } satisfies SalesAction;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.deadline.localeCompare(b.deadline));

  const actions = actionable.slice(0, 15);
  const escalations = actionable.filter((action) =>
    action.reason.includes("ownership mismatch") || action.reason.includes("unassigned"),
  );

  return {
    summary: {
      totalLeads: input.leads.length,
      overdueCount: input.leads.filter((lead) => isOverdue(lead.nextFollowupDate, input.today)).length,
      dueTodayCount: input.leads.filter((lead) => isDueToday(lead.nextFollowupDate, input.today)).length,
      unassignedCount: input.leads.filter((lead) => normaliseOwner(lead.supabaseOwner) === "Unassigned").length,
      ownershipMismatchCount: input.leads.filter(hasOwnershipMismatch).length,
    },
    actions,
    escalations,
    proposedTasks: actions.map((action) => ({
      title: action.action,
      owner: action.owner,
      dueDate: action.deadline,
      sourceLeadId: action.leadId,
      requiresApproval: true,
    })),
  };
}

function marginPct(grossProfit: number, revenue: number): number {
  if (!revenue) return 0;
  return Math.round((grossProfit / revenue) * 10000) / 100;
}

export function buildCfoManufacturingBrief(input: {
  period: CfoPeriod;
  postedRevenue: number;
  collectionsReceived: number;
  openReceivables: number;
  overdueReceivables: number;
  invoices: InvoiceProfitInput[];
}): CfoBrief {
  const profitabilitySignals: ProfitabilitySignal[] = [];
  const blockedProfitItems: BlockedProfitItem[] = [];

  for (const invoice of input.invoices) {
    if (invoice.cogsConfidence === "clean" && typeof invoice.cogs === "number") {
      const grossProfit = invoice.postedRevenue - invoice.cogs;
      profitabilitySignals.push({
        invoiceName: invoice.invoiceName,
        customerName: invoice.customerName,
        postedRevenue: invoice.postedRevenue,
        cogs: invoice.cogs,
        grossProfit,
        grossMarginPct: marginPct(grossProfit, invoice.postedRevenue),
        confidence: "clean",
      });
    } else {
      blockedProfitItems.push({
        invoiceName: invoice.invoiceName,
        customerName: invoice.customerName,
        reason: invoice.warning ?? "Invoice-wise profit blocked because COGS confidence is not clean",
        cogsConfidence: invoice.cogsConfidence === "clean" ? "unknown" : invoice.cogsConfidence,
      });
    }
  }

  const dataHygiene = blockedProfitItems.map(
    (item) => `${item.invoiceName}: ${item.reason}`,
  );
  if (input.invoices.length === 0) {
    dataHygiene.push("No invoice-wise COGS sample supplied; monthly profitability requires Odoo COGS gate data.");
  }

  const moneyActions: MoneyAction[] = [
    {
      owner: "Finance",
      target: "Overdue receivables",
      action: "Prioritise collection calls for overdue customers",
      deadline: "today",
      impact: `Recover ₹${input.overdueReceivables.toLocaleString("en-IN")} overdue receivables`,
      priorityScore: input.overdueReceivables > 0 ? 100 : 10,
    },
    {
      owner: "Finance",
      target: "COGS accuracy",
      action: "Review invoices blocked by missing or dirty COGS before trusting profit",
      deadline: "this week",
      impact: `${blockedProfitItems.length} invoice(s) blocked from profit reporting`,
      priorityScore: blockedProfitItems.length ? 90 : 20,
    },
    {
      owner: "Accounts + Factory",
      target: "BoM/product costing",
      action: "Reconcile product cost, BoM expected cost, and posted COGS for top SKUs",
      deadline: "this month",
      impact: "Improve product-wise and customer-wise profitability accuracy",
      priorityScore: 70,
    },
  ].sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    period: input.period,
    financialTruth: {
      postedRevenue: input.postedRevenue,
      collectionsReceived: input.collectionsReceived,
      openReceivables: input.openReceivables,
      overdueReceivables: input.overdueReceivables,
    },
    profitabilitySignals,
    blockedProfitItems,
    moneyActions: moneyActions.slice(0, 3),
    dataHygiene,
  };
}

export function buildChiefOfStaffBrief(input: {
  cadence: AgentCadence;
  salesBrief: SalesBrief;
  cfoBrief: CfoBrief;
}): ChiefOfStaffBrief {
  const cfoActions: OrchestratedAction[] = input.cfoBrief.moneyActions.map((action) => ({
    sourceAgent: "cfo_profit",
    owner: action.owner,
    action: action.action,
    deadline: action.deadline,
    reason: action.impact,
    priorityScore: action.priorityScore,
  }));
  const salesActions: OrchestratedAction[] = input.salesBrief.actions.map((action) => ({
    sourceAgent: "sales_followup",
    owner: action.owner,
    action: action.action,
    deadline: action.deadline,
    reason: action.reason,
    priorityScore: action.priorityScore,
  }));

  const topActions = [...cfoActions, ...salesActions]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3);

  const ceoSignal = input.cfoBrief.financialTruth.overdueReceivables > 0
    ? "cash control and follow-up discipline are the priority"
    : input.salesBrief.summary.overdueCount > 0
      ? "sales follow-up discipline is the priority"
      : "no urgent escalation; maintain operating rhythm";

  return {
    cadence: input.cadence,
    ceoSignal,
    topActions,
    escalations: topActions.filter((action) => action.priorityScore >= 90),
    decisionsNeeded: input.salesBrief.proposedTasks.length
      ? [
          {
            decision: "Approve proposed follow-up Todoist tasks?",
            recommendation: "Approve only the top urgent tasks after reviewing owner/action/deadline.",
          },
        ]
      : [],
    whatChanged: [
      `${input.salesBrief.summary.overdueCount} overdue sales follow-up(s).`,
      `${input.cfoBrief.blockedProfitItems.length} invoice profit item(s) blocked by COGS/data confidence.`,
    ],
  };
}

const FORBIDDEN_EVENT_PROPERTY_KEYS = new Set([
  "reportMarkdown",
  "fullReport",
  "transcript",
  "rawTranscript",
  "secret",
  "token",
  "password",
]);

export function createAgentEventPayload(input: {
  eventName: string;
  source: string;
  surface: string;
  environment: string;
  traceId?: string;
  properties: Record<string, unknown>;
}): AgentEventPayload {
  const safeProperties = Object.fromEntries(
    Object.entries(input.properties).filter(([key]) => !FORBIDDEN_EVENT_PROPERTY_KEYS.has(key)),
  );
  return {
    event_name: input.eventName,
    source: input.source,
    surface: input.surface,
    environment: input.environment,
    properties_json: JSON.stringify(safeProperties),
    ...(input.traceId ? { trace_id: input.traceId } : {}),
  };
}

export async function logAgentEventToClickHouse(
  input: Parameters<typeof createAgentEventPayload>[0],
  options: {
    endpoint?: string;
    username?: string;
    password?: string;
    fetchFn?: typeof fetch;
  } = {},
): Promise<{ ok: boolean; status: number; error?: string }> {
  const endpoint = options.endpoint ?? process.env.MAIYURI_CLICKHOUSE_HTTP_URL ?? "http://127.0.0.1:8125";
  const username = options.username ?? process.env.MAIYURI_CLICKHOUSE_USER;
  const password = options.password ?? process.env.MAIYURI_CLICKHOUSE_PASSWORD;
  const fetchFn = options.fetchFn ?? fetch;
  const payload = createAgentEventPayload(input);
  const query = "INSERT INTO maiyuri_events.events (event_name, source, surface, environment, trace_id, properties_json) FORMAT JSONEachRow";
  const body = `${JSON.stringify({
    event_name: payload.event_name,
    source: payload.source,
    surface: payload.surface,
    environment: payload.environment,
    trace_id: payload.trace_id ?? null,
    properties_json: payload.properties_json,
  })}\n`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (username && password) {
    headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  try {
    const response = await fetchFn(`${endpoint}/?query=${encodeURIComponent(query)}`, {
      method: "POST",
      headers,
      body,
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: await response.text() };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
