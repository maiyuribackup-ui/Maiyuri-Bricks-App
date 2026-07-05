export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI advisor call

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { generateDraftPlan } from "@/lib/ops-planning/planning-service";

const generateSchema = z.object({
  horizon_days: z.number().int().min(3).max(60).default(14),
  constraint_text: z.string().max(2000).nullable().optional().default(null),
  selected_order_ids: z.array(z.number().int()).default([]),
});

// POST /api/ops-planning/generate — returns a DRAFT plan (not persisted)
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, generateSchema);
    if (parsed.error) return parsed.error;

    const draft = await generateDraftPlan(parsed.data);
    return success(draft);
  } catch (err) {
    console.error("ops-plan generation failed:", err);
    return error(
      err instanceof Error ? err.message : "Plan generation failed",
      500,
    );
  }
}
