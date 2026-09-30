export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, created, error, parseBody } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_customers")
      .select("*")
      .order("name");
    if (dbError) return error("Failed to load customers", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory customers GET failed:", err);
    return error("Failed to load customers", 500);
  }
}

const baseSchema = z.object({
  name: z.string().min(1).max(120),
  location: z.string().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  credit_hold: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireProductionRole(request);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const parsed = await parseBody(request, baseSchema);
    if (parsed.error) return parsed.error;
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_customers")
      .insert(parsed.data)
      .select("*")
      .single();
    if (dbError) return error(`Failed to create customer: ${dbError.message}`, 500);
    return created(data);
  } catch (err) {
    console.error("factory customers POST failed:", err);
    return error("Failed to create customer", 500);
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
      .from("factory_customers")
      .update(fields)
      .eq("id", id)
      .select("*")
      .single();
    if (dbError || !data) return error("Failed to update customer", 500);
    return success(data);
  } catch (err) {
    console.error("factory customers PATCH failed:", err);
    return error("Failed to update customer", 500);
  }
}
