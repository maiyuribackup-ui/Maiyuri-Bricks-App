export const dynamic = "force-dynamic";

import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/factory/stock — live stock per product (View 1).
// free_stock is the number a salesperson needs before promising a date.
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("factory_stock_v")
      .select("*")
      .order("code");
    if (dbError) return error("Failed to load stock", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("factory stock GET failed:", err);
    return error("Failed to load stock", 500);
  }
}
