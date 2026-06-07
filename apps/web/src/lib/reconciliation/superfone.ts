/**
 * Superfone call-log ↔ CRM lead reconciliation.
 *
 * Pure helpers (no I/O) so the matching logic is unit-testable. Phone numbers
 * are matched on their last 10 digits to ignore +91 / 0 prefixes and spacing.
 */

/** Reduce a raw phone string to a comparable key (last 10 digits). */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Minimal CSV parser: handles quoted fields, escaped quotes ("") and CRLF. */
export function parseCsv(text: string): {
  headers: string[];
  rows: string[][];
} {
  const all: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      all.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    all.push(row);
  }

  const headers = (all.shift() ?? []).map((h) => h.trim());
  const rows = all.filter((r) => r.some((v) => v.trim() !== ""));
  return { headers, rows };
}

/** Index of the first header matching any pattern, or -1. */
export function detectColumn(headers: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex((h) => p.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

export interface CallGap {
  phone: string;
  name: string | null;
  calls: number;
  lastCallAt: string | null;
}

export interface ReconcileResult {
  totalCalls: number;
  uniqueCallers: number;
  matched: number;
  callsWithoutLead: CallGap[];
}

/**
 * Compare call records against the set of normalized lead phone numbers.
 * Returns unique callers that have no matching lead, busiest first.
 */
export function reconcile(
  calls: { phone: string; name?: string | null; at?: string | null }[],
  leadPhones: Set<string>,
): ReconcileResult {
  const byPhone = new Map<string, CallGap>();
  let totalCalls = 0;

  for (const call of calls) {
    const phone = normalizePhone(call.phone);
    if (!phone) continue;
    totalCalls++;
    const existing = byPhone.get(phone);
    if (existing) {
      existing.calls++;
      if (call.at && (!existing.lastCallAt || call.at > existing.lastCallAt)) {
        existing.lastCallAt = call.at;
      }
      if (!existing.name && call.name) existing.name = call.name;
    } else {
      byPhone.set(phone, {
        phone,
        name: call.name ?? null,
        calls: 1,
        lastCallAt: call.at ?? null,
      });
    }
  }

  let matched = 0;
  const callsWithoutLead: CallGap[] = [];
  for (const gap of byPhone.values()) {
    if (leadPhones.has(gap.phone)) matched++;
    else callsWithoutLead.push(gap);
  }
  callsWithoutLead.sort((a, b) => b.calls - a.calls);

  return {
    totalCalls,
    uniqueCallers: byPhone.size,
    matched,
    callsWithoutLead,
  };
}
