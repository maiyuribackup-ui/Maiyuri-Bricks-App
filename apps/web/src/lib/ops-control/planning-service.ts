/**
 * Operations Control — the planning week, assembled in one read.
 *
 * This is the data behind /ops/plan: a factory week of production plan on one
 * side, the delivery commitments it has to serve on the other, and the
 * arithmetic that says whether the first can meet the second.
 *
 * It reads a lot at once on purpose. A planner opens this screen to decide
 * the week; making them wait through eight sequential round trips is how a
 * planning tool turns back into a spreadsheet.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  addDays,
  assessCommitment,
  cellKey,
  latestProductionDate,
  requirementByDay,
  riskRank,
  weekRangeOf,
  type CommitmentRisk,
  type RequirementSource,
} from "@/lib/ops-control/planning-grid";
import { operationalToday } from "@/lib/ops-control/inventory-service";

/** Planning is internal — the same gate as the rest of production. */
export const PLANNING_ROLES = ["founder", "owner", "production_supervisor"] as const;

/** Factory-wide fallback when a product has no planning params row (PRD §14.5). */
const DEFAULT_CURING_DAYS = 7;

export interface PlanCell {
  finished_good_id: string;
  date: string;
  quantity: number;
  /** false once the day has a posted actual — the plan is history by then */
  editable: boolean;
  /** why it cannot be edited here, for the cell's tooltip */
  locked_reason: string | null;
  /**
   * True when this product is planned in more than one shift that day. The
   * grid works in whole days and does not know how the supervisor divided
   * the total, so it shows the sum and refuses to overwrite it — the save
   * route refuses the same cells, and the two must agree or the screen would
   * offer an edit that silently does nothing.
   */
  split_across_shifts: boolean;
}

export interface CommitmentRow {
  id: string;
  schedule_id: string;
  so_line_id: string;
  finished_good_id: string;
  product_name: string | null;
  order_name: string;
  customer_name: string | null;
  delivery_date: string;
  quantity: number;
  risk: CommitmentRisk;
  shortfall: number;
  produce_by: string;
  timing_only: boolean;
}

export interface UnscheduledRow {
  so_line_id: string;
  finished_good_id: string;
  product_name: string | null;
  order_name: string;
  customer_name: string | null;
  remaining: number;
  /** promised to the customer by an ACTIVE CONFIRMED version */
  scheduled: number;
  /** sitting in an OPEN DRAFT — a date exists, but nobody has been told */
  drafted: number;
  /** what still has no date at all */
  unscheduled: number;
}

async function loadCuringDays(): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin
    .from("product_planning_params")
    .select("finished_good_id, curing_days");
  const out = new Map<string, number>();
  for (const r of (data ?? []) as {
    finished_good_id: string;
    curing_days: number | null;
  }[]) {
    out.set(r.finished_good_id, Number(r.curing_days ?? DEFAULT_CURING_DAYS));
  }
  return out;
}

/**
 * Everything /ops/plan renders, for one factory week.
 *
 * `horizonDays` extends the COMMITMENT lookahead beyond the week being
 * edited. That asymmetry is the point: bricks for a delivery three weeks out
 * may have to be made this week, so the requirement row must see further
 * ahead than the grid does.
 */
export async function loadPlanningWeek(
  anyDateInWeek: string,
  horizonDays = 28,
): Promise<{
  week: { start: string; end: string; days: string[] };
  today: string;
  products: { id: string; name: string | null; curing_days: number }[];
  plan_cells: PlanCell[];
  commitments: CommitmentRow[];
  unscheduled: UnscheduledRow[];
  requirement: { finished_good_id: string; date: string; quantity: number }[];
  overdue: { finished_good_id: string; quantity: number }[];
  beyond: { finished_good_id: string; quantity: number }[];
}> {
  const week = weekRangeOf(anyDateInWeek);
  const today = operationalToday();
  // Commitments are looked at FURTHER AHEAD than the week being edited:
  // bricks for a delivery three weeks out may have to be made this week.
  const horizonEnd = addDays(week.end, horizonDays);

  const [goodsRes, curingDays, daysRes, commitRes] = await Promise.all([
    supabaseAdmin
      .from("finished_goods")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    loadCuringDays(),
    supabaseAdmin
      .from("oc_production_days")
      .select("id, prod_date")
      .gte("prod_date", week.start)
      .lte("prod_date", week.end),
    // Confirmed commitments: the version each schedule currently points at as
    // ACTIVE CONFIRMED. A draft revision does not change what the customer
    // holds, so it must not change what we plan against.
    supabaseAdmin
      .from("oc_delivery_schedules")
      .select("id, order_name, customer_name, active_confirmed_version_id")
      .not("active_confirmed_version_id", "is", null),
  ]);

  const products = ((goodsRes.data ?? []) as { id: string; name: string | null }[]).map(
    (g) => ({ ...g, curing_days: curingDays.get(g.id) ?? DEFAULT_CURING_DAYS }),
  );
  const productName = new Map(products.map((p) => [p.id, p.name]));

  // ------------------------------------------------------------ plan cells
  const dayRows = (daysRes.data ?? []) as { id: string; prod_date: string }[];
  const dateOfDay = new Map(dayRows.map((d) => [d.id, d.prod_date]));
  const dayIds = dayRows.map((d) => d.id);

  const [shiftsRes] = await Promise.all([
    dayIds.length
      ? supabaseAdmin.from("oc_production_shifts").select("id, day_id").in("day_id", dayIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const shiftRows = (shiftsRes.data ?? []) as { id: string; day_id: string }[];
  const dayOfShift = new Map(shiftRows.map((s) => [s.id, s.day_id]));
  const shiftIds = shiftRows.map((s) => s.id);

  const [planRes, actualRes] = await Promise.all([
    shiftIds.length
      ? supabaseAdmin
          .from("oc_production_plan_lines")
          .select("shift_id, finished_good_id, planned_qty")
          .in("shift_id", shiftIds)
      : Promise.resolve({ data: [], error: null }),
    shiftIds.length
      ? supabaseAdmin
          .from("oc_production_actuals")
          .select("shift_id, status")
          .in("shift_id", shiftIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A day with any posted actual is settled: its plan is now history, and
  // the grid must not offer to rewrite it.
  const lockedDates = new Set<string>();
  for (const a of (actualRes.data ?? []) as { shift_id: string; status: string }[]) {
    if (a.status === "draft") continue;
    const date = dateOfDay.get(dayOfShift.get(a.shift_id) ?? "");
    if (date) lockedDates.add(date);
  }

  const planTotals = new Map<string, number>();
  const planLineCount = new Map<string, number>();
  for (const p of (planRes.data ?? []) as {
    shift_id: string;
    finished_good_id: string;
    planned_qty: number;
  }[]) {
    const date = dateOfDay.get(dayOfShift.get(p.shift_id) ?? "");
    if (!date) continue;
    // One grid cell per product per DAY, summed across the day's shifts —
    // the planner thinks in days; shifts are how the yard executes it.
    const key = cellKey(p.finished_good_id, date);
    planTotals.set(key, (planTotals.get(key) ?? 0) + Number(p.planned_qty));
    planLineCount.set(key, (planLineCount.get(key) ?? 0) + 1);
  }

  const plan_cells: PlanCell[] = [...planTotals.entries()].map(([key, quantity]) => {
    const [finished_good_id, date] = key.split("|");
    const split = (planLineCount.get(key) ?? 0) > 1;
    const posted = lockedDates.has(date);
    return {
      finished_good_id,
      date,
      quantity,
      editable: !posted && !split,
      locked_reason: posted
        ? "Production has been posted for this day"
        : split
          ? "Split across shifts — edit on the day screen"
          : null,
      split_across_shifts: split,
    };
  });

  // ---------------------------------------------------------- commitments
  type ScheduleShape = {
    id: string;
    order_name: string;
    customer_name: string | null;
    active_confirmed_version_id: string;
  };
  const schedules = (commitRes.data ?? []) as ScheduleShape[];
  const scheduleOfVersion = new Map(
    schedules.map((s) => [s.active_confirmed_version_id, s]),
  );

  const { data: lineRows } = schedules.length
    ? await supabaseAdmin
        .from("oc_delivery_schedule_lines")
        .select("id, version_id, so_line_id, delivery_date, quantity")
        .in("version_id", [...scheduleOfVersion.keys()])
        .gte("delivery_date", week.start)
        .lte("delivery_date", horizonEnd)
    : { data: [] };

  const flatCommitments = ((lineRows ?? []) as {
    id: string;
    version_id: string;
    so_line_id: string;
    delivery_date: string;
    quantity: number;
  }[]).flatMap((line) => {
    const sched = scheduleOfVersion.get(line.version_id);
    if (!sched) return [];
    return [{
      id: line.id,
      schedule_id: sched.id,
      so_line_id: line.so_line_id,
      order_name: sched.order_name,
      customer_name: sched.customer_name,
      delivery_date: line.delivery_date,
      quantity: Number(line.quantity),
    }];
  });

  const soLineIds = [...new Set(flatCommitments.map((c) => c.so_line_id))];
  const [soLinesRes, reservations] = await Promise.all([
    soLineIds.length
      ? supabaseAdmin
          .from("oc_sales_order_lines")
          .select("id, finished_good_id")
          .in("id", soLineIds)
      : Promise.resolve({ data: [], error: null }),
    loadReservationsFor(soLineIds),
  ]);
  const fgOfSoLine = new Map(
    ((soLinesRes.data ?? []) as { id: string; finished_good_id: string | null }[]).map(
      (l) => [l.id, l.finished_good_id ?? ""],
    ),
  );

  // Planned production per product, by date, over the whole horizon — needed
  // to decide whether a commitment's cover arrives in time. Read separately
  // from the week's cells because a delivery late in the horizon may be
  // served by production planned after this week's grid ends.
  const plannedByProductDate = await loadPlannedByProductDate(week.start, horizonEnd);

  const commitments: CommitmentRow[] = flatCommitments.map((c) => {
    const fg = fgOfSoLine.get(c.so_line_id) ?? "";
    const curing = curingDays.get(fg) ?? DEFAULT_CURING_DAYS;
    const produceBy = latestProductionDate(c.delivery_date, curing);
    const res = reservations.get(c.so_line_id) ?? [];

    const readyNow = res
      .filter((r) => r.available_from === null || r.available_from <= today)
      .reduce((n, r) => n + r.quantity, 0);
    const readyByDate = res
      .filter((r) => r.available_from === null || r.available_from <= c.delivery_date)
      .reduce((n, r) => n + r.quantity, 0);
    const curingLate = res
      .filter((r) => r.available_from !== null && r.available_from > c.delivery_date)
      .reduce((n, r) => n + r.quantity, 0);

    let plannedInTime = 0;
    let plannedTooLate = 0;
    for (const [date, qty] of plannedByProductDate.get(fg) ?? []) {
      if (date <= produceBy) plannedInTime += qty;
      else plannedTooLate += qty;
    }

    const a = assessCommitment({
      deliveryDate: c.delivery_date,
      quantity: c.quantity,
      curingDays: curing,
      readyNow,
      readyByDate,
      curingLate,
      plannedInTime,
      plannedTooLate,
    });

    return {
      ...c,
      finished_good_id: fg,
      product_name: productName.get(fg) ?? null,
      risk: a.risk,
      shortfall: a.shortfall,
      produce_by: a.produceBy,
      timing_only: a.timingOnly,
    };
  });

  commitments.sort(
    (a, b) =>
      riskRank(a.risk) - riskRank(b.risk) ||
      a.delivery_date.localeCompare(b.delivery_date) ||
      a.order_name.localeCompare(b.order_name),
  );

  // ------------------------------------------------------- requirement row
  const sources: RequirementSource[] = commitments
    .filter((c) => c.shortfall > 0)
    .map((c) => ({
      finishedGoodId: c.finished_good_id,
      deliveryDate: c.delivery_date,
      outstanding: c.shortfall,
      curingDays: curingDays.get(c.finished_good_id) ?? DEFAULT_CURING_DAYS,
    }));
  const req = requirementByDay(sources, week.days);

  return {
    week,
    today,
    products,
    plan_cells,
    commitments,
    unscheduled: await loadUnscheduled(),
    requirement: [...req.byProductDay.entries()].map(([key, quantity]) => {
      const [finished_good_id, date] = key.split("|");
      return { finished_good_id, date, quantity };
    }),
    overdue: [...req.overdueByProduct.entries()].map(([finished_good_id, quantity]) => ({
      finished_good_id,
      quantity,
    })),
    beyond: [...req.beyondByProduct.entries()].map(([finished_good_id, quantity]) => ({
      finished_good_id,
      quantity,
    })),
  };
}

async function loadReservationsFor(soLineIds: string[]) {
  const { loadReservationsBySoLine } = await import(
    "@/lib/ops-control/inventory-service"
  );
  return loadReservationsBySoLine(soLineIds);
}

/** Planned quantity per product per date across an arbitrary range. */
async function loadPlannedByProductDate(
  from: string,
  to: string,
): Promise<Map<string, Map<string, number>>> {
  const { data: days } = await supabaseAdmin
    .from("oc_production_days")
    .select("id, prod_date")
    .gte("prod_date", from)
    .lte("prod_date", to);
  const dayRows = (days ?? []) as { id: string; prod_date: string }[];
  if (dayRows.length === 0) return new Map();

  const { data: shifts } = await supabaseAdmin
    .from("oc_production_shifts")
    .select("id, day_id")
    .in("day_id", dayRows.map((d) => d.id));
  const shiftRows = (shifts ?? []) as { id: string; day_id: string }[];
  if (shiftRows.length === 0) return new Map();

  const { data: lines } = await supabaseAdmin
    .from("oc_production_plan_lines")
    .select("shift_id, finished_good_id, planned_qty")
    .in("shift_id", shiftRows.map((s) => s.id));

  const dateOfDay = new Map(dayRows.map((d) => [d.id, d.prod_date]));
  const dayOfShift = new Map(shiftRows.map((s) => [s.id, s.day_id]));

  const out = new Map<string, Map<string, number>>();
  for (const l of (lines ?? []) as {
    shift_id: string;
    finished_good_id: string;
    planned_qty: number;
  }[]) {
    const date = dateOfDay.get(dayOfShift.get(l.shift_id) ?? "");
    if (!date) continue;
    const byDate = out.get(l.finished_good_id) ?? new Map<string, number>();
    byDate.set(date, (byDate.get(date) ?? 0) + Number(l.planned_qty));
    out.set(l.finished_good_id, byDate);
  }
  return out;
}

/**
 * Demand that has been sold but never put on a delivery date.
 *
 * This is the other half of "don't miss a commitment": a promise nobody has
 * scheduled cannot show as at-risk, because as far as the schedule is
 * concerned it does not exist. It is invisible rather than red, which is
 * worse.
 */
async function loadUnscheduled(): Promise<UnscheduledRow[]> {
  const { data: lines } = await supabaseAdmin
    .from("oc_sales_order_lines")
    .select(
      "id, finished_good_id, product_name, order_name, partner_name, qty_ordered, qty_delivered",
    )
    .eq("is_demand", true)
    .eq("source_active", true)
    .limit(1000);

  const rows = (lines ?? []) as {
    id: string;
    finished_good_id: string | null;
    product_name: string | null;
    order_name: string;
    partner_name: string | null;
    qty_ordered: number;
    qty_delivered: number;
  }[];
  const open = rows.filter(
    (l) => l.finished_good_id && Number(l.qty_ordered) - Number(l.qty_delivered) > 0,
  );
  if (open.length === 0) return [];

  // Two different facts, kept apart on purpose.
  //
  // SCHEDULED is what an ACTIVE CONFIRMED version promises: a commitment.
  // DRAFTED is what sits in an open draft: a date exists, but no customer has
  // been told anything.
  //
  // Both must be subtracted from what still needs a date, or a line placed
  // into a draft would keep appearing as unscheduled and get placed twice.
  // But they must not be merged, because only one of them is a promise.
  const { data: sched } = await supabaseAdmin
    .from("oc_delivery_schedules")
    .select("id, active_confirmed_version_id");
  const scheduleRows = (sched ?? []) as {
    id: string;
    active_confirmed_version_id: string | null;
  }[];
  const confirmedVersionIds = scheduleRows
    .map((s) => s.active_confirmed_version_id)
    .filter((v): v is string => Boolean(v));

  const { data: draftVersions } = scheduleRows.length
    ? await supabaseAdmin
        .from("oc_delivery_schedule_versions")
        .select("id")
        .in("schedule_id", scheduleRows.map((s) => s.id))
        .eq("status", "draft")
    : { data: [] };
  const draftVersionIds = ((draftVersions ?? []) as { id: string }[]).map((v) => v.id);

  const allVersionIds = [...confirmedVersionIds, ...draftVersionIds];
  const { data: schedLines } = allVersionIds.length
    ? await supabaseAdmin
        .from("oc_delivery_schedule_lines")
        .select("so_line_id, quantity, version_id")
        .in("version_id", allVersionIds)
    : { data: [] };

  const confirmedSet = new Set(confirmedVersionIds);
  const scheduledBySoLine = new Map<string, number>();
  const draftedBySoLine = new Map<string, number>();
  for (const line of (schedLines ?? []) as {
    so_line_id: string;
    quantity: number;
    version_id: string;
  }[]) {
    const target = confirmedSet.has(line.version_id)
      ? scheduledBySoLine
      : draftedBySoLine;
    target.set(
      line.so_line_id,
      (target.get(line.so_line_id) ?? 0) + Number(line.quantity),
    );
  }

  return open
    .map((l) => {
      const remaining = Number(l.qty_ordered) - Number(l.qty_delivered);
      const scheduled = scheduledBySoLine.get(l.id) ?? 0;
      const drafted = draftedBySoLine.get(l.id) ?? 0;
      return {
        so_line_id: l.id,
        finished_good_id: l.finished_good_id as string,
        product_name: l.product_name,
        order_name: l.order_name,
        customer_name: l.partner_name,
        remaining,
        scheduled,
        drafted,
        unscheduled: Math.max(0, remaining - scheduled - drafted),
      };
    })
    .filter((r) => r.unscheduled > 0 || r.drafted > 0)
    .sort((a, b) => b.unscheduled - a.unscheduled || b.drafted - a.drafted);
}
