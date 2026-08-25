/**
 * Deterministic production & delivery scheduler.
 *
 * Pure module — no I/O, no Date.now() (caller supplies start date) — so every
 * business rule is unit-testable:
 *   - per-product daily capacity (with per-date overrides / blocked days)
 *   - curing: units produced on day D are dispatchable from D + curing_days
 *   - working days only (default Mon–Sat; Sundays never produce or deliver)
 *   - stock on hand is dispatchable immediately
 *   - one delivery per order, scheduled when ALL its lines are ready
 *   - deliveries-per-day cap
 *   - per-order promised delivery date + lateness vs Odoo commitment_date
 *
 * The AI advisor only influences `priority_rank` and `capacity_overrides` —
 * this module enforces the hard constraints regardless.
 */

export type PlanningProduct = {
  finished_good_id: string;
  product_name: string;
  daily_capacity: number;
  curing_days: number;
  stock_qty: number;
};

export type DemandLine = {
  finished_good_id: string;
  product_name: string;
  remaining: number;
};

export type DemandOrder = {
  order_ref: string;
  customer_name: string;
  /** 1 = plan first. Ties broken by commitment/order date by the caller. */
  priority_rank: number;
  commitment_date?: string | null;
  lines: DemandLine[];
};

export type CapacityOverride = {
  date: string; // yyyy-mm-dd
  finished_good_id?: string; // absent = all products
  capacity?: number; // absolute units for that day
  blocked?: boolean; // no production at all
};

export type SchedulerConfig = {
  start_date: string; // yyyy-mm-dd — first day production may be scheduled
  horizon_days: number; // items emitted only within this window
  work_days: number[]; // ISO weekday numbers, 1=Mon … 7=Sun
  max_deliveries_per_day: number;
  capacity_overrides?: CapacityOverride[];
  /** How far past the horizon promise dates may search. Default 120 days. */
  max_lookahead_days?: number;
};

export type PlanItemDraft = {
  item_type: "production" | "delivery";
  item_date: string;
  finished_good_id: string | null;
  product_name: string;
  quantity: number;
  sale_order_ref: string;
  customer_name: string;
};

export type OrderPromise = {
  order_ref: string;
  customer_name: string;
  promised_delivery_date: string | null;
  late_vs_commitment: boolean;
  unfulfilled_units: number;
};

export type PlanWarning = {
  type: "late_order" | "beyond_horizon" | "unfulfillable" | "no_capacity";
  message: string;
  order_ref?: string;
};

export type ScheduleResult = {
  items: PlanItemDraft[];
  promises: OrderPromise[];
  warnings: PlanWarning[];
};

// ---------- date helpers (UTC-safe on yyyy-mm-dd strings) ----------

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1=Mon … 7=Sun. */
export function isoWeekday(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=Sun
  return day === 0 ? 7 : day;
}

function nextWorkday(iso: string, workDays: number[]): string {
  let d = iso;
  for (let i = 0; i < 8; i++) {
    if (workDays.includes(isoWeekday(d))) return d;
    d = addDays(d, 1);
  }
  return d; // workDays empty — caller validated, unreachable in practice
}

// ---------- core ----------

export function schedule(
  products: PlanningProduct[],
  orders: DemandOrder[],
  config: SchedulerConfig,
): ScheduleResult {
  const lookahead = config.max_lookahead_days ?? 120;
  const productById = new Map(products.map((p) => [p.finished_good_id, p]));
  const stockLeft = new Map(
    products.map((p) => [p.finished_good_id, Math.max(0, p.stock_qty)]),
  );
  // capacityUsed[date][productId] = units already scheduled
  const capacityUsed = new Map<string, Map<string, number>>();
  const deliveriesPerDay = new Map<string, number>();

  const items: PlanItemDraft[] = [];
  const promises: OrderPromise[] = [];
  const warnings: PlanWarning[] = [];

  const horizonEnd = addDays(config.start_date, config.horizon_days - 1);
  const hardEnd = addDays(config.start_date, lookahead);

  const overrideFor = (date: string, productId: string) => {
    const specific = config.capacity_overrides?.find(
      (o) => o.date === date && o.finished_good_id === productId,
    );
    const global = config.capacity_overrides?.find(
      (o) => o.date === date && !o.finished_good_id,
    );
    return specific ?? global;
  };

  const capacityOn = (date: string, product: PlanningProduct): number => {
    if (!config.work_days.includes(isoWeekday(date))) return 0;
    const ov = overrideFor(date, product.finished_good_id);
    if (ov?.blocked) return 0;
    const base = ov?.capacity ?? product.daily_capacity;
    const used =
      capacityUsed.get(date)?.get(product.finished_good_id) ?? 0;
    return Math.max(0, base - used);
  };

  const consumeCapacity = (date: string, productId: string, qty: number) => {
    const day = capacityUsed.get(date) ?? new Map<string, number>();
    day.set(productId, (day.get(productId) ?? 0) + qty);
    capacityUsed.set(date, day);
  };

  const sorted = [...orders].sort((a, b) => a.priority_rank - b.priority_rank);

  for (const order of sorted) {
    let orderReadyDate = config.start_date; // latest ready date across lines
    let unfulfilled = 0;
    const productionAllocations: {
      date: string;
      productId: string;
      productName: string;
      qty: number;
    }[] = [];

    for (const line of order.lines) {
      const product = productById.get(line.finished_good_id);
      if (!product) {
        unfulfilled += line.remaining;
        warnings.push({
          type: "unfulfillable",
          order_ref: order.order_ref,
          message: `${order.order_ref}: no planning parameters for ${line.product_name} — line skipped`,
        });
        continue;
      }

      let needed = line.remaining;

      // 1) Serve from dispatchable stock (ready immediately).
      const stock = stockLeft.get(product.finished_good_id) ?? 0;
      const fromStock = Math.min(stock, needed);
      if (fromStock > 0) {
        stockLeft.set(product.finished_good_id, stock - fromStock);
        needed -= fromStock;
        // Stock is ready now; order ready date unchanged (>= start_date).
      }

      // 2) Produce the rest across working days.
      let cursor = config.start_date;
      while (needed > 0 && cursor <= hardEnd) {
        const avail = capacityOn(cursor, product);
        if (avail > 0) {
          const make = Math.min(avail, needed);
          consumeCapacity(cursor, product.finished_good_id, make);
          productionAllocations.push({
            date: cursor,
            productId: product.finished_good_id,
            productName: product.product_name,
            qty: make,
          });
          needed -= make;
          // Batch dispatchable after curing, on a working day.
          const ready = nextWorkday(
            addDays(cursor, product.curing_days),
            config.work_days,
          );
          if (ready > orderReadyDate) orderReadyDate = ready;
        }
        cursor = addDays(cursor, 1);
      }

      if (needed > 0) {
        unfulfilled += needed;
        warnings.push({
          type: "no_capacity",
          order_ref: order.order_ref,
          message: `${order.order_ref}: ${needed} × ${line.product_name} cannot be produced within ${lookahead} days`,
        });
      }
    }

    // Emit production items that fall inside the visible horizon.
    for (const alloc of productionAllocations) {
      if (alloc.date <= horizonEnd) {
        items.push({
          item_type: "production",
          item_date: alloc.date,
          finished_good_id: alloc.productId,
          product_name: alloc.productName,
          quantity: alloc.qty,
          sale_order_ref: order.order_ref,
          customer_name: order.customer_name,
        });
      }
    }

    // 3) Delivery slot: first working day >= orderReadyDate with capacity.
    const totalUnits = order.lines.reduce((s, l) => s + l.remaining, 0);
    const deliverableUnits = totalUnits - unfulfilled;
    let promisedDate: string | null = null;

    if (deliverableUnits > 0) {
      let dDate = nextWorkday(orderReadyDate, config.work_days);
      for (let i = 0; i < lookahead; i++) {
        const count = deliveriesPerDay.get(dDate) ?? 0;
        if (count < config.max_deliveries_per_day) break;
        dDate = nextWorkday(addDays(dDate, 1), config.work_days);
      }
      deliveriesPerDay.set(dDate, (deliveriesPerDay.get(dDate) ?? 0) + 1);
      promisedDate = dDate;

      if (dDate <= horizonEnd) {
        items.push({
          item_type: "delivery",
          item_date: dDate,
          finished_good_id: order.lines[0]?.finished_good_id ?? null,
          product_name: order.lines.map((l) => l.product_name).join(", "),
          quantity: deliverableUnits,
          sale_order_ref: order.order_ref,
          customer_name: order.customer_name,
        });
      } else {
        warnings.push({
          type: "beyond_horizon",
          order_ref: order.order_ref,
          message: `${order.order_ref}: delivery lands ${dDate}, beyond this plan's horizon`,
        });
      }
    }

    const late =
      !!order.commitment_date &&
      !!promisedDate &&
      promisedDate > order.commitment_date.slice(0, 10);
    if (late) {
      warnings.push({
        type: "late_order",
        order_ref: order.order_ref,
        message: `${order.order_ref} (${order.customer_name}): promised ${promisedDate}, committed ${order.commitment_date!.slice(0, 10)}`,
      });
    }

    promises.push({
      order_ref: order.order_ref,
      customer_name: order.customer_name,
      promised_delivery_date: promisedDate,
      late_vs_commitment: late,
      unfulfilled_units: unfulfilled,
    });
  }

  return { items, promises, warnings };
}

/**
 * Promise-date simulation: "if a new order for `qty` of `productId` arrived
 * now, when could we deliver?" Runs the same scheduler with the synthetic
 * order appended at lowest priority after existing demand.
 */
export function simulatePromise(
  products: PlanningProduct[],
  existingOrders: DemandOrder[],
  productId: string,
  qty: number,
  config: SchedulerConfig,
): { promised_delivery_date: string | null; unfulfilled_units: number } {
  const product = products.find((p) => p.finished_good_id === productId);
  if (!product) return { promised_delivery_date: null, unfulfilled_units: qty };

  const synthetic: DemandOrder = {
    order_ref: "__SIMULATION__",
    customer_name: "Prospect",
    priority_rank: Number.MAX_SAFE_INTEGER,
    lines: [
      {
        finished_good_id: productId,
        product_name: product.product_name,
        remaining: qty,
      },
    ],
  };
  const result = schedule(products, [...existingOrders, synthetic], config);
  const sim = result.promises.find((p) => p.order_ref === "__SIMULATION__");
  return {
    promised_delivery_date: sim?.promised_delivery_date ?? null,
    unfulfilled_units: sim?.unfulfilled_units ?? qty,
  };
}
