/**
 * Monthly Profit & Loss straight from Odoo's general ledger — grouped by
 * P&L account, drillable down to the individual posted journal entries.
 *
 * Sign conventions (Odoo stores balance = debit − credit):
 *   income accounts carry credit balances (negative)  → shown as -balance
 *   expense accounts carry debit balances (positive)  → shown as +balance
 */
import { odooExecute } from "@/lib/odoo-service";

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

const INCOME_TYPES = ["income", "income_other"];
const EXPENSE_TYPES = ["expense", "expense_depreciation", "expense_direct_cost"];

export type PnlAccount = {
  account_id: number;
  account: string;
  amount: number; // positive, display-ready
  entry_count: number;
};

export type PnlStatement = {
  month: string; // YYYY-MM
  from: string;
  to: string;
  revenue: { total: number; accounts: PnlAccount[] };
  expenses: { total: number; accounts: PnlAccount[] };
  net: number;
};

export type PnlLine = {
  date: string;
  move: string; // journal entry ref (BILL/2026/07/0012, MISC/…)
  partner: string | null;
  label: string | null;
  amount: number;
};

/** Month bounds: "2026-07" → { from: 2026-07-01, to: 2026-07-31 }. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

async function groupByAccount(
  accountTypes: string[],
  from: string,
  to: string,
  flipSign: boolean,
): Promise<PnlAccount[]> {
  const groups = (await odooExecute(
    "account.move.line",
    "read_group",
    [
      [
        ["account_id.account_type", "in", accountTypes],
        ["parent_state", "=", "posted"],
        ["date", ">=", from],
        ["date", "<=", to],
      ],
      ["balance"],
      ["account_id"],
    ],
    { lazy: false },
  )) as { account_id: [number, string] | false; balance: number; __count: number }[];

  return groups
    .filter((g) => Array.isArray(g.account_id))
    .map((g) => ({
      account_id: (g.account_id as [number, string])[0],
      account: (g.account_id as [number, string])[1],
      amount: flipSign ? -num(g.balance) : num(g.balance),
      entry_count: num(g.__count),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export async function pnlForMonth(month: string): Promise<PnlStatement> {
  const { from, to } = monthBounds(month);
  const [income, expenses] = await Promise.all([
    groupByAccount(INCOME_TYPES, from, to, true),
    groupByAccount(EXPENSE_TYPES, from, to, false),
  ]);
  const revenueTotal = income.reduce((s, a) => s + a.amount, 0);
  const expenseTotal = expenses.reduce((s, a) => s + a.amount, 0);
  return {
    month,
    from,
    to,
    revenue: { total: revenueTotal, accounts: income },
    expenses: { total: expenseTotal, accounts: expenses },
    net: revenueTotal - expenseTotal,
  };
}

/**
 * Drill-down: every posted journal line on one account in the month.
 * `kind` fixes the sign so refunds/credit-notes show as negatives instead of
 * being flattened by an abs().
 */
export async function pnlAccountLines(
  accountId: number,
  month: string,
  kind: "income" | "expense",
): Promise<PnlLine[]> {
  const { from, to } = monthBounds(month);
  const lines = (await odooExecute(
    "account.move.line",
    "search_read",
    [
      [
        ["account_id", "=", accountId],
        ["parent_state", "=", "posted"],
        ["date", ">=", from],
        ["date", "<=", to],
      ],
    ],
    {
      fields: ["date", "move_id", "partner_id", "name", "balance"],
      order: "date desc, id desc",
      limit: 300,
    },
  )) as {
    date: string;
    move_id: [number, string] | false;
    partner_id: [number, string] | false;
    name: string | false;
    balance: number;
  }[];

  return lines.map((l) => ({
    date: l.date,
    move: Array.isArray(l.move_id) ? l.move_id[1] : "—",
    partner: Array.isArray(l.partner_id) ? l.partner_id[1] : null,
    label: l.name || null,
    // Natural sign per section: expenses debit-positive, income
    // credit-positive; refunds/credit notes come out negative.
    amount: kind === "income" ? -num(l.balance) : num(l.balance),
  }));
}
