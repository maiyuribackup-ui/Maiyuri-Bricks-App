/**
 * Accounts Receivable from Odoo — the cash the business is owed.
 *
 * Source of truth: posted customer invoices (account.move, move_type
 * out_invoice) whose payment_state is not_paid or partial. amount_residual
 * is what's still unpaid on each invoice.
 */
import { odooExecute } from "@/lib/odoo-service";

export interface ReceivableInvoice {
  ref: string;
  customer: string;
  residual: number;
  dueDate: string | null; // YYYY-MM-DD
  daysOverdue: number; // 0 when not yet due
}

export interface ReceivablesSummary {
  outstanding: number; // all unpaid
  overdue: number; // past due date
  overdueCount: number;
  invoiceCount: number;
  topDebtors: { customer: string; due: number; oldestDays: number }[];
  overdueInvoices: ReceivableInvoice[]; // sorted oldest first
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

/** Today in IST as YYYY-MM-DD (Odoo dates are plain dates). */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export async function fetchReceivables(): Promise<ReceivablesSummary> {
  const rows = (await odooExecute("account.move", "search_read", [
    [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["payment_state", "in", ["not_paid", "partial"]],
      ["amount_residual", ">", 0],
    ],
  ], {
    fields: ["name", "partner_id", "amount_residual", "invoice_date_due"],
    limit: 500,
  })) as {
    name: string;
    partner_id: [number, string] | false;
    amount_residual: number;
    invoice_date_due: string | false;
  }[];

  const today = istToday();
  const invoices: ReceivableInvoice[] = rows.map((r) => {
    const dueDate = r.invoice_date_due || null;
    const daysOverdue =
      dueDate && dueDate < today
        ? Math.floor(
            (Date.parse(today) - Date.parse(dueDate)) / 86_400_000,
          )
        : 0;
    return {
      ref: r.name,
      customer: Array.isArray(r.partner_id) ? r.partner_id[1] : "—",
      residual: num(r.amount_residual),
      dueDate,
      daysOverdue,
    };
  });

  const overdueInvoices = invoices
    .filter((i) => i.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  // Group overdue amounts by customer for the "who to call" list.
  const byCustomer = new Map<string, { due: number; oldestDays: number }>();
  for (const i of overdueInvoices) {
    const cur = byCustomer.get(i.customer) ?? { due: 0, oldestDays: 0 };
    cur.due += i.residual;
    cur.oldestDays = Math.max(cur.oldestDays, i.daysOverdue);
    byCustomer.set(i.customer, cur);
  }

  return {
    outstanding: invoices.reduce((s, i) => s + i.residual, 0),
    overdue: overdueInvoices.reduce((s, i) => s + i.residual, 0),
    overdueCount: overdueInvoices.length,
    invoiceCount: invoices.length,
    topDebtors: [...byCustomer.entries()]
      .map(([customer, v]) => ({ customer, ...v }))
      .sort((a, b) => b.due - a.due)
      .slice(0, 5),
    overdueInvoices,
  };
}
