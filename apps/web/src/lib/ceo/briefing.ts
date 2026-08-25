/**
 * CEO briefing aggregator — the numbers a founder must know cold:
 *   money in the bank, what each brick truly costs vs sells for,
 *   profit this week / this month / last month, and the sales pipeline.
 *
 * Every section is isolated (Promise.allSettled at the route): a slow or
 * unreachable source nulls that section, never the whole briefing.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooExecute } from "@/lib/odoo-service";
import { fetchReceivables } from "@/lib/receivables";

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

// ---------------------------------------------------------------------------
// Money — bank & cash balances from Odoo journals (posted entries).
// ---------------------------------------------------------------------------

export type MoneyBalances = {
  bank: number;
  cash: number;
  accounts: { name: string; type: "bank" | "cash"; balance: number }[];
};

type OdooJournal = {
  id: number;
  name: string;
  type: "bank" | "cash";
  default_account_id: [number, string] | false;
};

export async function balancesFromOdoo(): Promise<MoneyBalances> {
  const journals = (await odooExecute(
    "account.journal",
    "search_read",
    [[["type", "in", ["bank", "cash"]]]],
    { fields: ["id", "name", "type", "default_account_id"] },
  )) as OdooJournal[];

  const accountToJournal = new Map<number, OdooJournal>();
  for (const j of journals) {
    if (Array.isArray(j.default_account_id)) {
      accountToJournal.set(j.default_account_id[0], j);
    }
  }
  const accountIds = [...accountToJournal.keys()];
  if (!accountIds.length) return { bank: 0, cash: 0, accounts: [] };

  const groups = (await odooExecute(
    "account.move.line",
    "read_group",
    [
      [["account_id", "in", accountIds], ["parent_state", "=", "posted"]],
      ["balance"],
      ["account_id"],
    ],
    { lazy: false },
  )) as { account_id: [number, string] | false; balance: number }[];

  let bank = 0;
  let cash = 0;
  const accounts: MoneyBalances["accounts"] = [];
  for (const g of groups) {
    const accountId = Array.isArray(g.account_id) ? g.account_id[0] : null;
    if (!accountId) continue;
    const journal = accountToJournal.get(accountId);
    if (!journal) continue;
    const balance = num(g.balance);
    if (journal.type === "cash") cash += balance;
    else bank += balance;
    accounts.push({ name: journal.name, type: journal.type, balance });
  }
  accounts.sort((a, b) => b.balance - a.balance);
  return { bank, cash, accounts };
}

// ---------------------------------------------------------------------------
// Product economics — true cost per brick from the BOM × live Odoo material
// prices, against the live selling price. The margin column is the business.
// ---------------------------------------------------------------------------

export type ProductEconomics = {
  name: string;
  cost: number; // Σ bom qty × raw-material standard_price
  price: number; // Odoo list_price
  margin: number; // price - cost
  margin_pct: number; // margin / price
  stock_qty: number;
  cost_breakdown: { material: string; amount: number }[];
};

export async function productEconomics(): Promise<ProductEconomics[]> {
  const [{ data: goods }, { data: boms }, { data: mats }] = await Promise.all([
    supabaseAdmin
      .from("finished_goods")
      .select("id, name, odoo_product_id, stock_qty, bom_quantity")
      .eq("is_active", true)
      .eq("plan_excluded", false),
    supabaseAdmin
      .from("bom_lines")
      .select("finished_good_id, raw_material_id, quantity_per_bom"),
    supabaseAdmin
      .from("raw_materials")
      .select("id, name, odoo_product_id")
      .eq("is_active", true),
  ]);

  const matById = new Map((mats ?? []).map((m) => [m.id as string, m]));
  const odooIds = [
    ...new Set([
      ...(goods ?? []).map((g) => g.odoo_product_id as number),
      ...(mats ?? []).map((m) => m.odoo_product_id as number),
    ]),
  ].filter(Boolean);

  const products = (await odooExecute("product.product", "read", [odooIds], {
    fields: ["id", "standard_price", "list_price"],
  })) as { id: number; standard_price: number; list_price: number }[];
  const priceByOdooId = new Map(products.map((p) => [p.id, p]));

  return (goods ?? [])
    .map((g) => {
      const lines = (boms ?? []).filter((b) => b.finished_good_id === g.id);
      // A BOM in Odoo describes ONE BATCH, not one brick — e.g. CIB-10*8*5's
      // recipe (90kg sand + 10kg cement + …) yields bom_quantity = 7.5 bricks.
      // Divide by the batch output or every cost is inflated ~7×.
      const batchQty = num((g as { bom_quantity?: unknown }).bom_quantity) || 1;
      const breakdown = lines
        .map((b) => {
          const mat = matById.get(b.raw_material_id as string);
          const unitPrice = mat
            ? num(priceByOdooId.get(mat.odoo_product_id as number)?.standard_price)
            : 0;
          return {
            material: (mat?.name as string) ?? "?",
            amount: (num(b.quantity_per_bom) * unitPrice) / batchQty,
          };
        })
        .sort((a, b) => b.amount - a.amount);
      const cost = breakdown.reduce((s, l) => s + l.amount, 0);
      const price = num(
        priceByOdooId.get(g.odoo_product_id as number)?.list_price,
      );
      const margin = price - cost;
      return {
        name: (g.name as string).trim(),
        cost,
        price,
        margin,
        margin_pct: price > 0 ? (margin / price) * 100 : 0,
        stock_qty: num(g.stock_qty),
        cost_breakdown: breakdown.slice(0, 4),
      };
    })
    .filter((p) => p.cost > 0 || p.price > 0)
    .sort((a, b) => a.margin_pct - b.margin_pct); // worst margin first — that's the CEO's problem child
}

// ---------------------------------------------------------------------------
// Profit periods — invoiced revenue minus vendor bills, from posted moves.
// ---------------------------------------------------------------------------

export type ProfitPeriod = {
  label: string;
  from: string;
  to: string;
  revenue: number;
  expenses: number;
  net: number;
  invoice_count: number;
};

const IST_TZ = "Asia/Kolkata";

/** Today's date parts in IST. */
function istNow(): { y: number; m: number; d: number; dow: number } {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: IST_TZ }); // YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  const dow = new Date(`${s}T12:00:00Z`).getUTCDay(); // 0=Sun
  return { y, m, d, dow };
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

async function periodTotal(
  moveType: "out_invoice" | "in_invoice",
  from: string,
  to: string,
): Promise<{ total: number; count: number }> {
  const groups = (await odooExecute(
    "account.move",
    "read_group",
    [
      [
        ["move_type", "=", moveType],
        ["state", "=", "posted"],
        ["invoice_date", ">=", from],
        ["invoice_date", "<=", to],
      ],
      ["amount_total"],
      [],
    ],
    { lazy: false },
  )) as { amount_total: number; __count: number }[];
  return {
    total: num(groups?.[0]?.amount_total),
    count: num(groups?.[0]?.__count),
  };
}

export async function profitPeriods(): Promise<ProfitPeriod[]> {
  const { y, m, d, dow } = istNow();
  const today = iso(y, m, d);

  // Week starts Monday (factory week).
  const backToMonday = (dow + 6) % 7;
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - backToMonday);
  const weekStart = monday.toISOString().slice(0, 10);

  const monthStart = iso(y, m, 1);
  const lastMonthY = m === 1 ? y - 1 : y;
  const lastMonthM = m === 1 ? 12 : m - 1;
  const lastMonthStart = iso(lastMonthY, lastMonthM, 1);
  const lastMonthEnd = iso(y, m, 1);
  const lastMonthEndDate = new Date(`${lastMonthEnd}T12:00:00Z`);
  lastMonthEndDate.setUTCDate(lastMonthEndDate.getUTCDate() - 1);
  const lastMonthLast = lastMonthEndDate.toISOString().slice(0, 10);

  const ranges = [
    { label: "This week", from: weekStart, to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: lastMonthStart, to: lastMonthLast },
  ];

  return Promise.all(
    ranges.map(async (r) => {
      const [rev, exp] = await Promise.all([
        periodTotal("out_invoice", r.from, r.to),
        periodTotal("in_invoice", r.from, r.to),
      ]);
      return {
        ...r,
        revenue: rev.total,
        expenses: exp.total,
        net: rev.total - exp.total,
        invoice_count: rev.count,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Sales pipeline — open leads by stage with estimated value.
// ---------------------------------------------------------------------------

export type PipelineStage = { stage: string; count: number; value: number };

const STAGE_ORDER = [
  "new",
  "contacted",
  "site_visit",
  "quote_shared",
  "negotiation",
  "order_won",
];

export async function pipelineByStage(): Promise<{
  stages: PipelineStage[];
  open_count: number;
  open_value: number;
}> {
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("pipeline_stage, estimated_value")
    .neq("pipeline_stage", "closed_lost");

  const byStage = new Map<string, PipelineStage>();
  for (const l of leads ?? []) {
    const s = (l.pipeline_stage as string) ?? "new";
    const cur = byStage.get(s) ?? { stage: s, count: 0, value: 0 };
    cur.count += 1;
    cur.value += num(l.estimated_value);
    byStage.set(s, cur);
  }
  const stages = [...byStage.values()].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
  );
  const open = stages.filter((s) => s.stage !== "order_won");
  return {
    stages,
    open_count: open.reduce((s, x) => s + x.count, 0),
    open_value: open.reduce((s, x) => s + x.value, 0),
  };
}

// ---------------------------------------------------------------------------
// Receivables — context the AI needs (money already earned but not in bank).
// ---------------------------------------------------------------------------

export async function receivablesSummary(): Promise<{
  outstanding: number;
  overdue: number;
  overdue_count: number;
} | null> {
  try {
    const r = await fetchReceivables();
    return {
      outstanding: r.outstanding,
      overdue: r.overdue,
      overdue_count: r.overdueCount,
    };
  } catch {
    return null;
  }
}
