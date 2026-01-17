export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, forbidden } from "@/lib/api-utils";
import type {
  SmartQuoteImage,
  SmartQuotePageKey,
  SmartQuoteImageScope,
} from "@maiyuri/shared";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const VALID_PAGE_KEYS: SmartQuotePageKey[] = [
  "entry",
  "climate",
  "cost",
  "objection",
  "cta",
];

const VALID_SCOPES: SmartQuoteImageScope[] = ["template", "lead_override"];

/**
 * POST /api/smart-quotes/images
 *
 * Upload a hero image for a Smart Quote page.
 * Requires founder authentication.
 *
 * FormData:
 * - file: File (image, max 10MB)
 * - page_key: 'entry' | 'climate' | 'cost' | 'objection' | 'cta'
 * - scope: 'template' | 'lead_override'
 * - smart_quote_id?: string (required if scope is 'lead_override')
 *
 * Returns: SmartQuoteImage
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return error("Authentication required", 401);
    }

    // Check user role (must be founder)
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userData || userData.role !== "founder") {
      return forbidden("Only founders can upload images");
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const pageKey = formData.get("page_key") as string | null;
    const scope = formData.get("scope") as string | null;
    const smartQuoteId = formData.get("smart_quote_id") as string | null;

    // Validate inputs
    if (!file) {
      return error("No file provided", 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return error(
        `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
        400,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return error("File too large. Maximum size is 10MB", 400);
    }

    if (!pageKey || !VALID_PAGE_KEYS.includes(pageKey as SmartQuotePageKey)) {
      return error(
        `Invalid page_key. Must be one of: ${VALID_PAGE_KEYS.join(", ")}`,
        400,
      );
    }

    if (!scope || !VALID_SCOPES.includes(scope as SmartQuoteImageScope)) {
      return error(
        `Invalid scope. Must be one of: ${VALID_SCOPES.join(", ")}`,
        400,
      );
    }

    // If lead_override scope, smart_quote_id is required
    if (scope === "lead_override" && !smartQuoteId) {
      return error("smart_quote_id is required for lead_override scope", 400);
    }

    // Validate smart_quote_id exists if provided
    if (smartQuoteId) {
      const { data: quote } = await supabaseAdmin
        .from("smart_quotes")
        .select("id")
        .eq("id", smartQuoteId)
        .single();

      if (!quote) {
        return error("Smart Quote not found", 404);
      }
    }

    // Generate file path
    const fileExt = file.name.split(".").pop() ?? "jpg";
    const timestamp = Date.now();
    const fileName =
      scope === "template"
        ? `template/${pageKey}_${timestamp}.${fileExt}`
        : `quotes/${smartQuoteId}/${pageKey}_${timestamp}.${fileExt}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("smart-quote-images")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[SmartQuoteImages] Upload error:", uploadError);
      return error("Failed to upload image", 500);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage
      .from("smart-quote-images")
      .getPublicUrl(uploadData.path);

    // Delete existing image record for this page_key + scope/quote
    if (scope === "template") {
      // Delete any existing template for this page
      await supabaseAdmin
        .from("smart_quote_images")
        .delete()
        .is("smart_quote_id", null)
        .eq("scope", "template")
        .eq("page_key", pageKey);
    } else {
      // Delete any existing override for this quote + page
      await supabaseAdmin
        .from("smart_quote_images")
        .delete()
        .eq("smart_quote_id", smartQuoteId)
        .eq("page_key", pageKey);
    }

    // Insert new image record
    const { data: imageRecord, error: insertError } = await supabaseAdmin
      .from("smart_quote_images")
      .insert({
        smart_quote_id: scope === "template" ? null : smartQuoteId,
        page_key: pageKey,
        scope,
        image_url: publicUrl,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[SmartQuoteImages] Insert error:", insertError);
      return error("Failed to save image record", 500);
    }

    return success<SmartQuoteImage>(imageRecord);
  } catch (err) {
    console.error("[SmartQuoteImages] Error:", err);
    return error("Internal server error", 500);
  }
}

/**
 * GET /api/smart-quotes/images
 *
 * List all template images (admin view).
 * Requires authentication.
 *
 * Query params:
 * - scope?: 'template' | 'lead_override' (default: 'template')
 * - smart_quote_id?: string (required if scope is 'lead_override')
 *
 * Returns: SmartQuoteImage[]
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return error("Authentication required", 401);
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "template";
    const smartQuoteId = searchParams.get("smart_quote_id");

    let query = supabaseAdmin.from("smart_quote_images").select("*");

    if (scope === "template") {
      query = query.is("smart_quote_id", null).eq("scope", "template");
    } else if (smartQuoteId) {
      query = query.eq("smart_quote_id", smartQuoteId);
    } else {
      return error("smart_quote_id required for lead_override scope", 400);
    }

    const { data: images, error: queryError } = await query;

    if (queryError) {
      console.error("[SmartQuoteImages] Query error:", queryError);
      return error("Failed to fetch images", 500);
    }

    return success<SmartQuoteImage[]>(images ?? []);
  } catch (err) {
    console.error("[SmartQuoteImages] Error:", err);
    return error("Internal server error", 500);
  }
}
