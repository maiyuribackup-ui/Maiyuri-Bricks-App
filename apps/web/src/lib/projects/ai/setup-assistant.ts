/**
 * AI Project Setup Assistant (§25). Given a few inputs + the available
 * templates, recommend the best template, a timeline, resources, and risks.
 * Falls back to a keyword heuristic when Gemini isn't configured.
 */
import type { ProjectTemplate } from "@maiyuri/shared";
import { runGeminiJson } from "./gemini";

export interface SetupSuggestion {
  recommended_template_id: string | null;
  recommended_template_name: string | null;
  reasoning: string;
  suggested_timeline_days: number | null;
  suggested_resources: string[];
  risks: string[];
  source: "ai" | "heuristic";
}

interface SetupInput {
  customer_name?: string;
  location?: string;
  project_type?: string;
  quantity?: string | number;
  expected_delivery_date?: string;
  notes?: string;
}

function heuristic(input: SetupInput, templates: ProjectTemplate[]): SetupSuggestion {
  const hay = `${input.project_type ?? ""} ${input.notes ?? ""}`.toLowerCase();
  const pick =
    templates.find((t) =>
      hay.includes("wall") ? t.project_type === "compound_wall" : false,
    ) ||
    templates.find((t) => t.project_type === "brick_supply") ||
    templates[0] ||
    null;
  const qty = Number(input.quantity) || 0;
  // ~2,400 bricks/day default planning rate for brick supply.
  const days = qty > 0 ? Math.max(1, Math.ceil(qty / 2400)) : null;
  return {
    recommended_template_id: pick?.id ?? null,
    recommended_template_name: pick?.name ?? null,
    reasoning: pick
      ? `Matched "${pick.name}" from the project details.`
      : "No template matched; start from a blank project.",
    suggested_timeline_days: days,
    suggested_resources: ["Production team", "Loading labour", "Transport vehicle"],
    risks: pick?.default_risks?.slice(0, 5) ?? [],
    source: "heuristic",
  };
}

export async function suggestProjectSetup(
  input: SetupInput,
  templates: ProjectTemplate[],
): Promise<SetupSuggestion> {
  const ai = await runGeminiJson<Omit<SetupSuggestion, "source">>(
    `You are a project planning assistant for Maiyuri Bricks (eco-friendly interlocking bricks).
Given the new project details and the available templates, pick the best template and plan.

Project details:
${JSON.stringify(input, null, 2)}

Available templates (id, name, project_type):
${JSON.stringify(
  templates.map((t) => ({ id: t.id, name: t.name, project_type: t.project_type })),
  null,
  2,
)}

Planning notes: brick production averages ~2,400 bricks/day. Add transport risk for far locations and a weather buffer in monsoon.

Respond ONLY with JSON:
{
  "recommended_template_id": "<id or null>",
  "recommended_template_name": "<name or null>",
  "reasoning": "1-2 sentences",
  "suggested_timeline_days": <number or null>,
  "suggested_resources": ["..."],
  "risks": ["..."]
}`,
  );

  if (ai && (ai.recommended_template_id || ai.reasoning)) {
    return { ...ai, source: "ai" };
  }
  return heuristic(input, templates);
}
