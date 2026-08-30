/**
 * Operations Control — production data access and the rules that are not
 * expressible as constraints (PRD §5, §27, §33).
 *
 * The database owns the invariants that must hold no matter who writes:
 * quantity balance, the draft-only freeze, the atomic post. This module owns
 * the things that need a readable message or a configured value — the bag
 * step, the shortfall proposal, the day view the screen renders from.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";

/** Production planning is internal: sales has no business here. */
export const PRODUCTION_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
] as const;

export interface DayShift {
  id: string;
  shift_no: number;
  planned_manpower: number | null;
  actual_manpower: number | null;
  notes: string | null;
  lock_version: number;
  plan_lines: PlanLine[];
  actuals: ProductionActual[];
}

export interface PlanLine {
  id: string;
  finished_good_id: string;
  product_name: string | null;
  planned_qty: number;
  lock_version: number;
  allocations: Allocation[];
}

export interface Allocation {
  id: string;
  purpose: "sales_order" | "stock";
  so_line_id: string | null;
  order_name: string | null;
  partner_name: string | null;
  stock_ref: string | null;
  planned_qty: number;
  lock_version: number;
}

export interface ProductionActual {
  id: string;
  finished_good_id: string;
  product_name: string | null;
  status: "draft" | "posted" | "adjusted";
  planned_qty_snapshot: number | null;
  gross_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  deviation_reason_id: string | null;
  deviation_comment: string | null;
  posted_at: string | null;
  lock_version: number;
  allocation_actuals: { id: string; allocation_id: string; actual_qty: number }[];
  consumption: { material: string; bags: number }[];
  /** accepted − assigned; the operator must resolve this before posting */
  unassigned_qty: number;
}

/**
 * Everything one production day needs, in one read.
 *
 * The screen is used on a phone in a factory yard (PRD §83), so this
 * deliberately returns the whole day rather than making the client stitch
 * six requests together over a patchy connection.
 */
export async function loadProductionDay(prodDate: string) {
  const { data: day, error: dayError } = await supabaseAdmin
    .from("oc_production_days")
    .select("*")
    .eq("prod_date", prodDate)
    .maybeSingle();
  if (dayError) throw new Error(`Failed to load production day: ${dayError.message}`);
  if (!day) return null;

  const dayRow = day as { id: string };

  const [shiftsRes, goodsRes] = await Promise.all([
    supabaseAdmin
      .from("oc_production_shifts")
      .select("*")
      .eq("day_id", dayRow.id)
      .order("shift_no"),
    supabaseAdmin.from("finished_goods").select("id, name").eq("is_active", true),
  ]);
  if (shiftsRes.error) throw new Error(`Failed to load shifts: ${shiftsRes.error.message}`);

  const productName = new Map(
    ((goodsRes.data ?? []) as { id: string; name: string | null }[]).map((g) => [
      g.id,
      g.name,
    ]),
  );
  const shiftIds = ((shiftsRes.data ?? []) as { id: string }[]).map((s) => s.id);
  if (shiftIds.length === 0) return { ...day, shifts: [] as DayShift[] };

  const [planRes, actualRes] = await Promise.all([
    supabaseAdmin.from("oc_production_plan_lines").select("*").in("shift_id", shiftIds),
    supabaseAdmin.from("oc_production_actuals").select("*").in("shift_id", shiftIds),
  ]);
  if (planRes.error) throw new Error(`Failed to load plan lines: ${planRes.error.message}`);
  if (actualRes.error) throw new Error(`Failed to load actuals: ${actualRes.error.message}`);

  const planLineIds = ((planRes.data ?? []) as { id: string }[]).map((p) => p.id);
  const actualIds = ((actualRes.data ?? []) as { id: string }[]).map((a) => a.id);

  const [allocRes, allocActualRes, consumptionRes] = await Promise.all([
    planLineIds.length
      ? supabaseAdmin
          .from("oc_production_allocations")
          .select("*, oc_sales_order_lines(order_name, partner_name)")
          .in("plan_line_id", planLineIds)
      : Promise.resolve({ data: [], error: null }),
    actualIds.length
      ? supabaseAdmin
          .from("oc_production_allocation_actuals")
          .select("*")
          .in("actual_id", actualIds)
      : Promise.resolve({ data: [], error: null }),
    actualIds.length
      ? supabaseAdmin.from("oc_material_consumption").select("*").in("actual_id", actualIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  type AllocRow = {
    id: string;
    plan_line_id: string;
    purpose: "sales_order" | "stock";
    so_line_id: string | null;
    stock_ref: string | null;
    planned_qty: number;
    lock_version: number;
    oc_sales_order_lines: { order_name: string | null; partner_name: string | null } | null;
  };

  const allocsByPlanLine = new Map<string, Allocation[]>();
  for (const a of (allocRes.data ?? []) as AllocRow[]) {
    const list = allocsByPlanLine.get(a.plan_line_id) ?? [];
    list.push({
      id: a.id,
      purpose: a.purpose,
      so_line_id: a.so_line_id,
      order_name: a.oc_sales_order_lines?.order_name ?? null,
      partner_name: a.oc_sales_order_lines?.partner_name ?? null,
      stock_ref: a.stock_ref,
      planned_qty: Number(a.planned_qty),
      lock_version: a.lock_version,
    });
    allocsByPlanLine.set(a.plan_line_id, list);
  }

  const allocActualsByActual = new Map<
    string,
    { id: string; allocation_id: string; actual_qty: number }[]
  >();
  for (const aa of (allocActualRes.data ?? []) as {
    id: string;
    actual_id: string;
    allocation_id: string;
    actual_qty: number;
  }[]) {
    const list = allocActualsByActual.get(aa.actual_id) ?? [];
    list.push({ id: aa.id, allocation_id: aa.allocation_id, actual_qty: Number(aa.actual_qty) });
    allocActualsByActual.set(aa.actual_id, list);
  }

  const consumptionByActual = new Map<string, { material: string; bags: number }[]>();
  for (const c of (consumptionRes.data ?? []) as {
    actual_id: string;
    material: string;
    bags: number;
  }[]) {
    const list = consumptionByActual.get(c.actual_id) ?? [];
    list.push({ material: c.material, bags: Number(c.bags) });
    consumptionByActual.set(c.actual_id, list);
  }

  const shifts: DayShift[] = ((shiftsRes.data ?? []) as Record<string, never>[]).map(
    (s) => {
      const shift = s as unknown as {
        id: string;
        shift_no: number;
        planned_manpower: number | null;
        actual_manpower: number | null;
        notes: string | null;
        lock_version: number;
      };
      return {
        ...shift,
        plan_lines: ((planRes.data ?? []) as Record<string, never>[])
          .map((p) => p as unknown as {
            id: string;
            shift_id: string;
            finished_good_id: string;
            planned_qty: number;
            lock_version: number;
          })
          .filter((p) => p.shift_id === shift.id)
          .map((p) => ({
            id: p.id,
            finished_good_id: p.finished_good_id,
            product_name: productName.get(p.finished_good_id) ?? null,
            planned_qty: Number(p.planned_qty),
            lock_version: p.lock_version,
            allocations: allocsByPlanLine.get(p.id) ?? [],
          })),
        actuals: ((actualRes.data ?? []) as Record<string, never>[])
          .map((a) => a as unknown as ProductionActual & { shift_id: string })
          .filter((a) => a.shift_id === shift.id)
          .map((a) => {
            const allocationActuals = allocActualsByActual.get(a.id) ?? [];
            const assigned = allocationActuals.reduce((sum, x) => sum + x.actual_qty, 0);
            return {
              ...a,
              product_name: productName.get(a.finished_good_id) ?? null,
              gross_qty: Number(a.gross_qty),
              accepted_qty: Number(a.accepted_qty),
              rejected_qty: Number(a.rejected_qty),
              allocation_actuals: allocationActuals,
              consumption: consumptionByActual.get(a.id) ?? [],
              // What POST will refuse on. Surfaced on the read so the screen
              // can show "assign the remaining N" before the operator tries.
              unassigned_qty: Number(a.accepted_qty) - assigned,
            };
          }),
      };
    },
  );

  return { ...day, shifts };
}

/** The configured bag step and ratio tolerances, with sane fallbacks. */
export async function loadProductionSettings(): Promise<{
  cementBagStep: number;
  amberPct: number;
  redPct: number;
}> {
  const { data } = await supabaseAdmin
    .from("oc_settings")
    .select("cement_bag_step, ratio_amber_tolerance_pct, ratio_red_tolerance_pct")
    .limit(1)
    .maybeSingle();
  const row = data as {
    cement_bag_step: number | null;
    ratio_amber_tolerance_pct: number | null;
    ratio_red_tolerance_pct: number | null;
  } | null;
  return {
    cementBagStep: Number(row?.cement_bag_step ?? 0.5),
    amberPct: Number(row?.ratio_amber_tolerance_pct ?? 5),
    redPct: Number(row?.ratio_red_tolerance_pct ?? 10),
  };
}
