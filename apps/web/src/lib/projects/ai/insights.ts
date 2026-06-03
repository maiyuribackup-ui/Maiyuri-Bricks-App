/**
 * AI Project Insights (§28/§29). Deterministic risk detectors over the live
 * project data (no LLM needed), with an optional Gemini-written narrative
 * health summary + tomorrow plan. Degrades gracefully without an API key.
 */
import type { Project, WbsItem } from "@maiyuri/shared";
import { runGeminiJson } from "./gemini";

export interface ProjectRisk {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface ProjectInsights {
  health: string;
  risks: ProjectRisk[];
  summary: string;
  recommendations: string[];
  tomorrowPlan: string | null;
  source: "ai" | "rules";
}

interface InsightInput {
  project: Project;
  wbs: WbsItem[];
  budget: {
    approvedBudget: number;
    actualCost: number;
    forecastCost: number;
    budgetUsedPct: number;
    progressPct: number;
    forecastMargin: number;
    costHealth: string;
  };
  lastUpdateDaysAgo: number | null;
}

export function detectRisks(input: InsightInput): ProjectRisk[] {
  const risks: ProjectRisk[] = [];
  const { budget, project, wbs, lastUpdateDaysAgo } = input;

  // Cost vs progress: spending faster than work done.
  if (budget.budgetUsedPct > budget.progressPct + 15 && budget.budgetUsedPct > 20) {
    risks.push({
      type: "cost_vs_progress",
      severity: "high",
      message: `${budget.budgetUsedPct}% of budget used but only ${budget.progressPct}% of work complete.`,
    });
  }
  if (budget.approvedBudget > 0 && budget.forecastCost > budget.approvedBudget) {
    risks.push({
      type: "over_budget",
      severity: "high",
      message: `Forecast cost (₹${budget.forecastCost.toLocaleString("en-IN")}) exceeds the approved budget.`,
    });
  }
  if (budget.forecastMargin < 0) {
    risks.push({ type: "negative_margin", severity: "high", message: "Forecast margin is negative." });
  }
  // No recent update.
  if (lastUpdateDaysAgo == null && ["in_progress", "budget_approved"].includes(project.status)) {
    risks.push({ type: "no_update", severity: "medium", message: "No daily update logged yet." });
  } else if (lastUpdateDaysAgo != null && lastUpdateDaysAgo >= 2) {
    risks.push({ type: "stale_update", severity: "medium", message: `No update for ${lastUpdateDaysAgo} days.` });
  }
  // Schedule: due soon but behind.
  if (project.planned_end_date) {
    const daysLeft = Math.ceil((new Date(project.planned_end_date).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 2 && budget.progressPct < 80) {
      risks.push({
        type: "delivery_risk",
        severity: "high",
        message: `Due in ${daysLeft} day(s) but only ${budget.progressPct}% complete.`,
      });
    }
  }
  // Behind-schedule WBS.
  const blocked = wbs.filter((w) => ["delayed", "blocked", "at_risk"].includes(w.status));
  if (blocked.length > 0) {
    risks.push({
      type: "wbs_blocked",
      severity: "medium",
      message: `${blocked.length} WBS item(s) blocked/at-risk: ${blocked.map((w) => w.name).slice(0, 3).join(", ")}.`,
    });
  }
  return risks;
}

export async function buildInsights(input: InsightInput): Promise<ProjectInsights> {
  const risks = detectRisks(input);
  const ruleFallback: ProjectInsights = {
    health: input.project.health_status,
    risks,
    summary:
      risks.length === 0
        ? `${input.project.name} looks healthy — ${input.budget.progressPct}% complete, on budget.`
        : `${input.project.name} has ${risks.length} risk(s) needing attention.`,
    recommendations: risks.slice(0, 3).map((r) => `Address: ${r.message}`),
    tomorrowPlan: null,
    source: "rules",
  };

  const ai = await runGeminiJson<{ summary: string; recommendations: string[]; tomorrow_plan: string }>(
    `You are a project controls assistant for Maiyuri Bricks. Write a concise health summary and next actions.

Project: ${input.project.name} (status ${input.project.status})
Progress: ${input.budget.progressPct}% · Budget used: ${input.budget.budgetUsedPct}% · Forecast margin: ₹${input.budget.forecastMargin}
Detected risks: ${JSON.stringify(risks.map((r) => r.message))}

Respond ONLY with JSON:
{ "summary": "2-3 sentences", "recommendations": ["3 specific actions"], "tomorrow_plan": "one line" }`,
  );

  if (ai?.summary) {
    return {
      health: input.project.health_status,
      risks,
      summary: ai.summary,
      recommendations: ai.recommendations ?? ruleFallback.recommendations,
      tomorrowPlan: ai.tomorrow_plan ?? null,
      source: "ai",
    };
  }
  return ruleFallback;
}
