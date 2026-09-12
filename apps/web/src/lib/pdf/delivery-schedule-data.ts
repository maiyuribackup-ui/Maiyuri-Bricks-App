/**
 * Delivery-schedule PDF — data assembly, separated from rendering (the
 * QuoteDocument pattern).
 *
 * THE WHITELIST IS THE POINT. PRD §15: the customer document must never
 * expose trip numbers, other customers, vehicle utilisation, production
 * allocation, internal notes or labour information. This builder's output
 * type is the complete set of what the PDF may know; everything it contains
 * comes from the version's customer_snapshot and its lines — never from
 * mutable masters — so a version's PDF is reproducible forever (PRD §87).
 */

export interface DeliveryScheduleLineData {
  productName: string;
  deliveryDate: string; // YYYY-MM-DD
  quantity: number;
}

export interface DeliveryScheduleDocumentData {
  orderName: string;
  versionNo: number;
  /** customer-facing wording, not internal workflow states */
  statusLabel: string;
  customerName: string | null;
  siteName: string | null;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  lines: DeliveryScheduleLineData[];
  totalScheduled: number;
  totalOrdered: number | null;
  generatedOn: string; // YYYY-MM-DD
}

interface VersionInput {
  version_no: number;
  status: string;
  customer_snapshot: Record<string, unknown> | null;
  lines: {
    product_name: string | null;
    delivery_date: string;
    quantity: number;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Proposed",
  sent: "Awaiting your confirmation",
  confirmed: "Confirmed",
  revision_requested: "Under revision",
  superseded: "Superseded by a later version",
  cancelled: "Cancelled",
};

export function buildDeliveryScheduleData(
  version: VersionInput,
  options: { totalOrdered?: number | null; generatedOn: string },
): DeliveryScheduleDocumentData {
  const snap = version.customer_snapshot ?? {};
  const str = (key: string): string | null => {
    const v = snap[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const lines = [...version.lines]
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    .map((l) => ({
      productName: l.product_name ?? "—",
      deliveryDate: l.delivery_date,
      quantity: Number(l.quantity),
    }));

  return {
    orderName: str("order_name") ?? "—",
    versionNo: version.version_no,
    statusLabel: STATUS_LABELS[version.status] ?? version.status,
    customerName: str("customer_name"),
    siteName: str("site_name"),
    address: str("address"),
    contactName: str("contact_name"),
    phone: str("phone"),
    lines,
    totalScheduled: lines.reduce((a, l) => a + l.quantity, 0),
    totalOrdered: options.totalOrdered ?? null,
    generatedOn: options.generatedOn,
  };
}

/** `Maiyuri_Delivery_Schedule_SO1254_V2.pdf` (PRD §87). */
export function deliveryScheduleFilename(orderName: string, versionNo: number): string {
  const safe = orderName.replace(/[^A-Za-z0-9]/g, "");
  return `Maiyuri_Delivery_Schedule_${safe}_V${versionNo}.pdf`;
}

/** '2026-08-28' -> '28 Aug 2026' without Date-parsing pitfalls (IST shift). */
export function formatScheduleDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}
