export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/supabase-server";
import {
  success,
  error,
  notFound,
  parseBody,
  forbidden,
} from "@/lib/api-utils";
import { generateSmartQuoteSchema, type SmartQuote } from "@maiyuri/shared";
import {
  generateSmartQuoteContent,
  buildBaselineQuoteContent,
  generateLinkSlug,
} from "@/lib/smart-quote-ai";
import { buildPricingConfig } from "@/lib/pricing/seed-pricing-config";
import { canWorkOnLead } from "@/lib/sales-access";
import {
  isQuoteExpired,
  quoteValidUntilDate,
  shouldRenewQuoteValidity,
} from "@/lib/smart-quote-validity";

/**
 * POST /api/smart-quotes/generate
 *
 * Generates a Smart Quote for a lead based on call recording transcripts.
 * Requires authentication (founder or staff with lead access).
 *
 * Body:
 * - lead_id: string (UUID)
 * - regenerate?: boolean (optional, default false)
 *
 * Returns: SmartQuote
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const parsed = await parseBody(request, generateSmartQuoteSchema);
    if (parsed.error) return parsed.error;

    const { lead_id, regenerate } = parsed.data;

    // Machine caller (call-recording pipeline auto-draft, GH3): the
    // service-role/CRON bearer is a trusted internal identity with no user
    // session — skip the per-user access check below.
    const authHeader = request.headers.get("authorization");
    const isMachine =
      (!!process.env.SUPABASE_SERVICE_ROLE_KEY &&
        authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) ||
      (!!process.env.CRON_SECRET &&
        authHeader === `Bearer ${process.env.CRON_SECRET}`);

    // Get authenticated user — cookie (web) OR Bearer token (mobile)
    const user = isMachine ? null : await getUserFromRequest(request);

    if (!user && !isMachine) {
      return error("Authentication required", 401);
    }

    // Check user role (must be founder or have access to lead)
    const { data: userData } = user
      ? await supabaseAdmin
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single()
      : { data: null };

    if (user && !userData) {
      return error("User not found", 404);
    }

    // Verify lead exists and user has access
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select(
        "id, name, assigned_staff, created_by, product_interests, site_location, area, language_preference",
      )
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return notFound("Lead not found");
    }

    // Sales roles reach every lead; everyone else keeps the ownership rule.
    // The machine pipeline (call-recording auto-draft) has full access.
    const hasAccess =
      isMachine || canWorkOnLead(userData?.role, user?.id, lead);

    if (!hasAccess) {
      return forbidden("You don't have access to this lead");
    }

    // Check if quote already exists
    const { data: existingQuote } = await supabaseAdmin
      .from("smart_quotes")
      .select(
        "id, link_slug, quote_number, valid_until, pricing_config, wall_cost_config",
      )
      .eq("lead_id", lead_id)
      .single();

    const existingQuoteExpired = existingQuote
      ? isQuoteExpired(existingQuote.valid_until)
      : false;

    if (existingQuote && !regenerate && !existingQuoteExpired) {
      // Return existing unexpired quote
      const { data: fullQuote } = await supabaseAdmin
        .from("smart_quotes")
        .select("*")
        .eq("id", existingQuote.id)
        .single();

      return success<SmartQuote>(fullQuote!);
    }

    // Regenerating updates the quote in place — see the update below. It used
    // to DELETE the row and insert a fresh one, which silently destroyed the
    // engineer's rate, the issued quote number, the customer's link and its
    // engagement history.

    // Get call recordings for this lead
    const { data: recordings } = await supabaseAdmin
      .from("call_recordings")
      .select("transcription_text")
      .eq("lead_id", lead_id)
      .eq("processing_status", "completed")
      .not("transcription_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(5); // Use up to 5 most recent transcripts

    // Combine transcripts
    const combinedTranscript =
      recordings && recordings.length > 0
        ? recordings
            .map((r) => r.transcription_text)
            .filter(Boolean)
            .join("\n\n---\n\n")
        : null;

    // A new enquiry has no recorded call, and quoting does not depend on one:
    // the engineer knows the price and the customer wants it today. Without a
    // transcript the quote is built from the standard copy, with the insight
    // fields left "unknown" rather than invented. Regenerating after the first
    // call replaces all of it with the real reading.
    const aiResult = combinedTranscript
      ? await generateSmartQuoteContent(combinedTranscript, lead.name)
      : buildBaselineQuoteContent(
          lead.language_preference === "ta" ? "ta" : "en",
        );

    // Generate unique slug
    const linkSlug = generateLinkSlug(12);

    // Seed the interactive-estimate pricing config from the lead's product
    // interests + live catalog + assigned rep's WhatsApp number.
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, name, category, size, unit, base_price, is_active")
      .eq("is_active", true);
    let repPhone: string | null = null;
    if (lead.assigned_staff) {
      const { data: rep } = await supabaseAdmin
        .from("users")
        .select("phone")
        .eq("id", lead.assigned_staff)
        .single();
      repPhone = rep?.phone ?? null;
    }
    const pricingConfig = buildPricingConfig({
      products: products ?? [],
      interests: lead.product_interests,
      // The locality chip beside the estimate wants "Kotturpuram", not a full
      // postal address. `area` holds the short form; site_location the address.
      siteLocation:
        (lead as { area?: string | null }).area ?? lead.site_location,
      repPhone,
    });

    // Snapshot the founder's global wall-cost template onto this quote so the
    // rep can personalize it and the shared numbers stay frozen.
    const { data: factory } = await supabaseAdmin
      .from("factory_settings")
      .select("wall_cost_config, quote_validity_days")
      .limit(1)
      .single();
    const wallCostSnapshot = factory?.wall_cost_config ?? null;

    // A quotation is an offer, and an offer has to end. Without this the PDF
    // prints no validity date and isExpired() reads NULL as "never expires",
    // so today's rate stays presentable as current forever. The business sets
    // the window in Settings; 15 days matches the column default.
    const validityDays = factory?.quote_validity_days ?? 15;
    const validUntil = quoteValidUntilDate(validityDays);

    // What the AI just decided. These are the only fields a regenerate should
    // touch: regenerating re-reads the lead, it does not re-price the job.
    const aiFields = {
      language_default: aiResult.strategy.language_default,
      persona: aiResult.insights.persona,
      stage: aiResult.insights.stage,
      primary_angle: aiResult.insights.primary_angle,
      secondary_angle: aiResult.insights.secondary_angle,
      route_decision: aiResult.strategy.route_decision,
      top_objections: aiResult.insights.top_objections,
      risk_flags: aiResult.insights.risk_flags,
      scores: aiResult.insights.scores,
      page_config: aiResult.strategy.page_config,
      copy_map: aiResult.copyMap,
    };

    let smartQuote: SmartQuote | null = null;
    let writeError: { message: string } | null = null;

    if (existingQuote && (regenerate || existingQuoteExpired)) {
      // Update in place. The row keeps its id, link_slug and quote_number, so
      // a link already with the customer keeps working, a document already in
      // their hands keeps its reference, and view tracking survives.
      //
      // An expired quote is renewed the same way: same link and number, fresh
      // validity window. The rate is the engineer's decision, not the AI's — it
      // is carried forward untouched. Only a quote that never had one falls back
      // to the freshly seeded config.
      const { data, error: updateError } = await supabaseAdmin
        .from("smart_quotes")
        .update({
          ...aiFields,
          pricing_config: mergePricingConfig(
            existingQuote.pricing_config,
            pricingConfig as unknown as Record<string, unknown>,
          ),
          wall_cost_config: existingQuote.wall_cost_config ?? wallCostSnapshot,
          valid_until: shouldRenewQuoteValidity(existingQuote.valid_until)
            ? validUntil
            : existingQuote.valid_until,
        })
        .eq("id", existingQuote.id)
        .select()
        .single();
      smartQuote = data;
      writeError = updateError;
    } else {
      const { data, error: insertError } = await supabaseAdmin
        .from("smart_quotes")
        .insert({
          lead_id,
          link_slug: linkSlug,
          ...aiFields,
          pricing_config: pricingConfig,
          wall_cost_config: wallCostSnapshot,
          valid_until: validUntil,
        })
        .select()
        .single();
      smartQuote = data;
      writeError = insertError;
    }

    if (writeError || !smartQuote) {
      console.error("[SmartQuotes] Write error:", writeError);
      return error("Failed to create Smart Quote", 500);
    }

    return success<SmartQuote>(smartQuote);
  } catch (err) {
    console.error("[SmartQuotes] Error generating quote:", err);
    return error("Internal server error", 500);
  }
}

/**
 * Carry the engineer's pricing decisions across a regenerate, and let
 * everything the lead owns refresh.
 *
 * pricing_config holds two different kinds of thing. Some of it is a human
 * decision — the rate, the product, the quantity, the distance. The rest is
 * derived from the lead: the locality label, which products may be offered,
 * the rep's phone. Preserving the whole object froze the second kind, so a
 * lead whose address had been corrected kept showing the old locality after a
 * regenerate. Preserving none of it wiped the rate. This preserves exactly the
 * first kind.
 */
function mergePricingConfig(
  previous: unknown,
  seeded: Record<string, unknown>,
): Record<string, unknown> {
  const prev = (previous ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...seeded };

  const HUMAN_KEYS = [
    "quoted_rate",
    "default_product",
    "default_area_sqft",
    "default_distance_km",
    "price_note",
    "show_transport",
  ] as const;

  for (const key of HUMAN_KEYS) {
    if (prev[key] !== undefined && prev[key] !== null) merged[key] = prev[key];
  }

  // The catalogue is reseeded from the lead's interests, so a product the
  // engineer had already chosen could fall outside it. Keep it selectable.
  const chosen = merged.default_product;
  const allowed = merged.allowed_products;
  if (typeof chosen === "string" && Array.isArray(allowed) && !allowed.includes(chosen)) {
    merged.allowed_products = [chosen, ...allowed];
  }

  return merged;
}
