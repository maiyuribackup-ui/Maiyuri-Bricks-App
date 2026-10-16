export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { getPromiseDate } from "@/lib/ops-planning/planning-service";

const promiseSchema = z.object({
  finished_good_id: z.string().uuid(),
  quantity: z.number().positive(),
});

// POST /api/ops-planning/promise — "when could we deliver X units of Y?"
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, promiseSchema);
    if (parsed.error) return parsed.error;

    const result = await getPromiseDate(
      parsed.data.finished_good_id,
      parsed.data.quantity,
    );
    return success(result);
  } catch (err) {
    console.error("promise-date simulation failed:", err);
    return error("Promise simulation failed", 500);
  }
}
