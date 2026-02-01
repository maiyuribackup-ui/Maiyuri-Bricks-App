export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error, forbidden, notFound } from "@/lib/api-utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/smart-quotes/images/[id]
 *
 * Delete a Smart Quote image.
 * Requires founder authentication.
 *
 * Returns: { deleted: true }
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

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
      return forbidden("Only founders can delete images");
    }

    // Get the image record to find the storage path
    const { data: image, error: fetchError } = await supabaseAdmin
      .from("smart_quote_images")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !image) {
      return notFound("Image not found");
    }

    // Extract storage path from URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/smart-quote-images/template/entry_123.jpg
    const urlParts = image.image_url.split("/smart-quote-images/");
    const storagePath = urlParts[1];

    // Delete from storage if path exists
    if (storagePath) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("smart-quote-images")
        .remove([storagePath]);

      if (storageError) {
        console.error("[SmartQuoteImages] Storage delete error:", storageError);
        // Continue with DB deletion even if storage fails
      }
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from("smart_quote_images")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[SmartQuoteImages] Delete error:", deleteError);
      return error("Failed to delete image", 500);
    }

    return success({ deleted: true });
  } catch (err) {
    console.error("[SmartQuoteImages] Error:", err);
    return error("Internal server error", 500);
  }
}
