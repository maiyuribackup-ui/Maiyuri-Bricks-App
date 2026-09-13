/**
 * Operations Control — labour data access (PRD §57–§68).
 *
 * Generation and settlement are SQL, because both must be atomic. This module
 * reads: a week's ledger with its settlement, and the work that happened but
 * could not be priced.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  summariseWeek,
  summariseUnpriced,
  type LedgerEntry,
  type UnpricedWork,
} from "@/lib/ops-control/labour";

/** Labour is a money question: founder and owner only, not the supervisor. */
export const LABOUR_READ_ROLES = ["founder", "owner"] as const;
/** Approving and locking a settlement is the same set — it commits payment. */
export const LABOUR_SETTLE_ROLES = ["founder", "owner"] as const;

export async function loadLabourWeek(weekStart: string) {
  const [entriesRes, settlementRes, goodsRes] = await Promise.all([
    supabaseAdmin
      .from("oc_labour_ledger")
      .select("*")
      .eq("week_start", weekStart)
      .order("entry_date"),
    supabaseAdmin
      .from("oc_labour_settlements")
      .select("*")
      .eq("week_start", weekStart)
      .maybeSingle(),
    supabaseAdmin.from("finished_goods").select("id, name"),
  ]);
  if (entriesRes.error)
    throw new Error(`Failed to load labour ledger: ${entriesRes.error.message}`);

  const productName = new Map(
    ((goodsRes.data ?? []) as { id: string; name: string | null }[]).map((g) => [
      g.id,
      g.name,
    ]),
  );
  const entries = ((entriesRes.data ?? []) as LedgerEntry[]).map((e) => ({
    ...e,
    eligible_qty: Number(e.eligible_qty),
    rate_applied: Number(e.rate_applied),
    amount: Number(e.amount),
    product_name: productName.get(e.finished_good_id) ?? null,
  }));

  return {
    summary: summariseWeek(weekStart, entries),
    entries,
    settlement: settlementRes.data ?? null,
  };
}

/**
 * Work that happened but has no ledger entry — i.e. no rate was configured
 * for that product and activity on that date.
 *
 * Found by anti-joining the ledger rather than by a flag, so it stays true
 * even after a rate is added and the work is generated retrospectively: the
 * row simply stops appearing.
 */
export async function loadUnpricedWork(from: string, to: string) {
  const { data, error } = await supabaseAdmin.rpc("oc_unpriced_labour", {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`Failed to load unpriced work: ${error.message}`);

  const rows = (data ?? []) as UnpricedWork[];
  return { rows, summary: summariseUnpriced(rows) };
}
