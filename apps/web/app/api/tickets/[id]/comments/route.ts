export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, unauthorized, parseBody } from "@/lib/api-utils";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { addTicketComment } from "@/lib/ticket-service";
import { addTicketCommentSchema } from "@maiyuri/shared";

// POST /api/tickets/[id]/comments - Add a comment to a ticket
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

    const parsed = await parseBody(request, addTicketCommentSchema);
    if (parsed.error) return parsed.error;

    const result = await addTicketComment(
      params.id,
      user.id,
      parsed.data.comment,
    );

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    return success({ message: result.message });
  } catch (err) {
    console.error("Error adding comment:", err);
    return error("Internal server error", 500);
  }
}
