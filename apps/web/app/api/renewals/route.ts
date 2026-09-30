export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Who may add/edit renewals (viewing is open to all staff). */
const EDIT_ROLES = ["founder", "owner", "production_supervisor", "accountant"];

const renewalSchema = z.object({
  id: z.string().uuid().optional(), // present = update
  name: z.string().min(2),
  category: z
    .enum(["insurance", "tax", "license", "vehicle", "amc", "other"])
    .default("other"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cycle: z
    .enum(["yearly", "half_yearly", "quarterly", "monthly", "one_time"])
    .default("yearly"),
  remind_days_before: z.number().int().min(0).max(180).default(30),
  owner_user_id: z.string().uuid().nullable().optional(),
  document_url: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  notes: z.string().nullable().optional(),
  status: z.enum(["active", "done", "archived"]).default("active"),
});

// GET /api/renewals — the register, soonest due first (any authenticated user)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { data, error: dbErr } = await supabaseAdmin
      .from("compliance_renewals")
      .select("*, owner:users!compliance_renewals_owner_user_id_fkey(id, name)")
      .neq("status", "archived")
      .order("due_date", { ascending: true });
    if (dbErr) return error("Failed to load renewals", 500);
    return success(data ?? []);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("renewals GET failed:", err);
    return error("Failed to load renewals", 500);
  }
}

// POST /api/renewals — create/update an entry (leadership/supervisor/accounts)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!EDIT_ROLES.includes(user.role)) {
      return error("You do not have permission to manage renewals", 403);
    }
    const parsed = await parseBody(request, renewalSchema);
    if (parsed.error) return parsed.error;
    const { id, ...fields } = parsed.data;

    const result = id
      ? await supabaseAdmin
          .from("compliance_renewals")
          .update(fields)
          .eq("id", id)
          .select("*")
          .single()
      : await supabaseAdmin
          .from("compliance_renewals")
          .insert({ ...fields, created_by: user.id })
          .select("*")
          .single();

    if (result.error || !result.data) {
      return error(`Failed to save renewal: ${result.error?.message}`, 500);
    }
    return success(result.data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("renewals POST failed:", err);
    return error("Failed to save renewal", 500);
  }
}
