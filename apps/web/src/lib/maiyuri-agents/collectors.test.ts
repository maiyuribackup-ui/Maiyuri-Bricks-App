import { describe, expect, it } from "vitest";
import {
  buildCfoBriefFromSnapshot,
  mapLeadRowsToSalesInputs,
  mapTodoistTasksToSalesInputs,
  renderChiefOfStaffBriefMarkdown,
  renderCfoBriefMarkdown,
  renderSalesBriefMarkdown,
} from "./collectors";
import {
  buildChiefOfStaffBrief,
  buildCfoManufacturingBrief,
  buildSalesFollowupBrief,
} from "./index";

describe("Maiyuri agent real collectors", () => {
  it("maps Supabase leads and Todoist tasks into sales inputs with both ownership sources", () => {
    const leads = [
      {
        id: "lead-1",
        name: "Arun Villa",
        lead_temperature: "hot",
        pipeline_stage: "quote_sent",
        assigned_staff: "Nithya",
        follow_up_date: "2026-08-24",
        budget: 250000,
        notes: "Asked for revised quote",
      },
      {
        id: "lead-2",
        name: "Bala Site",
        lead_temperature: "warm",
        pipeline_stage: "connected",
        assigned_staff: null,
        follow_up_date: "2026-08-25",
        budget: null,
        notes: null,
      },
    ];
    const todoistTasks = [
      {
        id: "todo-1",
        content: "Call Arun Villa lead_id:lead-1 today",
        assigneeName: "Ram",
        dueDate: "2026-08-24",
      },
    ];

    const inputs = mapLeadRowsToSalesInputs({ leads, todoistTasks });

    expect(inputs).toEqual([
      expect.objectContaining({
        id: "lead-1",
        name: "Arun Villa",
        supabaseOwner: "Nithya",
        todoistAssignee: "Ram",
        nextFollowupDate: "2026-08-24",
        estimatedValue: 250000,
        buyingSignal: expect.stringContaining("Asked for revised quote"),
      }),
      expect.objectContaining({
        id: "lead-2",
        supabaseOwner: null,
        todoistAssignee: null,
      }),
    ]);
  });

  it("maps Todoist-only Maiyuri sales tasks into fallback sales inputs", () => {
    const inputs = mapTodoistTasksToSalesInputs([
      {
        id: "todo-1",
        content: "Follow up Arun Villa quote today",
        assigneeName: "Nithya",
        dueDate: "2026-08-25",
        projectName: "Maiyuri Bricks Sales",
      },
      {
        id: "todo-2",
        content: "Buy milk",
        assigneeName: "Ram",
        dueDate: "2026-08-25",
        projectName: "Personal",
      },
      {
        id: "todo-3",
        content: "Our 6 Core Customer Commitments",
        assigneeName: null,
        dueDate: "2026-08-25",
        projectName: "Maiyuri Bricks",
      },
      {
        id: "todo-4",
        content: "Oil filter and new machine quotation",
        assigneeName: "Srini",
        dueDate: "2026-08-25",
        projectName: "Maiyuri Bricks",
      },
    ]);

    expect(inputs).toEqual([
      expect.objectContaining({
        id: "todoist:todo-1",
        name: "Follow up Arun Villa quote today",
        supabaseOwner: null,
        todoistAssignee: "Nithya",
        nextFollowupDate: "2026-08-25",
        buyingSignal: expect.stringContaining("Todoist"),
      }),
    ]);
  });

  it("builds CFO manufacturing brief from an MCP-style profitability snapshot", () => {
    const brief = buildCfoBriefFromSnapshot({
      grain: "month",
      postedRevenue: 125000,
      collectionsReceived: 50000,
      openReceivables: 75000,
      overdueReceivables: 30000,
      invoiceProfits: [
        {
          invoiceName: "INV/100",
          customerName: "Good Customer",
          postedRevenue: 80000,
          cogs: 50000,
          cogsConfidence: "clean",
        },
        {
          invoiceName: "INV/101",
          customerName: "Dirty COGS Customer",
          postedRevenue: 45000,
          cogs: null,
          cogsConfidence: "dirty",
          warning: "Negative stock valuation",
        },
      ],
    });

    expect(brief.period).toBe("month");
    expect(brief.financialTruth.postedRevenue).toBe(125000);
    expect(brief.profitabilitySignals[0].grossProfit).toBe(30000);
    expect(brief.blockedProfitItems[0].reason).toContain("Negative stock valuation");
  });

  it("renders Telegram-ready sales/CFO/Chief briefs without raw dumps", () => {
    const salesBrief = buildSalesFollowupBrief({
      today: "2026-08-25",
      leads: mapLeadRowsToSalesInputs({
        leads: [
          {
            id: "lead-1",
            name: "Arun Villa",
            lead_temperature: "hot",
            pipeline_stage: "quote_sent",
            assigned_staff: "Nithya",
            follow_up_date: "2026-08-24",
            budget: 250000,
            notes: "Asked for revised quote",
          },
        ],
        todoistTasks: [],
      }),
    });
    const cfoBrief = buildCfoManufacturingBrief({
      period: "month",
      postedRevenue: 125000,
      collectionsReceived: 50000,
      openReceivables: 75000,
      overdueReceivables: 30000,
      invoices: [],
    });
    const chiefBrief = buildChiefOfStaffBrief({ cadence: "morning", salesBrief, cfoBrief });

    expect(renderSalesBriefMarkdown(salesBrief)).toContain("## Sales Follow-up Brief");
    expect(renderCfoBriefMarkdown(cfoBrief)).toContain("## Manufacturing CFO Brief");
    const chiefMarkdown = renderChiefOfStaffBriefMarkdown(chiefBrief);
    expect(chiefMarkdown).toContain("## 🦚 Chief of Staff Brief");
    expect(chiefMarkdown).not.toContain("raw");
  });
});
