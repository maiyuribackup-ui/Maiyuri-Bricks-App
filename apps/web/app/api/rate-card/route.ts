export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRateCard } from "@/lib/pricing";

/**
 * Rate card (product × km-band delivered prices).
 *   GET  — products + active bands (any authenticated staff; reps quote from it)
 *   PUT  — replace ALL bands for ONE product (management only)
 */
const ADMIN_ROLES = ["founder", "owner", "accountant"];

const putSchema = z.object({
  product_id: z.string().uuid(),
  bands: z
    .array(
      z.object({
        km_from: z.number().min(0),
        km_to: z.number().positive(),
        unit_price: z.number().min(0),
      }),
    )
    .max(20),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    return success(await getRateCard());
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[RateCard] GET failed:", err);
    return error("Failed to load rate card", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!ADMIN_ROLES.includes(user.role)) return error("Not permitted", 403);

    const parsed = await parseBody(request, putSchema);
    if (parsed.error) return parsed.error;
    const { product_id, bands } = parsed.data;

    // Validate: bands must not overlap and each must be a real range.
    const sorted = [...bands].sort((a, b) => a.km_from - b.km_from);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].km_to <= sorted[i].km_from) {
        return error(`Band ${i + 1}: "to km" must be greater than "from km"`, 422);
      }
      if (i > 0 && sorted[i].km_from < sorted[i - 1].km_to) {
        return error(
          `Bands overlap: ${sorted[i - 1].km_from}-${sorted[i - 1].km_to} and ${sorted[i].km_from}-${sorted[i].km_to}`,
          422,
        );
      }
    }

    // Replace-all per product: simplest mental model for the editor, and the
    // unique constraint stays meaningful.
    const { error: delErr } = await supabaseAdmin
      .from("rate_card_entries")
      .delete()
      .eq("product_id", product_id);
    if (delErr) return error(`Failed to clear old bands: ${delErr.message}`, 500);

    if (sorted.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("rate_card_entries")
        .insert(
          sorted.map((b) => ({
            product_id,
            km_from: b.km_from,
            km_to: b.km_to,
            unit_price: b.unit_price,
          })),
        );
      if (insErr) return error(`Failed to save bands: ${insErr.message}`, 500);
    }

    return success(await getRateCard());
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[RateCard] PUT failed:", err);
    return error("Failed to save rate card", 500);
  }
}
