/**
 * AI CEO advisor — reads the full briefing and returns ONE prioritized
 * action, in the voice of a world-class consultant for the bricks industry.
 *
 * Fail-open: if the LLM is unavailable or returns garbage, a rules-based
 * fallback picks the most obvious lever (overdue receivables → collect;
 * thin margin → reprice; cash runway → conserve) so the card never dies.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { GEMINI_MODEL } from "@/lib/ai/models";
import type {
  MoneyBalances,
  PipelineStage,
  ProductEconomics,
  ProfitPeriod,
} from "./briefing";

const actionSchema = z.object({
  headline: z.string().min(4), // the one action, imperative, <=12 words
  why: z.string().default(""), // the numbers behind it
  expected_impact: z.string().default(""),
  urgency: z.enum(["today", "this_week"]).default("this_week"),
  watchlist: z.array(z.string()).default([]), // 2-3 secondary flags
});

export type CeoAction = z.infer<typeof actionSchema> & { ai_used: boolean };

export type CeoBriefingInput = {
  money: MoneyBalances | null;
  products: ProductEconomics[];
  profit: ProfitPeriod[];
  pipeline: { stages: PipelineStage[]; open_count: number; open_value: number } | null;
  receivables: { outstanding: number; overdue: number; overdue_count: number } | null;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Rules-based fallback — the obvious lever, no AI needed. */
function fallbackAction(b: CeoBriefingInput): CeoAction {
  if (b.receivables && b.receivables.overdue > 0) {
    return {
      headline: "Collect overdue receivables this week",
      why: `${inr(b.receivables.overdue)} across ${b.receivables.overdue_count} overdue invoices is your cheapest cash — it's already earned.`,
      expected_impact: `Bank balance up by up to ${inr(b.receivables.overdue)} without producing a single brick.`,
      urgency: "this_week",
      watchlist: [],
      ai_used: false,
    };
  }
  const thin = b.products[0];
  if (thin && thin.margin_pct < 25) {
    return {
      headline: `Review pricing on ${thin.name}`,
      why: `Its margin is ${thin.margin_pct.toFixed(0)}% (${inr(thin.margin)}/unit) — the weakest in the range.`,
      expected_impact: "Every ₹1 price correction drops straight to profit.",
      urgency: "this_week",
      watchlist: [],
      ai_used: false,
    };
  }
  return {
    headline: "Push pipeline conversions",
    why: "No urgent fires — the fastest lever is converting open quotes to orders.",
    expected_impact: "Pipeline value converts to booked revenue.",
    urgency: "this_week",
    watchlist: [],
    ai_used: false,
  };
}

export async function getCeoAction(b: CeoBriefingInput): Promise<CeoAction> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return fallbackAction(b);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL.FLASH_LITE,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    });

    const prompt = `You are a world-class business consultant for the brick & building-materials industry, advising the founder of Maiyuri Bricks — an interlocking mud/cement brick factory near Chennai, Tamil Nadu. You know this industry cold: cement price cycles, monsoon demand dips, contractor credit behaviour, and that cash discipline kills more small factories than competition does.

TODAY'S NUMBERS (INR):

MONEY IN HAND:
${b.money ? `Bank ${inr(b.money.bank)} · Cash ${inr(b.money.cash)}` : "unavailable"}

RECEIVABLES:
${b.receivables ? `Outstanding ${inr(b.receivables.outstanding)} · OVERDUE ${inr(b.receivables.overdue)} across ${b.receivables.overdue_count} invoices` : "unavailable"}

PROFIT (invoiced revenue − vendor bills):
${b.profit.map((p) => `${p.label}: revenue ${inr(p.revenue)}, expenses ${inr(p.expenses)}, net ${inr(p.net)}`).join("\n")}

PRODUCT ECONOMICS (true material cost from BOM vs selling price, worst margin first):
${b.products.map((p) => `${p.name}: cost ${inr(p.cost)}/unit, sells ${inr(p.price)}, margin ${inr(p.margin)} (${p.margin_pct.toFixed(0)}%), stock ${p.stock_qty}`).join("\n")}

SALES PIPELINE (open leads):
${b.pipeline ? b.pipeline.stages.map((s) => `${s.stage}: ${s.count} leads, ${inr(s.value)}`).join("\n") + `\nTotal open: ${b.pipeline.open_count} leads worth ${inr(b.pipeline.open_value)}` : "unavailable"}

TASK
Pick the SINGLE highest-leverage action the founder should take, considering cash first, then margin, then growth. Be specific — name the product, the amount, the customer segment. No generic advice ("improve marketing" = useless). Then list 2-3 watchlist items (one line each) they should keep an eye on.

Respond with ONLY a JSON code block:
\`\`\`json
{"headline":"<action, imperative, max 12 words>","why":"<the numbers behind it, 1-2 sentences>","expected_impact":"<what changes if done, 1 sentence>","urgency":"today|this_week","watchlist":["...","..."]}
\`\`\``;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ?? [
      null,
      text.trim(),
    ];
    const parsed = actionSchema.safeParse(JSON.parse(jsonMatch[1] ?? "{}"));
    if (!parsed.success) return fallbackAction(b);
    return { ...parsed.data, ai_used: true };
  } catch (err) {
    console.error("[CEO] advisor failed, using fallback:", err);
    return fallbackAction(b);
  }
}
