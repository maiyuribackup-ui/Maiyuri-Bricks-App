export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, notFound, forbidden, parseBody } from "@/lib/api-utils";
import { updateSmartQuoteSchema, type SmartQuote } from "@maiyuri/shared";

/**
 * PATCH /api/smart-quotes/[id]
 *
 * Staff "review & tweak before share": update the interactive-estimate
 * pricing_config and/or override a few copy lines. Founder, or the staff member
 * assigned to / who created the underlying lead.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const parsed = await parseBody(request, updateSmartQuoteSchema);
    if (parsed.error) return parsed.error;

    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return error("Authentication required", 401);

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!userData) return error("User not found", 404);

    // Load the quote + its lead for access control
    const { data: quote } = await supabaseAdmin
      .from("smart_quotes")
      .select("id, pricing_config, copy_map, lead:leads(assigned_staff, created_by)")
      .eq("id", id)
      .maybeSingle();
    if (!quote) return notFound("Quote not found");

    const lead = (quote as { lead?: { assigned_staff?: string; created_by?: string } }).lead;
    const isFounder = userData.role === "founder";
    if (!isFounder && lead?.assigned_staff !== user.id && lead?.created_by !== user.id) {
      return forbidden("You don't have access to this quote");
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (parsed.data.pricing_config) {
      updates.pricing_config = {
        ...(quote.pricing_config ?? {}),
        ...parsed.data.pricing_config,
      };
    }

    if (parsed.data.copy_overrides) {
      const existing = (quote.copy_map ?? {}) as { en?: Record<string, string>; ta?: Record<string, string> };
      updates.copy_map = {
        en: { ...(existing.en ?? {}), ...(parsed.data.copy_overrides.en ?? {}) },
        ta: { ...(existing.ta ?? {}), ...(parsed.data.copy_overrides.ta ?? {}) },
      };
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("smart_quotes")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (updErr) {
      console.error("Smart Quote PATCH error:", updErr);
      return error("Failed to update quote", 500);
    }

    return success<SmartQuote>(updated);
  } catch (err) {
    console.error("Smart Quote PATCH error:", err);
    return error("Internal server error", 500);
  }
}
