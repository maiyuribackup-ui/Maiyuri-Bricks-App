export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, parseBody } from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { submitProductionOrderForApproval } from "@/lib/ticket-service";
import { submitForApprovalSchema } from "@maiyuri/shared";
import type { Ticket } from "@maiyuri/shared";

// POST /api/production/orders/[id]/submit-for-approval - Submit a production order for approval
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorized();
    }

    const parsed = await parseBody(request, submitForApprovalSchema);
    if (parsed.error) return parsed.error;

    const result = await submitProductionOrderForApproval(
      params.id,
      user.id,
      parsed.data.priority,
      parsed.data.notes ?? undefined,
      parsed.data.due_date ?? undefined,
    );

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    return success<Ticket>(result.data!);
  } catch (err) {
    console.error("Error submitting for approval:", err);
    return error("Internal server error", 500);
  }
}
