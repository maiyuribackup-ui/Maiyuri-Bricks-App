import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { updateNoteSchema, type Note } from "@maiyuri/shared";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/notes/[id] - Get a single note
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { data: note, error: dbError } = await supabaseAdmin
      .from("notes")
      .select("*, leads(name, status)")
      .eq("id", id)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return notFound("Note not found");
      }
      console.error("Database error:", dbError);
      return error("Failed to fetch note", 500);
    }

    return success<Note>(note);
  } catch (err) {
    console.error("Error fetching note:", err);
    return error("Internal server error", 500);
  }
}

// PUT /api/notes/[id] - Update a note
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const parsed = await parseBody(request, updateNoteSchema);
    if (parsed.error) return parsed.error;

    const { data: note, error: dbError } = await supabaseAdmin
      .from("notes")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return notFound("Note not found");
      }
      console.error("Database error:", dbError);
      return error("Failed to update note", 500);
    }

    return success<Note>(note);
  } catch (err) {
    console.error("Error updating note:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/notes/[id] - Delete a note
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { error: dbError } = await supabaseAdmin
      .from("notes")
      .delete()
      .eq("id", id);

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to delete note", 500);
    }

    return success({ deleted: true });
  } catch (err) {
    console.error("Error deleting note:", err);
    return error("Internal server error", 500);
  }
}
