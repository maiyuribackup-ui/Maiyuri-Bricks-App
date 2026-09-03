/**
 * Auto-variance: when real work is reported through the existing production /
 * delivery flows, find the corresponding item in the ACTIVE plan and record
 * the actual against it — variance appears with zero extra data entry.
 * Best-effort by design: failures log and never break the reporting request.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

async function activePlanId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("ops_plans")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * A production order's actual_quantity was reported. Match it to the active
 * plan's production item for the same product on the order's scheduled date
 * (falling back to the earliest still-open production item for that product).
 */
export async function matchProductionActual(order: {
  finished_good_id: string | null;
  scheduled_date: string | null;
  actual_quantity: number | null;
}): Promise<void> {
  try {
    if (!order.finished_good_id || order.actual_quantity == null) return;
    const planId = await activePlanId();
    if (!planId) return;

    const date = order.scheduled_date?.slice(0, 10);
    let query = supabaseAdmin
      .from("ops_plan_items")
      .select("id, quantity")
      .eq("plan_id", planId)
      .eq("item_type", "production")
      .eq("finished_good_id", order.finished_good_id)
      .in("status", ["planned", "partial"])
      .order("item_date", { ascending: true })
      .limit(1);
    if (date) query = query.eq("item_date", date);

    let { data: items } = await query;
    if (!items?.length && date) {
      // No exact-date match — fall back to the earliest open item.
      const fallback = await supabaseAdmin
        .from("ops_plan_items")
        .select("id, quantity")
        .eq("plan_id", planId)
        .eq("item_type", "production")
        .eq("finished_good_id", order.finished_good_id)
        .in("status", ["planned", "partial"])
        .order("item_date", { ascending: true })
        .limit(1);
      items = fallback.data;
    }
    const item = items?.[0];
    if (!item) return;

    const actual = Number(order.actual_quantity);
    await supabaseAdmin
      .from("ops_plan_items")
      .update({
        actual_quantity: actual,
        status: actual >= Number(item.quantity) ? "done" : "partial",
        notes: "auto-matched from production report",
      })
      .eq("id", item.id);
  } catch (err) {
    console.error("variance match (production) failed:", err);
  }
}

/**
 * A delivery was completed. Match by the Odoo sale-order reference the plan
 * items carry (sale_order_ref == deliveries.odoo_sale_name / origin).
 */
export async function matchDeliveryDone(delivery: {
  odoo_sale_name?: string | null;
  origin?: string | null;
  total_quantity?: number | null;
}): Promise<void> {
  try {
    const ref = delivery.odoo_sale_name ?? delivery.origin;
    if (!ref) return;
    const planId = await activePlanId();
    if (!planId) return;

    const { data: items } = await supabaseAdmin
      .from("ops_plan_items")
      .select("id, quantity")
      .eq("plan_id", planId)
      .eq("item_type", "delivery")
      .eq("sale_order_ref", ref)
      .in("status", ["planned", "moved"])
      .limit(1);
    const item = items?.[0];
    if (!item) return;

    await supabaseAdmin
      .from("ops_plan_items")
      .update({
        actual_quantity: delivery.total_quantity ?? item.quantity,
        status: "done",
        notes: "auto-matched from delivery completion",
      })
      .eq("id", item.id);
  } catch (err) {
    console.error("variance match (delivery) failed:", err);
  }
}
