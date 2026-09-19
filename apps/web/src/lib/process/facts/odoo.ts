/**
 * Odoo facts for gates (PRD §29). Odoo is the source of transactional truth;
 * we read, never write. Every loader throws on failure so the gate turns
 * UNKNOWN rather than silently passing.
 */
import { odooExecute } from "@/lib/odoo-service";
import type { PaymentFact } from "../gates";

const num = (v: unknown): number =>
  typeof v === "number" ? v : Number(v) || 0;

interface OrderRow {
  id: number;
  name: string;
  amount_total: number;
  state: string;
  invoice_ids: number[];
}
interface InvoiceRow {
  id: number;
  amount_total: number;
  amount_residual: number;
  payment_state: string;
  state: string;
  move_type: string;
}

/**
 * How much of a sales order has been paid, from its posted customer invoices.
 * `paid_percent` is against the order total so a 30 % advance rule reads
 * naturally even before the final invoice exists.
 */
export async function readOrderPaymentStatus(
  odooOrderId: number,
): Promise<PaymentFact> {
  const orders = (await odooExecute("sale.order", "read", [[odooOrderId]], {
    fields: ["name", "amount_total", "state", "invoice_ids"],
  })) as OrderRow[];
  const order = orders?.[0];
  if (!order) throw new Error(`Odoo sale.order ${odooOrderId} not found`);

  let invoices: InvoiceRow[] = [];
  if (order.invoice_ids?.length) {
    invoices = (await odooExecute(
      "account.move",
      "search_read",
      [
        [
          ["id", "in", order.invoice_ids],
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
        ],
      ],
      {
        fields: [
          "amount_total",
          "amount_residual",
          "payment_state",
          "state",
          "move_type",
        ],
      },
    )) as InvoiceRow[];
  }

  const paid = invoices.reduce(
    (sum, i) => sum + Math.max(0, num(i.amount_total) - num(i.amount_residual)),
    0,
  );
  const total = num(order.amount_total);
  return {
    order_total: total,
    paid_amount: paid,
    paid_percent: total > 0 ? (paid / total) * 100 : 0,
    invoice_count: invoices.length,
  };
}
