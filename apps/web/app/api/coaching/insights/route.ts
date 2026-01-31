import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";

// Force dynamic rendering - this route uses request.url for query params
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get("staff_id");

    if (!staffId) {
      return error("staff_id is required", 400);
    }

    const { data: notes, error: notesError } = await supabaseAdmin
      .from("notes")
      .select("id")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (notesError) {
      console.error("Error fetching notes for coaching insights:", notesError);
      return error("Failed to fetch coaching insights", 500);
    }

    const noteIds = (notes || []).map((n) => n.id);
    if (noteIds.length === 0) {
      return success([]);
    }

    const { data, error: insightsError } = await supabaseAdmin
      .from("coaching_insights")
      .select(
        "id, insight_type, quote_text, suggestion, created_at, lead:leads(id, name, contact)",
      )
      .in("note_id", noteIds)
      .order("created_at", { ascending: false })
      .limit(20);

    if (insightsError) {
      console.error("Error fetching coaching insights:", insightsError);
      return error("Failed to fetch coaching insights", 500);
    }

    return success(data || []);
  } catch (err) {
    console.error("Coaching insights error:", err);
    return error("Internal server error", 500);
  }
}
