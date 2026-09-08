export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logOcAudit } from "@/lib/ops-control/audit";
import { PLANNING_ROLES } from "@/lib/ops-control/planning-service";
import { weekDays } from "@/lib/ops-control/planning-grid";
import { saveOcPlanCellsSchema } from "@maiyuri/shared";

/**
 * PUT /api/ops-control/planning/production-cells
 *
 * Save a week's worth of edited production-plan cells in one request. This
 * is the whole reason the grid exists: planning ten days across four
 * products should be one save, not forty.
 *
 * WHAT THIS DELIBERATELY REFUSES TO DO:
 *
 *  - Touch a day that already has a POSTED actual. By then the plan is
 *    history, and history is what the variance report is measured against.
 *  - Overwrite a product whose day is SPLIT ACROSS SHIFTS. The grid works in
 *    whole days; how a supervisor divided 1,800 between two shifts is
 *    information this screen does not have, and guessing at it (half each?
 *    all in shift 1?) would silently rewrite someone's plan. Those cells are
 *    returned as skipped, with the day screen named as the place to edit
 *    them.
 *
 * ON ATOMICITY: this performs several writes without a wrapping transaction,
 * which the PRD (§8.3) requires for anything with side effects. Plan lines
 * have none — no inventory, no reservations, no labour; only POST does that
 * — and every write here is idempotent, so a partial failure is repaired by
 * pressing Save again. The response says exactly which cells were applied so
 * a partial result is visible rather than assumed.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireProductionRole(request, PLANNING_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, saveOcPlanCellsSchema);
    if (parsed.error) return parsed.error;
    const { week_start, cells } = parsed.data;

    // Every cell must belong to the week it claims to. Without this a stale
    // browser tab could write last week's grid over this week's.
    const days = new Set(weekDays(week_start));
    const stray = cells.find((c) => !days.has(c.date));
    if (stray) {
      return error(
        `${stray.date} is not in the week beginning ${week_start}`,
        400,
      );
    }

    const dates = [...new Set(cells.map((c) => c.date))].sort();

    // ------------------------------------------------ open the missing days
    const { data: existingDays, error: dayErr } = await supabaseAdmin
      .from("oc_production_days")
      .select("id, prod_date")
      .in("prod_date", dates);
    if (dayErr) return error(`Failed to read production days: ${dayErr.message}`, 500);

    const dayByDate = new Map(
      ((existingDays ?? []) as { id: string; prod_date: string }[]).map((d) => [
        d.prod_date,
        d.id,
      ]),
    );

    const missing = dates.filter((d) => !dayByDate.has(d));
    if (missing.length > 0) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from("oc_production_days")
        .insert(
          missing.map((prod_date) => ({
            prod_date,
            planned_shift_count: 1,
            created_by: auth.user.id,
          })),
        )
        .select("id, prod_date");
      if (createErr) {
        return error(`Failed to open production days: ${createErr.message}`, 400);
      }
      const newDays = (created ?? []) as { id: string; prod_date: string }[];
      for (const d of newDays) dayByDate.set(d.prod_date, d.id);
      // A day without a shift cannot hold a plan line.
      const { error: shiftErr } = await supabaseAdmin
        .from("oc_production_shifts")
        .insert(newDays.map((d) => ({ day_id: d.id, shift_no: 1 })));
      if (shiftErr) return error(`Failed to open shifts: ${shiftErr.message}`, 400);
    }

    const dayIds = [...dayByDate.values()];
    const { data: shiftRows, error: shiftReadErr } = await supabaseAdmin
      .from("oc_production_shifts")
      .select("id, day_id, shift_no")
      .in("day_id", dayIds)
      .order("shift_no");
    if (shiftReadErr) {
      return error(`Failed to read shifts: ${shiftReadErr.message}`, 500);
    }
    const shifts = (shiftRows ?? []) as { id: string; day_id: string; shift_no: number }[];
    const shiftsByDay = new Map<string, typeof shifts>();
    for (const s of shifts) {
      const list = shiftsByDay.get(s.day_id) ?? [];
      list.push(s);
      shiftsByDay.set(s.day_id, list);
    }
    const shiftIds = shifts.map((s) => s.id);

    // ------------------------------------------- what is already off-limits
    const [{ data: actualRows }, { data: planRows }] = await Promise.all([
      supabaseAdmin
        .from("oc_production_actuals")
        .select("shift_id, status")
        .in("shift_id", shiftIds.length ? shiftIds : ["-"]),
      supabaseAdmin
        .from("oc_production_plan_lines")
        .select("id, shift_id, finished_good_id, planned_qty")
        .in("shift_id", shiftIds.length ? shiftIds : ["-"]),
    ]);

    const dayOfShift = new Map(shifts.map((s) => [s.id, s.day_id]));
    const dateOfDay = new Map([...dayByDate.entries()].map(([date, id]) => [id, date]));

    const postedDates = new Set<string>();
    for (const a of (actualRows ?? []) as { shift_id: string; status: string }[]) {
      if (a.status === "draft") continue;
      const date = dateOfDay.get(dayOfShift.get(a.shift_id) ?? "");
      if (date) postedDates.add(date);
    }

    type PlanRow = {
      id: string;
      shift_id: string;
      finished_good_id: string;
      planned_qty: number;
    };
    const existingByCell = new Map<string, PlanRow[]>();
    for (const p of (planRows ?? []) as PlanRow[]) {
      const date = dateOfDay.get(dayOfShift.get(p.shift_id) ?? "");
      if (!date) continue;
      const key = `${p.finished_good_id}|${date}`;
      const list = existingByCell.get(key) ?? [];
      list.push(p);
      existingByCell.set(key, list);
    }

    // ------------------------------------------------------ apply the cells
    const skipped: { finished_good_id: string; date: string; reason: string }[] = [];
    let written = 0;
    let cleared = 0;

    for (const cell of cells) {
      const key = `${cell.finished_good_id}|${cell.date}`;
      const existing = existingByCell.get(key) ?? [];

      if (postedDates.has(cell.date)) {
        skipped.push({
          finished_good_id: cell.finished_good_id,
          date: cell.date,
          reason: `${cell.date} has posted production — its plan is history now`,
        });
        continue;
      }
      if (existing.length > 1) {
        skipped.push({
          finished_good_id: cell.finished_good_id,
          date: cell.date,
          reason: `${cell.date} splits this product across ${existing.length} shifts — edit it on the day screen so the split is kept`,
        });
        continue;
      }

      if (cell.quantity <= 0) {
        if (existing.length === 1) {
          const { error: delErr } = await supabaseAdmin
            .from("oc_production_plan_lines")
            .delete()
            .eq("id", existing[0].id);
          if (delErr) {
            return error(`Failed to clear ${cell.date}: ${delErr.message}`, 400);
          }
          cleared += 1;
        }
        continue;
      }

      if (existing.length === 1) {
        const { error: updErr } = await supabaseAdmin
          .from("oc_production_plan_lines")
          .update({ planned_qty: cell.quantity })
          .eq("id", existing[0].id);
        if (updErr) {
          return error(`Failed to save ${cell.date}: ${updErr.message}`, 400);
        }
      } else {
        const dayId = dayByDate.get(cell.date);
        const shift = (shiftsByDay.get(dayId ?? "") ?? [])[0];
        if (!shift) {
          skipped.push({
            finished_good_id: cell.finished_good_id,
            date: cell.date,
            reason: `${cell.date} has no shift to plan into`,
          });
          continue;
        }
        const { error: insErr } = await supabaseAdmin
          .from("oc_production_plan_lines")
          .insert({
            shift_id: shift.id,
            finished_good_id: cell.finished_good_id,
            planned_qty: cell.quantity,
          });
        if (insErr) {
          return error(`Failed to save ${cell.date}: ${insErr.message}`, 400);
        }
      }
      written += 1;
    }

    await logOcAudit({
      entity: "oc_production_plan_lines",
      entity_id: week_start,
      action: "updated",
      after_value: { week_start, written, cleared, skipped: skipped.length },
      performed_by: auth.user.id,
    });

    return success({ written, cleared, skipped });
  } catch (err) {
    console.error("[OpsControl] planning production-cells PUT failed:", err);
    return error("Failed to save the production plan", 500);
  }
}
