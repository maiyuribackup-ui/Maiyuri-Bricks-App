import { describe, expect, it } from "vitest";
import {
  buildChiefOfStaffBrief,
  buildCfoManufacturingBrief,
  buildSalesFollowupBrief,
  createAgentEventPayload,
  logAgentEventToClickHouse,
} from "./index";

describe("Maiyuri agentic operating system", () => {
  it("builds a sales brief capped at 15 actions with overdue and ownership hygiene first", () => {
    const today = "2026-08-25";
    const leads = Array.from({ length: 17 }, (_, index) => ({
      id: `lead-${index}`,
      name: `Lead ${index}`,
      stage: index === 0 ? "Hot" : "Warm",
      supabaseOwner: index === 0 ? "Nithya" : index === 1 ? "Ram" : "Sales Team",
      todoistAssignee: index === 0 ? "Ram" : index === 1 ? "Ram" : "Sales Team",
      nextFollowupDate: index < 3 ? "2026-08-24" : today,
      estimatedValue: 10000 + index,
      buyingSignal: index === 0 ? "Asked for site visit" : "Needs follow-up",
    }));

    const brief = buildSalesFollowupBrief({ leads, today });

    expect(brief.summary.totalLeads).toBe(17);
    expect(brief.summary.overdueCount).toBe(3);
    expect(brief.summary.ownershipMismatchCount).toBe(1);
    expect(brief.actions).toHaveLength(15);
    expect(brief.actions[0]).toMatchObject({
      owner: "Nithya",
      leadName: "Lead 0",
      deadline: "2026-08-24",
      reason: expect.stringContaining("overdue"),
    });
    expect(brief.escalations[0].reason).toContain("ownership mismatch");
    expect(brief.proposedTasks[0].requiresApproval).toBe(true);
  });

  it("blocks invoice-wise CFO profit when COGS confidence is not clean", () => {
    const brief = buildCfoManufacturingBrief({
      period: "month",
      postedRevenue: 100000,
      collectionsReceived: 60000,
      openReceivables: 40000,
      overdueReceivables: 10000,
      invoices: [
        {
          invoiceName: "INV/001",
          customerName: "Clean Customer",
          postedRevenue: 50000,
          cogs: 30000,
          cogsConfidence: "clean",
        },
        {
          invoiceName: "INV/002",
          customerName: "Dirty Customer",
          postedRevenue: 50000,
          cogs: null,
          cogsConfidence: "dirty",
          warning: "Missing posted COGS lines",
        },
      ],
    });

    expect(brief.financialTruth.postedRevenue).toBe(100000);
    expect(brief.profitabilitySignals[0]).toMatchObject({
      invoiceName: "INV/001",
      grossProfit: 20000,
      grossMarginPct: 40,
    });
    expect(brief.blockedProfitItems).toEqual([
      expect.objectContaining({
        invoiceName: "INV/002",
        reason: expect.stringContaining("Missing posted COGS lines"),
      }),
    ]);
    expect(brief.moneyActions).toHaveLength(3);
  });

  it("compresses sales and CFO signals into top three Chief of Staff actions", () => {
    const salesBrief = buildSalesFollowupBrief({
      today: "2026-08-25",
      leads: [
        {
          id: "lead-1",
          name: "Hot Lead",
          stage: "Hot",
          supabaseOwner: "Nithya",
          todoistAssignee: "Nithya",
          nextFollowupDate: "2026-08-24",
          estimatedValue: 200000,
          buyingSignal: "Asked for quote revision",
        },
      ],
    });
    const cfoBrief = buildCfoManufacturingBrief({
      period: "month",
      postedRevenue: 100000,
      collectionsReceived: 20000,
      openReceivables: 80000,
      overdueReceivables: 50000,
      invoices: [],
    });

    const brief = buildChiefOfStaffBrief({ cadence: "morning", salesBrief, cfoBrief });

    expect(brief.cadence).toBe("morning");
    expect(brief.topActions.length).toBeLessThanOrEqual(3);
    expect(brief.ceoSignal).toContain("cash");
    expect(brief.topActions[0].sourceAgent).toBe("cfo_profit");
  });

  it("creates compact ClickHouse event payloads without full reports", () => {
    const payload = createAgentEventPayload({
      eventName: "agent.sales_followup.brief_generated",
      source: "agent.sales_followup",
      surface: "manual-cli",
      environment: "test",
      properties: {
        overdueCount: 3,
        actionsCount: 15,
        reportMarkdown: "this should not be stored",
      },
    });

    expect(payload.event_name).toBe("agent.sales_followup.brief_generated");
    expect(payload.properties_json).toContain("overdueCount");
    expect(payload.properties_json).not.toContain("reportMarkdown");
  });

  it("posts event payloads to ClickHouse JSONEachRow ingestion", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("Ok.\n", { status: 200 });
    };

    const result = await logAgentEventToClickHouse(
      {
        eventName: "agent.chief_of_staff.brief_generated",
        source: "agent.chief_of_staff",
        surface: "manual-cli",
        environment: "test",
        properties: { actionsCount: 3 },
      },
      {
        endpoint: "http://127.0.0.1:8125",
        username: "maiyuri_events_app",
        password: "secret",
        fetchFn: fakeFetch,
      },
    );

    expect(result.ok).toBe(true);
    expect(calls[0].url).toContain("INSERT%20INTO%20maiyuri_events.events");
    expect(calls[0].init.method).toBe("POST");
    expect(String(calls[0].init.body)).toContain("agent.chief_of_staff.brief_generated");
    expect((calls[0].init.headers as Record<string, string>).authorization).toMatch(/^Basic /);
  });
});
