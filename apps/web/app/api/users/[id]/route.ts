import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  requireAuth,
  requireFounder,
  handleApiError,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/users/[id]
 * Get a specific user by ID
 * SECURITY: Requires authentication
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Require authentication
    await requireAuth(request);

    const { data: userData, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !userData) {
      return errorResponse("User not found", 404);
    }

    return successResponse({ data: userData });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/users/[id]
 * Update a user (founder only for other users, self for own profile)
 * SECURITY: Requires authentication, founder role for modifying others
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Require authentication and get user info
    const currentUser = await requireAuth(request);

    const isFounder = currentUser.role === "founder";
    const isOwnProfile = currentUser.id === id;

    if (!isFounder && !isOwnProfile) {
      return errorResponse("Only founders can update other users", 403);
    }

    const body = await request.json();

    // Restrict what fields can be updated based on role
    const allowedFields = isFounder
      ? [
          "name",
          "phone",
          "role",
          "is_active",
          "invitation_status",
          "notification_preferences",
        ]
      : ["name", "phone", "notification_preferences", "language_preference"];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", 400);
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Update user error:", error);
      return errorResponse("Failed to update user", 500);
    }

    return successResponse({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/users/[id]
 * Soft delete a user (founder only)
 * SECURITY: Requires founder role
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Require founder role for user deletion
    const currentUser = await requireFounder(request);

    // Prevent self-deletion
    if (currentUser.id === id) {
      return errorResponse("Cannot delete your own account", 400);
    }

    // Soft delete - just deactivate
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        is_active: false,
        invitation_status: "deactivated",
      })
      .eq("id", id);

    if (error) {
      console.error("Delete user error:", error);
      return errorResponse("Failed to delete user", 500);
    }

    return successResponse({
      success: true,
      message: "User deactivated",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
