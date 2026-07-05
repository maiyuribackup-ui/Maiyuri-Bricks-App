export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const linkSchema = z.object({
  id: z.string().uuid().optional(),
  category: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().nullable().optional(),
  url: z.string().url(),
  sort_order: z.number().int().default(0),
});

// GET /api/onehub/links — everyone (authenticated)
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("onehub_links")
      .select("*")
      .order("category")
      .order("sort_order");
    if (dbError) return error("Failed to load links", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("onehub links GET failed:", err);
    return error("Failed to load links", 500);
  }
}

// POST /api/onehub/links — upsert (founder/owner)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "founder" && user.role !== "owner") {
      return error("Only founders can edit links", 403);
    }
    const parsed = await parseBody(request, linkSchema);
    if (parsed.error) return parsed.error;
    const { id, ...fields } = parsed.data;

    const result = id
      ? await supabaseAdmin
          .from("onehub_links")
          .update({ ...fields, owner_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("*")
          .single()
      : await supabaseAdmin
          .from("onehub_links")
          .insert({ ...fields, owner_id: user.id })
          .select("*")
          .single();

    if (result.error || !result.data) {
      return error(`Failed to save link: ${result.error?.message}`, 500);
    }
    return success(result.data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("onehub links POST failed:", err);
    return error("Failed to save link", 500);
  }
}
