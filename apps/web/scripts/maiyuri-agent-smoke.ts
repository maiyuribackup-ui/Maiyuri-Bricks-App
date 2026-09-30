#!/usr/bin/env -S npx tsx
import {
  buildChiefOfStaffBrief,
  buildCfoManufacturingBrief,
  buildSalesFollowupBrief,
  logAgentEventToClickHouse,
} from "../src/lib/maiyuri-agents/index";

const today = process.env.MAIYURI_AGENT_TODAY ?? new Date().toISOString().slice(0, 10);

const salesBrief = buildSalesFollowupBrief({
  today,
  leads: [
    {
      id: "sample-hot-lead",
      name: "Sample Hot Lead",
      stage: "Hot",
      supabaseOwner: "Nithya",
      todoistAssignee: "Nithya",
      nextFollowupDate: today,
      estimatedValue: 150000,
      buyingSignal: "Asked for quote revision",
    },
    {
      id: "sample-owner-mismatch",
      name: "Sample Ownership Mismatch",
      stage: "Warm",
      supabaseOwner: "Nithya",
      todoistAssignee: "Ram",
      nextFollowupDate: "2026-08-24",
      estimatedValue: 80000,
      buyingSignal: "Needs site visit confirmation",
    },
  ],
});

const cfoBrief = buildCfoManufacturingBrief({
  period: "month",
  postedRevenue: 100000,
  collectionsReceived: 45000,
  openReceivables: 55000,
  overdueReceivables: 25000,
  invoices: [
    {
      invoiceName: "SMOKE/001",
      customerName: "Sample Clean Customer",
      postedRevenue: 60000,
      cogs: 36000,
      cogsConfidence: "clean",
    },
    {
      invoiceName: "SMOKE/002",
      customerName: "Sample Blocked Customer",
      postedRevenue: 40000,
      cogs: null,
      cogsConfidence: "dirty",
      warning: "Missing posted COGS lines",
    },
  ],
});

const chiefBrief = buildChiefOfStaffBrief({ cadence: "morning", salesBrief, cfoBrief });

const events = [
  {
    eventName: "agent.sales_followup.brief_generated",
    source: "agent.sales_followup",
    properties: {
      overdueCount: salesBrief.summary.overdueCount,
      actionsCount: salesBrief.actions.length,
      ownershipMismatchCount: salesBrief.summary.ownershipMismatchCount,
    },
  },
  {
    eventName: "agent.cfo_profit.brief_generated",
    source: "agent.cfo_profit",
    properties: {
      postedRevenue: cfoBrief.financialTruth.postedRevenue,
      blockedProfitItems: cfoBrief.blockedProfitItems.length,
      moneyActionsCount: cfoBrief.moneyActions.length,
    },
  },
  {
    eventName: "agent.chief_of_staff.brief_generated",
    source: "agent.chief_of_staff",
    properties: {
      cadence: chiefBrief.cadence,
      topActionsCount: chiefBrief.topActions.length,
      escalationsCount: chiefBrief.escalations.length,
    },
  },
];

async function main() {
  for (const event of events) {
    const result = await logAgentEventToClickHouse({
      eventName: event.eventName,
      source: event.source,
      surface: "manual-smoke",
      environment: process.env.NODE_ENV ?? "local",
      properties: event.properties,
    });
    if (!result.ok) {
      console.error(`ClickHouse log failed for ${event.eventName}:`, result);
      process.exitCode = 1;
    }
  }

  console.log(JSON.stringify({ salesBrief, cfoBrief, chiefBrief }, null, 2));
}

void main();
