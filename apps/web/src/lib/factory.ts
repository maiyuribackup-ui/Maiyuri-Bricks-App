/**
 * Factory Ledger shared helpers.
 *
 * Sat–Fri reporting weeks, product metadata derived from SKU codes, row-label
 * composers, and the picklist enums shared by Zod schemas and UI pickers.
 * Mirrors public.factory_week_start() in the database.
 *
 * A pure copy of this file lives at apps/native/src/lib/factory.ts (the native
 * app has a standalone node_modules tree) — keep the two in sync.
 */

/** Parse 'YYYY-MM-DD' by components. NEVER new Date('YYYY-MM-DD') — that
 * parses as UTC midnight, which is the previous day in IST and silently
 * shifts Sat/Fri week boundaries. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Sat–Fri reporting week: the Saturday on or before the given date.
 * JS getDay(): Sun=0 … Sat=6 → offset (day+1)%7 (Sat→0, Sun→1, Fri→6). */
export function factoryWeekStart(iso: string): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return toISODate(d);
}

/** Friday that ends the Sat–Fri week containing the given date. */
export function factoryWeekEnd(iso: string): string {
  const d = parseISODate(factoryWeekStart(iso));
  d.setDate(d.getDate() + 6);
  return toISODate(d);
}

/** 'DD/MM' for composed row labels ("04/08 Umapathi Sriperumbudur 1000 CIB-6"). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ---------------------------------------------------------------- products

export type FactoryProductCode = 'MIB-8' | 'MIB-6' | 'CIB-8' | 'CIB-6';

export const FACTORY_PRODUCT_CODES: FactoryProductCode[] = [
  'MIB-8',
  'MIB-6',
  'CIB-8',
  'CIB-6',
];

/** Type, size and labour rate derive from the code — never stored.
 * 8" bricks pay ₹7/brick, 6" pay ₹6. Loading is ₹3/brick for every size. */
export function productMeta(code: FactoryProductCode): {
  type: 'MIB' | 'CIB';
  size: '8"' | '6"';
  labourRate: 7 | 6;
} {
  const size = code.endsWith('8') ? '8"' : '6"';
  return {
    type: code.startsWith('MIB') ? 'MIB' : 'CIB',
    size,
    labourRate: size === '8"' ? 7 : 6,
  };
}

export const LOADING_RATE_PER_BRICK = 3;

// ----------------------------------------------------------------- enums

export const DOWNTIME_REASONS = [
  'None',
  'Power Cut',
  'Machine Breakdown',
  'Raw Material Shortage',
  'Labour Shortage',
  'Dye / Profile Change',
  'Payment Issue',
  'Holiday',
  'Other',
] as const;

export const DATA_FLAGS_PRODUCTION = ['OK', 'Estimated', 'Check - sources disagree'] as const;
export const DATA_FLAGS_DELIVERY = ['OK', 'Check - sources disagree', 'Qty to confirm'] as const;
export const DELIVERY_STATUSES = ['Planned', 'Delivered', 'Postponed', 'Cancelled'] as const;
export const PAYMENT_STATUSES = ['Clear', 'Hold - Payment', 'Cancelled'] as const;
export const VEHICLES = ['407 Eicher', '439 RDX Tractor', 'Tricycle', 'Other'] as const;
export const WORK_TYPES = ['Loading', 'Production 6"', 'Production 8"', 'NMR Daily', 'Advance'] as const;
export const ASSET_CATEGORIES = [
  'Machinery',
  'Machinery Tools',
  'Mechanical Tools',
  'Vehicles',
  'Construction Tools',
  'Electrical & Electronic Tools',
] as const;
export const ASSET_LOCATIONS = ['Plant', 'RTO', 'VM', 'Split - see notes', 'Unknown'] as const;

// ---------------------------------------------------------- label composers
// Row identity is composed from the row's own data — no hand-typed codes.

export function deliveryLabel(d: {
  delivery_date: string;
  customer_name: string;
  qty: number;
  product_code: string;
}): string {
  return `${shortDate(d.delivery_date)} ${d.customer_name} ${d.qty} ${d.product_code}`;
}

export function orderLabel(o: {
  customer_name: string;
  qty_ordered: number;
  product_code: string;
}): string {
  return `${o.customer_name} - ${o.qty_ordered} ${o.product_code}`;
}

export function productionLabel(r: { log_date: string; product_code: string }): string {
  return `${shortDate(r.log_date)} ${r.product_code}`;
}

export function labourLabel(l: {
  work_date: string;
  worker: string;
  work_type: string;
}): string {
  return `${shortDate(l.work_date)} ${l.worker} - ${l.work_type}`;
}
