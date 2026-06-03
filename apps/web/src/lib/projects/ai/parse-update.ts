/**
 * Telegram natural-language daily-update parser (§27). Turns a free-text site
 * update into structured daily_progress fields, matches it to a project by
 * name, and reports a confidence score + missing fields. Graceful: returns a
 * low-confidence empty parse when Gemini isn't configured.
 */
import { runGeminiJson, isGeminiConfigured } from "./gemini";

export interface ParsedUpdate {
  project_name: string | null;
  wbs_hint: string | null; // free-text activity (e.g. "production", "loading")
  actual_quantity: number | null;
  unit: string | null;
  labour_count: number | null;
  machine_hours: number | null;
  issue: string | null;
  delay_reason: string | null;
  tomorrow_plan: string | null;
  cost_mentioned: number | null;
  confidence: number; // 0..1
  missing_fields: string[];
}

const EMPTY: ParsedUpdate = {
  project_name: null, wbs_hint: null, actual_quantity: null, unit: null,
  labour_count: null, machine_hours: null, issue: null, delay_reason: null,
  tomorrow_plan: null, cost_mentioned: null, confidence: 0, missing_fields: [],
};

export async function parseDailyUpdate(
  text: string,
  knownProjects: { id: string; name: string }[],
): Promise<ParsedUpdate> {
  if (!isGeminiConfigured()) return { ...EMPTY };

  const parsed = await runGeminiJson<Partial<ParsedUpdate>>(
    `You parse WhatsApp/Telegram site updates for Maiyuri Bricks (interlocking brick projects) into structured data.

Known active projects (match project_name to the closest one, or null):
${JSON.stringify(knownProjects.map((p) => p.name))}

Update message:
"""${text}"""

Extract and respond ONLY with JSON:
{
  "project_name": "<closest known project name or null>",
  "wbs_hint": "<activity like production/loading/transport/wall, or null>",
  "actual_quantity": <number or null>,
  "unit": "<bricks/rft/etc or null>",
  "labour_count": <number or null>,
  "machine_hours": <number or null>,
  "issue": "<issue text or null>",
  "delay_reason": "<reason or null>",
  "tomorrow_plan": "<text or null>",
  "cost_mentioned": <number or null>,
  "confidence": <0..1 how confident the overall parse is>,
  "missing_fields": ["fields a supervisor should still provide"]
}`,
  );

  if (!parsed) return { ...EMPTY };
  return {
    ...EMPTY,
    ...parsed,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
  };
}
