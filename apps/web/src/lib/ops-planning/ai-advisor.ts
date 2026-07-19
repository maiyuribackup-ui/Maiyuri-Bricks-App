/**
 * AI advisor for the ops planner. The LLM proposes order priorities, capacity
 * overrides parsed from the user's free-text constraints, and a plain-language
 * rationale. It NEVER schedules — the deterministic scheduler enforces all
 * hard constraints regardless of what comes back here.
 *
 * Fail-open design: any API/parse/validation failure degrades to FIFO
 * priorities (commitment date, then order date) with a note in the rationale.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { GEMINI_MODEL } from "@/lib/ai/models";
import type { CapacityOverride } from "./scheduler";

const adviceSchema = z.object({
  priorities: z
    .array(
      z.object({
        order_ref: z.string(),
        rank: z.number().int().min(1),
        reason: z.string().optional().default(""),
      }),
    )
    .default([]),
  capacity_overrides: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        finished_good_id: z.string().optional(),
        capacity: z.number().nonnegative().optional(),
        blocked: z.boolean().optional(),
      }),
    )
    .default([]),
  narrative: z.string().default(""),
});

export type PlanningAdvice = z.infer<typeof adviceSchema> & {
  ai_used: boolean;
};

export type AdvisorInput = {
  start_date: string;
  horizon_days: number;
  constraint_text: string | null;
  orders: {
    order_ref: string;
    customer_name: string;
    date_order: string | null;
    commitment_date: string | null;
    remaining_units: number;
    lines: { product_name: string; remaining: number }[];
  }[];
  products: {
    finished_good_id: string;
    product_name: string;
    daily_capacity: number;
    curing_days: number;
    stock_qty: number;
  }[];
};

/** FIFO fallback: earliest commitment first, then earliest order date. */
export function fifoPriorities(
  orders: AdvisorInput["orders"],
): PlanningAdvice["priorities"] {
  return [...orders]
    .sort((a, b) => {
      const ca = a.commitment_date ?? "9999";
      const cb = b.commitment_date ?? "9999";
      if (ca !== cb) return ca < cb ? -1 : 1;
      const da = a.date_order ?? "9999";
      const db = b.date_order ?? "9999";
      return da <= db ? -1 : 1;
    })
    .map((o, i) => ({
      order_ref: o.order_ref,
      rank: i + 1,
      reason: "FIFO (commitment/order date)",
    }));
}

export async function getPlanningAdvice(
  input: AdvisorInput,
): Promise<PlanningAdvice> {
  const fallback: PlanningAdvice = {
    priorities: fifoPriorities(input.orders),
    capacity_overrides: [],
    narrative:
      "Planned first-in-first-out by commitment/order date (AI advisor unavailable).",
    ai_used: false,
  };

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey || input.orders.length === 0) return fallback;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL.FLASH_LITE,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    });

    const prompt = `You are the production planning advisor for Maiyuri Bricks, an interlocking-brick factory in Tamil Nadu.

FACTS
- Planning window starts ${input.start_date}, ${input.horizon_days} days.
- Work days: Monday–Saturday. Sundays: no production, no deliveries (the scheduler enforces this — never suggest Sundays).
- Bricks cure after production before dispatch (per-product curing days below).

PRODUCTS (capacity/day, curing days, current dispatchable stock):
${input.products.map((p) => `- ${p.product_name} [id=${p.finished_good_id}]: ${p.daily_capacity}/day, cure ${p.curing_days}d, stock ${p.stock_qty}`).join("\n")}

OPEN SALES ORDERS to plan (remaining units by product):
${input.orders
  .map(
    (o) =>
      `- ${o.order_ref} | ${o.customer_name} | ordered ${o.date_order ?? "?"} | committed ${o.commitment_date ?? "none"} | ${o.lines.map((l) => `${l.remaining}× ${l.product_name}`).join(", ")}`,
  )
  .join("\n")}

OWNER'S CONSTRAINTS (free text, may be empty):
"""${input.constraint_text ?? ""}"""

TASK
1. Rank ALL listed orders for production priority (rank 1 = first). Consider: explicit owner instructions above (highest weight), committed dates, order age, customer urgency hints, batching efficiency (same product back-to-back).
2. Translate owner constraints into capacity_overrides: dates with blocked=true (no production) or a reduced absolute "capacity" number, optionally per finished_good_id. Only dates within the window. If a constraint names a weekday (e.g. "no production Thursday"), resolve it to the actual date(s) in the window.
3. Write a short narrative (3-5 sentences, plain language a factory owner reads at a glance) explaining the plan logic and any risks.

Respond with ONLY a JSON code block:
\`\`\`json
{"priorities":[{"order_ref":"SO001","rank":1,"reason":"..."}],"capacity_overrides":[{"date":"YYYY-MM-DD","blocked":true}],"narrative":"..."}
\`\`\``;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ?? [
      null,
      text.trim(),
    ];
    const parsed = adviceSchema.parse(JSON.parse(jsonMatch[1] ?? "{}"));

    // Guard: every open order must have a rank; add missing ones after AI's.
    const ranked = new Set(parsed.priorities.map((p) => p.order_ref));
    let nextRank =
      parsed.priorities.reduce((m, p) => Math.max(m, p.rank), 0) + 1;
    for (const o of fifoPriorities(input.orders)) {
      if (!ranked.has(o.order_ref)) {
        parsed.priorities.push({ ...o, rank: nextRank++ });
      }
    }

    return { ...parsed, ai_used: true };
  } catch (err) {
    console.error("Planning AI advisor failed, using FIFO:", err);
    return fallback;
  }
}

export type { CapacityOverride };
