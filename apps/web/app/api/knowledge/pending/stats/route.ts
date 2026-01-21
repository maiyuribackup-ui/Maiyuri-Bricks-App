export const dynamic = "force-dynamic";

import { routes } from "@maiyuri/api";
import { success, error } from "@/lib/api-utils";

// GET /api/knowledge/pending/stats - Get pending queue statistics
export async function GET() {
  try {
    const result = await routes.knowledge.getPendingQueueStats();

    if (!result.success) {
      return error(result.error?.message || "Failed to get queue stats", 500);
    }

    return success(result.data);
  } catch (err) {
    console.error("Error getting pending queue stats:", err);
    return error("Failed to get pending queue statistics", 500);
  }
}
