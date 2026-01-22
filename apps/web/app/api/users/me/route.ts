export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/supabase-server";
import { success, error, unauthorized } from "@/lib/api-utils";
import type { User } from "@maiyuri/shared";

// GET /api/users/me - Get current authenticated user
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);

    if (!authUser) {
      return unauthorized("Not authenticated");
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from("users")
      .select("id, email, name, role, language_preference, created_at")
      .eq("id", authUser.id)
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to fetch user profile", 500);
    }

    if (!user) {
      return error("User profile not found", 404);
    }

    return success<User>(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    return error("Internal server error", 500);
  }
}

// PUT /api/users/me - Update current user profile
export async function PUT(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);

    if (!authUser) {
      return unauthorized("Not authenticated");
    }

    const body = await request.json();
    const { name, email, language_preference } = body;

    // Only allow updating certain fields
    const updates: Record<string, string> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (
      language_preference !== undefined &&
      ["en", "ta"].includes(language_preference)
    ) {
      updates.language_preference = language_preference;
    }

    if (Object.keys(updates).length === 0) {
      return error("No valid fields to update", 400);
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", authUser.id)
      .select("id, email, name, role, language_preference, created_at")
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to update user profile", 500);
    }

    return success<User>(user);
  } catch (err) {
    console.error("Error updating user:", err);
    return error("Internal server error", 500);
  }
}
