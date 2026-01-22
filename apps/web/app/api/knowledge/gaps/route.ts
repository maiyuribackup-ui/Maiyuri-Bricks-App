import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";

const VALID_STATUSES = new Set(["pending", "task_created", "resolved"]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const statuses = statusParam
      ? statusParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => VALID_STATUSES.has(s))
      : ["pending", "task_created"];

    const { data, error: dbError } = await supabaseAdmin
      .from("unanswered_questions")
      .select(
        "id, question_text, context, status, task_id, created_at, task:tasks(id, title, status, due_date)",
      )
      .in("status", statuses)
      .order("created_at", { ascending: false });

    if (dbError) {
      console.error("Error fetching knowledge gaps:", dbError);
      return error("Failed to fetch knowledge gaps", 500);
    }

    return success(data || []);
  } catch (err) {
    console.error("Knowledge gaps error:", err);
    return error("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body as { id?: string; status?: string };

    if (!id || !status || !VALID_STATUSES.has(status)) {
      return error("Invalid id or status", 400);
    }

    const { error: dbError } = await supabaseAdmin
      .from("unanswered_questions")
      .update({ status })
      .eq("id", id);

    if (dbError) {
      console.error("Error updating knowledge gap:", dbError);
      return error("Failed to update knowledge gap", 500);
    }

    return success({ id, status });
  } catch (err) {
    console.error("Knowledge gap update error:", err);
    return error("Internal server error", 500);
  }
}
