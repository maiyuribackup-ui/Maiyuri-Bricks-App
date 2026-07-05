/**
 * Ops-planning service: loads inputs, orchestrates AI advice + deterministic
 * scheduling, persists plans, and reads them back for the calendar/variance.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPlanningAdvice, type AdvisorInput } from "./ai-advisor";
import {
  schedule,
  simulatePromise,
  type DemandOrder,
  type PlanningProduct,
  type SchedulerConfig,
  type PlanItemDraft,
  type OrderPromise,
  type PlanWarning,
} from "./scheduler";
import type { CachedOrderLine } from "./odoo-planning";

export type OpenOrder = {
  odoo_order_id: number;
  name: string;
  partner_name: string | null;
  state: string;
  date_order: string | null;
  commitment_date: string | null;
  amount_total: number | null;
  lines: CachedOrderLine[];
  remaining_units: number;
};

export type PlanningInputs = {
  open_orders: OpenOrder[];
  products: (PlanningProduct & { has_params: boolean })[];
  settings: {
    work_days: number[];
    max_deliveries_per_day: number;
    default_constraints_note: string | null;
  };
  active_plan: { id: string; name: string; horizon_start: string; horizon_end: string } | null;
  stock_synced_at: string | null;
  orders_synced_at: string | null;
};

const todayIST = (): string =>
  new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export async function getPlanningInputs(): Promise<PlanningInputs> {
  const [{ data: cacheRows }, { data: goods }, { data: params }, { data: settingsRow }, { data: active }] =
    await Promise.all([
      supabaseAdmin
        .from("sales_order_cache")
        .select("*")
        .eq("state", "sale")
        .gt("remaining_units", 0)
        .order("date_order", { ascending: true }),
      supabaseAdmin
        .from("finished_goods")
        .select("id, name, stock_qty, stock_synced_at")
        .eq("is_active", true)
        .eq("plan_excluded", false),
      supabaseAdmin.from("product_planning_params").select("*"),
      supabaseAdmin.from("planning_settings").select("*").eq("id", 1).single(),
      supabaseAdmin
        .from("ops_plans")
        .select("id, name, horizon_start, horizon_end")
        .eq("status", "active")
        .maybeSingle(),
    ]);

  const paramsByFg = new Map(
    (params ?? []).map((p) => [p.finished_good_id as string, p]),
  );

  const products = (goods ?? []).map((g) => {
    const p = paramsByFg.get(g.id as string);
    return {
      finished_good_id: g.id as string,
      product_name: g.name as string,
      daily_capacity: Number(p?.daily_capacity_units ?? 0),
      curing_days: Number(p?.curing_days ?? 7),
      stock_qty: Number(g.stock_qty ?? 0),
      has_params: !!p && Number(p.daily_capacity_units) > 0,
    };
  });

  return {
    open_orders: (cacheRows ?? []) as OpenOrder[],
    products,
    settings: {
      work_days: (settingsRow?.work_days as number[]) ?? [1, 2, 3, 4, 5, 6],
      max_deliveries_per_day: Number(settingsRow?.max_deliveries_per_day ?? 4),
      default_constraints_note:
        (settingsRow?.default_constraints_note as string) ?? null,
    },
    active_plan: active
      ? {
          id: active.id as string,
          name: active.name as string,
          horizon_start: active.horizon_start as string,
          horizon_end: active.horizon_end as string,
        }
      : null,
    stock_synced_at: (goods?.[0]?.stock_synced_at as string) ?? null,
    orders_synced_at: (cacheRows?.[0]?.synced_at as string) ?? null,
  };
}

export type DraftPlan = {
  name: string;
  horizon_start: string;
  horizon_end: string;
  constraint_text: string | null;
  selected_order_refs: string[];
  ai_rationale: string;
  ai_used: boolean;
  ai_priorities: unknown;
  items: PlanItemDraft[];
  promises: OrderPromise[];
  warnings: PlanWarning[];
  totals: { production_units: number; production_runs: number; deliveries: number };
};

export async function generateDraftPlan(opts: {
  horizon_days: number;
  constraint_text: string | null;
  selected_order_ids: number[]; // odoo_order_id list; empty = all open
}): Promise<DraftPlan> {
  const inputs = await getPlanningInputs();

  const scope = inputs.open_orders.filter(
    (o) =>
      opts.selected_order_ids.length === 0 ||
      opts.selected_order_ids.includes(o.odoo_order_id),
  );

  const advisorInput: AdvisorInput = {
    start_date: todayIST(),
    horizon_days: opts.horizon_days,
    constraint_text: opts.constraint_text,
    orders: scope.map((o) => ({
      order_ref: o.name,
      customer_name: o.partner_name ?? "Customer",
      date_order: o.date_order,
      commitment_date: o.commitment_date,
      remaining_units: o.remaining_units,
      lines: o.lines
        .filter((l) => l.finished_good_id)
        .map((l) => ({
          product_name: l.product_name,
          remaining: Math.max(0, l.qty_ordered - l.qty_delivered),
        })),
    })),
    products: inputs.products,
  };

  const advice = await getPlanningAdvice(advisorInput);
  const rankByRef = new Map(advice.priorities.map((p) => [p.order_ref, p.rank]));

  const demand: DemandOrder[] = scope.map((o, i) => ({
    order_ref: o.name,
    customer_name: o.partner_name ?? "Customer",
    priority_rank: rankByRef.get(o.name) ?? 1000 + i,
    commitment_date: o.commitment_date,
    lines: o.lines
      .filter((l) => l.finished_good_id)
      .map((l) => ({
        finished_good_id: l.finished_good_id as string,
        product_name: l.product_name,
        remaining: Math.max(0, l.qty_ordered - l.qty_delivered),
      }))
      .filter((l) => l.remaining > 0),
  }));

  const config: SchedulerConfig = {
    start_date: todayIST(),
    horizon_days: opts.horizon_days,
    work_days: inputs.settings.work_days,
    max_deliveries_per_day: inputs.settings.max_deliveries_per_day,
    capacity_overrides: advice.capacity_overrides,
  };

  const result = schedule(inputs.products, demand, config);

  const productionItems = result.items.filter((i) => i.item_type === "production");
  const horizon_end = new Date(
    new Date(`${config.start_date}T00:00:00Z`).getTime() +
      (opts.horizon_days - 1) * 86400000,
  )
    .toISOString()
    .slice(0, 10);

  return {
    name: `Plan ${config.start_date} → ${horizon_end}`,
    horizon_start: config.start_date,
    horizon_end,
    constraint_text: opts.constraint_text,
    selected_order_refs: scope.map((o) => o.name),
    ai_rationale: advice.narrative,
    ai_used: advice.ai_used,
    ai_priorities: advice.priorities,
    items: result.items,
    promises: result.promises,
    warnings: result.warnings,
    totals: {
      production_units: productionItems.reduce((s, i) => s + i.quantity, 0),
      production_runs: productionItems.length,
      deliveries: result.items.filter((i) => i.item_type === "delivery").length,
    },
  };
}

export async function activatePlan(
  draft: DraftPlan,
  userId: string | null,
): Promise<{ plan_id: string }> {
  // Supersede any currently-active plan.
  await supabaseAdmin
    .from("ops_plans")
    .update({ status: "superseded" })
    .eq("status", "active");

  const { data: plan, error } = await supabaseAdmin
    .from("ops_plans")
    .insert({
      name: draft.name,
      horizon_start: draft.horizon_start,
      horizon_end: draft.horizon_end,
      status: "active",
      constraint_text: draft.constraint_text,
      selected_order_refs: draft.selected_order_refs,
      ai_rationale: draft.ai_rationale,
      ai_priorities: draft.ai_priorities,
      warnings: draft.warnings,
      totals: draft.totals,
      created_by: userId,
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !plan) throw new Error(`plan insert failed: ${error?.message}`);

  if (draft.items.length) {
    const { error: itemsErr } = await supabaseAdmin.from("ops_plan_items").insert(
      draft.items.map((i) => ({
        plan_id: plan.id,
        item_type: i.item_type,
        item_date: i.item_date,
        finished_good_id: i.finished_good_id,
        product_name: i.product_name,
        quantity: i.quantity,
        sale_order_ref: i.sale_order_ref,
        customer_name: i.customer_name,
      })),
    );
    if (itemsErr) throw new Error(`plan items insert failed: ${itemsErr.message}`);
  }

  return { plan_id: plan.id as string };
}

export async function getPromiseDate(finishedGoodId: string, qty: number) {
  const inputs = await getPlanningInputs();
  const demand: DemandOrder[] = inputs.open_orders.map((o, i) => ({
    order_ref: o.name,
    customer_name: o.partner_name ?? "Customer",
    priority_rank: i + 1,
    commitment_date: o.commitment_date,
    lines: o.lines
      .filter((l) => l.finished_good_id)
      .map((l) => ({
        finished_good_id: l.finished_good_id as string,
        product_name: l.product_name,
        remaining: Math.max(0, l.qty_ordered - l.qty_delivered),
      }))
      .filter((l) => l.remaining > 0),
  }));

  return simulatePromise(inputs.products, demand, finishedGoodId, qty, {
    start_date: todayIST(),
    horizon_days: 60,
    work_days: inputs.settings.work_days,
    max_deliveries_per_day: inputs.settings.max_deliveries_per_day,
  });
}
