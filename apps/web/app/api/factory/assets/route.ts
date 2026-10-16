export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, created, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ASSET_CATEGORIES, ASSET_LOCATIONS } from "@/lib/factory";

export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_assets")
      .select("*")
      .order("category")
      .order("asset");
    if (dbError) return error("Failed to load assets", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory assets GET failed:", err);
    return error("Failed to load assets", 500);
  }
}

const baseSchema = z.object({
  asset: z.string().min(1).max(160),
  category: z.enum(ASSET_CATEGORIES),
  qty: z.number().min(0).default(1),
  location: z.enum(ASSET_LOCATIONS).default("Unknown"),
  notes: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_assets")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError) return error(`Failed to create asset: ${dbError.message}`, 500);
    return created(data);
  } catch (err) {
    console.error("factory assets POST failed:", err);
    return error("Failed to create asset", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema.partial().extend({ id: z.string().uuid() }));
    if (parsed.error) return parsed.error;
    const { id, ...fields } = parsed.data;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_assets")
      .update(fields)
      .eq("id", id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update asset", 500);
    return success(data);
  } catch (err) {
    console.error("factory assets PATCH failed:", err);
    return error("Failed to update asset", 500);
  }
}
