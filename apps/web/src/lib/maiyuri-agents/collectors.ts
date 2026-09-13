import type {
  AgentCadence,
  CfoBrief,
  CfoPeriod,
  InvoiceProfitInput,
  SalesBrief,
  SalesLeadInput,
  ChiefOfStaffBrief,
} from "./index";
import { buildCfoManufacturingBrief } from "./index";

export interface SupabaseLeadRow {
  id: string;
  name: string | null;
  lead_temperature?: string | null;
  pipeline_stage?: string | null;
  lead_status?: string | null;
  assigned_staff?: string | null;
  follow_up_date?: string | null;
  budget?: number | string | null;
  notes?: string | null;
  requirement_type?: string | null;
  site_location?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface TodoistTaskSnapshot {
  id: string;
  content: string;
  assigneeName?: string | null;
  dueDate?: string | null;
  projectName?: string | null;
}

export interface CfoProfitabilitySnapshot {
  grain: CfoPeriod;
  postedRevenue: number;
  collectionsReceived: number;
  openReceivables: number;
  overdueReceivables: number;
  invoiceProfits: InvoiceProfitInput[];
}

function parseAmount(value: SupabaseLeadRow["budget"]): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function findTodoistTaskForLead(
  lead: SupabaseLeadRow,
  todoistTasks: TodoistTaskSnapshot[],
): TodoistTaskSnapshot | undefined {
  const leadIdNeedle = `lead_id:${lead.id}`.toLowerCase();
  const leadName = lead.name?.toLowerCase().trim();
  return todoistTasks.find((task) => {
    const content = task.content.toLowerCase();
    return content.includes(leadIdNeedle) || Boolean(leadName && content.includes(leadName));
  });
}

export function mapLeadRowsToSalesInputs(input: {
  leads: SupabaseLeadRow[];
  todoistTasks: TodoistTaskSnapshot[];
}): SalesLeadInput[] {
  return input.leads.map((lead) => {
    const matchedTask = findTodoistTaskForLead(lead, input.todoistTasks);
    const signalParts = [lead.notes, lead.requirement_type, lead.site_location].filter(Boolean);

    return {
      id: lead.id,
      name: lead.name ?? "Unnamed lead",
      stage: lead.lead_temperature ?? lead.pipeline_stage ?? lead.lead_status ?? null,
      supabaseOwner: lead.assigned_staff ?? null,
      todoistAssignee: matchedTask?.assigneeName ?? null,
      nextFollowupDate: lead.follow_up_date ?? matchedTask?.dueDate ?? null,
      estimatedValue: parseAmount(lead.budget),
      buyingSignal: signalParts.join(" · ") || null,
    };
  });
}

const TODOIST_SALES_KEYWORDS = /\b(lead|follow\s*up|site visit|call)\b/i;
const TODOIST_SALES_QUOTE_KEYWORDS = /\b(quote|quotation)\b/i;
const TODOIST_NON_SALES_KEYWORDS = /\b(commitment|discipline|charity|fund|oil filter|machine|conveyor|supplier|purchase|procurement)\b/i;

function isTodoistSalesFollowupTask(task: TodoistTaskSnapshot): boolean {
  const projectName = task.projectName ?? "";
  const content = task.content;
  if (!projectName.toLowerCase().includes("maiyuri")) return false;
  if (TODOIST_NON_SALES_KEYWORDS.test(content)) return false;
  if (TODOIST_SALES_KEYWORDS.test(content)) return true;
  if (/\bcustomer\b/i.test(content) && /\b(contact|call|visit|follow)\b/i.test(content)) return true;
  return TODOIST_SALES_QUOTE_KEYWORDS.test(content) && /\b(customer|client|lead|site|follow)\b/i.test(content);
}

export function mapTodoistTasksToSalesInputs(tasks: TodoistTaskSnapshot[]): SalesLeadInput[] {
  return tasks
    .filter(isTodoistSalesFollowupTask)
    .map((task) => ({
      id: `todoist:${task.id}`,
      name: task.content,
      stage: "follow_up",
      supabaseOwner: null,
      todoistAssignee: task.assigneeName ?? null,
      nextFollowupDate: task.dueDate ?? null,
      estimatedValue: null,
      buyingSignal: `Todoist task from ${task.projectName ?? "Maiyuri project"}`,
    }));
}

export function buildCfoBriefFromSnapshot(snapshot: CfoProfitabilitySnapshot): CfoBrief {
  return buildCfoManufacturingBrief({
    period: snapshot.grain,
    postedRevenue: snapshot.postedRevenue,
    collectionsReceived: snapshot.collectionsReceived,
    openReceivables: snapshot.openReceivables,
    overdueReceivables: snapshot.overdueReceivables,
    invoices: snapshot.invoiceProfits,
  });
}

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function renderSalesBriefMarkdown(brief: SalesBrief): string {
  const lines = [
    "## Sales Follow-up Brief",
    "",
    `Overdue: **${brief.summary.overdueCount}** · Due today: **${brief.summary.dueTodayCount}** · Unassigned: **${brief.summary.unassignedCount}** · Ownership mismatch: **${brief.summary.ownershipMismatchCount}**`,
    "",
    "### Top actions",
  ];

  for (const action of brief.actions.slice(0, 15)) {
    lines.push(
      `- **${action.owner}** → ${action.leadName}: ${action.action} by **${action.deadline}** _(${action.reason})_`,
    );
  }

  if (brief.escalations.length) {
    lines.push("", "### Escalations");
    for (const escalation of brief.escalations.slice(0, 5)) {
      lines.push(`- ${escalation.leadName}: ${escalation.reason}`);
    }
  }

  lines.push("", "_Task creation requires Ram approval._");
  return lines.join("\n");
}

export function renderCfoBriefMarkdown(brief: CfoBrief): string {
  const lines = [
    "## Manufacturing CFO Brief",
    "",
    `Posted revenue: **${inr(brief.financialTruth.postedRevenue)}**`,
    `Collections: **${inr(brief.financialTruth.collectionsReceived)}**`,
    `Open receivables: **${inr(brief.financialTruth.openReceivables)}**`,
    `Overdue receivables: **${inr(brief.financialTruth.overdueReceivables)}**`,
    "",
    "### Profitability signals",
  ];

  if (brief.profitabilitySignals.length) {
    for (const signal of brief.profitabilitySignals.slice(0, 5)) {
      lines.push(
        `- ${signal.invoiceName} / ${signal.customerName}: GP **${inr(signal.grossProfit)}** (${signal.grossMarginPct}%)`,
      );
    }
  } else {
    lines.push("- No clean invoice-wise profit available yet.");
  }

  if (brief.blockedProfitItems.length) {
    lines.push("", "### COGS/BOM blocked profit");
    for (const item of brief.blockedProfitItems.slice(0, 5)) {
      lines.push(`- ${item.invoiceName} / ${item.customerName}: ${item.reason}`);
    }
  }

  lines.push("", "### Top money actions");
  for (const action of brief.moneyActions.slice(0, 3)) {
    lines.push(`- **${action.owner}** → ${action.action} by **${action.deadline}** — ${action.impact}`);
  }

  return lines.join("\n");
}

export function renderChiefOfStaffBriefMarkdown(brief: ChiefOfStaffBrief): string {
  const cadenceLabel: Record<AgentCadence, string> = {
    morning: "Morning",
    night: "Night",
  };
  const lines = [
    `## 🦚 Chief of Staff Brief — ${cadenceLabel[brief.cadence]}`,
    "",
    `**CEO Signal:** ${brief.ceoSignal}`,
    "",
    "### Top 3 actions",
  ];

  for (const action of brief.topActions.slice(0, 3)) {
    lines.push(`- **${action.owner}** → ${action.action} by **${action.deadline}** _(${action.sourceAgent})_`);
  }

  if (brief.decisionsNeeded.length) {
    lines.push("", "### Decisions needed from Ram");
    for (const decision of brief.decisionsNeeded) {
      lines.push(`- ${decision.decision} Recommendation: ${decision.recommendation}`);
    }
  }

  if (brief.whatChanged.length) {
    lines.push("", "### What changed");
    for (const item of brief.whatChanged) lines.push(`- ${item}`);
  }

  return lines.join("\n");
}
