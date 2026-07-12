/**
 * Daily Operations Snapshot aggregator.
 *
 * Pulls a single day's activity from every connected system. Each source is
 * isolated: a failure or a not-yet-connected integration degrades that ONE
 * tile to a "pending"/"error" state with a reason, never breaking the page.
 * Times are anchored to IST (Asia/Kolkata, UTC+5:30) — the factory's clock.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooExecute } from "@/lib/odoo-service";
import { fetchReceivables } from "@/lib/receivables";
import {
  getWebsiteAnalytics,
  isGa4Configured,
  type WebsiteAnalytics,
} from "@/lib/ga4/client";

export type SourceStatus = "live" | "pending" | "error";

type Base = { status: SourceStatus; note?: string };

export interface FinanceSection extends Base {
  invoiced: number;
  invoiceCount: number;
  expenses: number;
  expenseCount: number;
  net: number;
  topInvoices: { ref: string; party: string; amount: number }[];
  topExpenses: { label: string; amount: number }[];
}

export interface ReceivablesSection extends Base {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  topDebtors: { customer: string; due: number; oldestDays: number }[];
}

export interface PlanActualSection extends Base {
  plannedUnits: number;
  actualUnits: number;
  pct: number;
  byProduct: { name: string; planned: number; actual: number }[];
}

export interface DeliverySection extends Base {
  planned: number;
  completed: number;
  rolledOver: number;
  /** Trip economics captured by drivers at completion (0 when not recorded). */
  tripKm: number;
  dieselCost: number;
}

export interface WebsiteSection extends Base {
  visitors: number;
  pageViews: number;
  sessions: number;
  timeseries: { date: string; users: number }[];
  keyEvents: { event: string; count: number }[];
}

export interface LeadsSection extends Base {
  newLeads: number;
  hot: number;
  followupsDue: number;
}

export interface CountSection extends Base {
  primary: number;
  metrics: { label: string; value: string }[];
}

export interface DailyReport {
  date: string; // YYYY-MM-DD (IST day)
  generatedAt: string; // ISO
  finance: FinanceSection;
  receivables: ReceivablesSection;
  production: PlanActualSection;
  deliveries: DeliverySection;
  website: WebsiteSection;
  leads: LeadsSection;
  calls: CountSection;
  whatsapp: CountSection;
  tasks: CountSection;
}

const IST_OFFSET = "+05:30";

function istBounds(dateISO: string): { startUtc: string; endUtc: string } {
  return {
    startUtc: new Date(`${dateISO}T00:00:00${IST_OFFSET}`).toISOString(),
    endUtc: new Date(`${dateISO}T23:59:59.999${IST_OFFSET}`).toISOString(),
  };
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

/** Today's revenue + expenses from Odoo (account.move). */
async function financeFromOdoo(dateISO: string): Promise<FinanceSection> {
  if (!process.env.ODOO_PASSWORD) {
    return emptyFinance("pending", "Odoo not configured");
  }
  try {
    const [invoices, bills] = await Promise.all([
      odooExecute("account.move", "search_read", [
        [
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["invoice_date", "=", dateISO],
        ],
      ], { fields: ["name", "partner_id", "amount_total"], limit: 200 }) as Promise<
        { name: string; partner_id: [number, string] | false; amount_total: number }[]
      >,
      odooExecute("account.move", "search_read", [
        [
          ["move_type", "=", "in_invoice"],
          ["state", "=", "posted"],
          ["invoice_date", "=", dateISO],
        ],
      ], { fields: ["name", "partner_id", "amount_total"], limit: 200 }) as Promise<
        { name: string; partner_id: [number, string] | false; amount_total: number }[]
      >,
    ]);

    const invoiced = invoices.reduce((s, i) => s + num(i.amount_total), 0);
    const expenses = bills.reduce((s, b) => s + num(b.amount_total), 0);
    return {
      status: "live",
      invoiced,
      invoiceCount: invoices.length,
      expenses,
      expenseCount: bills.length,
      net: invoiced - expenses,
      topInvoices: invoices
        .sort((a, b) => num(b.amount_total) - num(a.amount_total))
        .slice(0, 4)
        .map((i) => ({
          ref: i.name,
          party: Array.isArray(i.partner_id) ? i.partner_id[1] : "—",
          amount: num(i.amount_total),
        })),
      topExpenses: bills
        .sort((a, b) => num(b.amount_total) - num(a.amount_total))
        .slice(0, 3)
        .map((b) => ({
          label: Array.isArray(b.partner_id) ? b.partner_id[1] : b.name,
          amount: num(b.amount_total),
        })),
    };
  } catch (err) {
    return emptyFinance("error", err instanceof Error ? err.message : "Odoo error");
  }
}

/** Outstanding + overdue receivables — the founder's sleep-loss number. */
async function receivablesFromOdoo(): Promise<ReceivablesSection> {
  if (!process.env.ODOO_PASSWORD) {
    return {
      status: "pending",
      note: "Odoo not configured",
      outstanding: 0,
      overdue: 0,
      overdueCount: 0,
      topDebtors: [],
    };
  }
  try {
    const ar = await fetchReceivables();
    return {
      status: "live",
      outstanding: ar.outstanding,
      overdue: ar.overdue,
      overdueCount: ar.overdueCount,
      topDebtors: ar.topDebtors.slice(0, 3),
    };
  } catch (err) {
    return {
      status: "error",
      note: err instanceof Error ? err.message : "Odoo error",
      outstanding: 0,
      overdue: 0,
      overdueCount: 0,
      topDebtors: [],
    };
  }
}

function emptyFinance(status: SourceStatus, note: string): FinanceSection {
  return {
    status,
    note,
    invoiced: 0,
    invoiceCount: 0,
    expenses: 0,
    expenseCount: 0,
    net: 0,
    topInvoices: [],
    topExpenses: [],
  };
}

/** Production planned vs actual from our own plan items (no Odoo needed). */
async function productionFromPlan(dateISO: string): Promise<PlanActualSection> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ops_plan_items")
      .select("product_name, quantity, actual_quantity")
      .eq("item_type", "production")
      .eq("item_date", dateISO);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const byName = new Map<string, { planned: number; actual: number }>();
    for (const r of rows) {
      const cur = byName.get(r.product_name) ?? { planned: 0, actual: 0 };
      cur.planned += num(r.quantity);
      cur.actual += num(r.actual_quantity);
      byName.set(r.product_name, cur);
    }
    const planned = rows.reduce((s, r) => s + num(r.quantity), 0);
    const actual = rows.reduce((s, r) => s + num(r.actual_quantity), 0);
    return {
      status: rows.length ? "live" : "pending",
      note: rows.length ? undefined : "No production planned for this day",
      plannedUnits: planned,
      actualUnits: actual,
      pct: planned ? Math.round((actual / planned) * 100) : 0,
      byProduct: [...byName.entries()].map(([name, v]) => ({ name, ...v })),
    };
  } catch (err) {
    return {
      status: "error",
      note: err instanceof Error ? err.message : "DB error",
      plannedUnits: 0,
      actualUnits: 0,
      pct: 0,
      byProduct: [],
    };
  }
}

/** Delivery planned vs actual from plan items. */
async function deliveriesFromPlan(dateISO: string): Promise<DeliverySection> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ops_plan_items")
      .select("status")
      .eq("item_type", "delivery")
      .eq("item_date", dateISO);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const completed = rows.filter((r) => r.status === "done").length;
    const rolledOver = rows.filter((r) => r.status === "moved" || r.status === "missed").length;

    // Trip economics from the deliveries the drivers actually closed today.
    const { startUtc, endUtc } = istBounds(dateISO);
    const { data: trips } = await supabaseAdmin
      .from("deliveries")
      .select("trip_km, diesel_cost")
      .eq("status", "delivered")
      .gte("updated_at", startUtc)
      .lte("updated_at", endUtc);
    const tripKm = (trips ?? []).reduce((s, t) => s + num(t.trip_km), 0);
    const dieselCost = (trips ?? []).reduce((s, t) => s + num(t.diesel_cost), 0);

    return {
      status: rows.length ? "live" : "pending",
      note: rows.length ? undefined : "No deliveries planned for this day",
      planned: rows.length,
      completed,
      rolledOver,
      tripKm,
      dieselCost,
    };
  } catch (err) {
    return {
      status: "error",
      note: err instanceof Error ? err.message : "DB error",
      planned: 0,
      completed: 0,
      rolledOver: 0,
      tripKm: 0,
      dieselCost: 0,
    };
  }
}

/** Website activity from GA4 (single-day window). */
async function websiteFromGa4(): Promise<WebsiteSection> {
  if (!isGa4Configured()) {
    return {
      status: "pending",
      note: "GA4 not configured",
      visitors: 0,
      pageViews: 0,
      sessions: 0,
      timeseries: [],
      keyEvents: [],
    };
  }
  try {
    const a = (await getWebsiteAnalytics(1)) as WebsiteAnalytics;
    return {
      status: "live",
      visitors: a.totals.activeUsers,
      pageViews: a.totals.pageViews,
      sessions: a.totals.sessions,
      timeseries: a.timeseries,
      keyEvents: a.keyEvents,
    };
  } catch (err) {
    return {
      status: "error",
      note: err instanceof Error ? err.message : "GA4 error",
      visitors: 0,
      pageViews: 0,
      sessions: 0,
      timeseries: [],
      keyEvents: [],
    };
  }
}

/** New / hot leads and follow-ups due, from the CRM tables. */
async function leadsFromDb(dateISO: string): Promise<LeadsSection> {
  const { startUtc, endUtc } = istBounds(dateISO);
  try {
    const [created, hot, followups] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startUtc)
        .lte("created_at", endUtc),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("lead_temperature", "hot")
        .gte("created_at", startUtc)
        .lte("created_at", endUtc),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("follow_up_date", dateISO),
    ]);
    return {
      status: "live",
      newLeads: created.count ?? 0,
      hot: hot.count ?? 0,
      followupsDue: followups.count ?? 0,
    };
  } catch (err) {
    return {
      status: "error",
      note: err instanceof Error ? err.message : "DB error",
      newLeads: 0,
      hot: 0,
      followupsDue: 0,
    };
  }
}

const notConnected = (note: string): CountSection => ({
  status: "pending",
  note,
  primary: 0,
  metrics: [],
});

/** Team task activity for the day, from the My Work module. */
async function tasksFromMyWork(dateISO: string): Promise<CountSection> {
  const { startUtc, endUtc } = istBounds(dateISO);
  try {
    const [assigned, completed, openOverdue] = await Promise.all([
      // Work that belonged to this day (scheduled or due on it)
      supabaseAdmin
        .from("work_items")
        .select("id", { count: "exact", head: true })
        .or(
          `scheduled_date.eq.${dateISO},and(due_at.gte.${startUtc},due_at.lte.${endUtc})`,
        ),
      supabaseAdmin
        .from("work_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["completed", "submitted"])
        .gte("submitted_at", startUtc)
        .lte("submitted_at", endUtc),
      supabaseAdmin
        .from("work_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress", "returned"])
        .lt("due_at", endUtc),
    ]);
    const done = completed.count ?? 0;
    return {
      status: "live",
      primary: done,
      metrics: [
        { label: "Due today", value: String(assigned.count ?? 0) },
        { label: "Done", value: String(done) },
        { label: "Still open", value: String(openOverdue.count ?? 0) },
      ],
    };
  } catch (err) {
    return {
      status: "error",
      note: err instanceof Error ? err.message : "DB error",
      primary: 0,
      metrics: [],
    };
  }
}

/**
 * Assemble the full report. Every source runs concurrently and independently;
 * a rejected source becomes an error tile rather than failing the whole report.
 */
export async function getDailyReport(dateISO: string): Promise<DailyReport> {
  const [finance, receivables, production, deliveries, website, leads, tasks] =
    await Promise.all([
      financeFromOdoo(dateISO),
      receivablesFromOdoo(),
      productionFromPlan(dateISO),
      deliveriesFromPlan(dateISO),
      websiteFromGa4(),
      leadsFromDb(dateISO),
      tasksFromMyWork(dateISO),
    ]);

  return {
    date: dateISO,
    generatedAt: new Date().toISOString(),
    finance,
    receivables,
    production,
    deliveries,
    website,
    leads,
    tasks,
    // Awaiting integration + credentials (see daily-report page footer):
    calls: notConnected("Superfone API not connected"),
    whatsapp: notConnected("WhatsApp Cloud API not connected"),
  };
}
