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
 *
 * Special fields (founder only):
 * - email: Updates auth.users email AND public.users email
 * - send_password_reset: If true, sends a password reset email to the user
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

    // Handle password reset request (founder only)
    if (body.send_password_reset && isFounder) {
      // Get user's email first
      const { data: userData, error: userError } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("id", id)
        .single();

      if (userError || !userData?.email) {
        return errorResponse("User not found or no email", 404);
      }

      // Generate password reset link and send email
      const { error: resetError } = await supabaseAdmin.auth.admin.generateLink(
        {
          type: "recovery",
          email: userData.email,
        },
      );

      if (resetError) {
        console.error("Password reset error:", resetError);
        return errorResponse("Failed to send password reset email", 500);
      }

      return successResponse({
        success: true,
        message: "Password reset email sent",
      });
    }

    // Handle email change (founder only)
    if (body.email && isFounder) {
      // Update email in auth.users
      const { error: authError } =
        await supabaseAdmin.auth.admin.updateUserById(id, {
          email: body.email,
        });

      if (authError) {
        console.error("Auth email update error:", authError);
        return errorResponse("Failed to update email in auth system", 500);
      }
    }

    // Restrict what fields can be updated based on role
    const allowedFields = isFounder
      ? [
          "name",
          "email",
          "phone",
          "role",
          "is_active",
          "invitation_status",
          "notification_preferences",
        ]
      : ["name", "phone", "notification_preferences", "language_preference"];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined && field !== "send_password_reset") {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0 && !body.send_password_reset) {
      return errorResponse("No valid fields to update", 400);
    }

    if (Object.keys(updates).length > 0) {
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
    }

    return successResponse({ success: true });
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
