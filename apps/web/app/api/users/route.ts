export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error, created } from "@/lib/api-utils";
import { requireAuth, requireFounder, handleApiError } from "@/lib/api-helpers";
import type { User } from "@maiyuri/shared";

// POST /api/users - Create a new user (creates auth user first, then profile)
// SECURITY: Requires founder role for user management
export async function POST(request: NextRequest) {
  try {
    // Require founder role for creating users
    await requireFounder(request);

    const body = await request.json();
    const { email, name, role, password, seed } = body;

    // Seed mode - bulk create users
    // SECURITY: Only allowed in development, requires founder role
    if (seed && Array.isArray(body.users)) {
      // Block seed mode in production
      if (process.env.NODE_ENV === "production") {
        return error("Seed mode is disabled in production", 403);
      }

      const results = [];
      for (const userData of body.users) {
        try {
          // Check if user already exists
          const { data: existing } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("email", userData.email)
            .single();

          if (existing) {
            // Update existing user
            const { data: updated } = await supabaseAdmin
              .from("users")
              .update({ name: userData.name, role: userData.role })
              .eq("email", userData.email)
              .select()
              .single();
            results.push({ ...updated, status: "updated" });
          } else {
            // Create new auth user - password is required
            if (!userData.password) {
              results.push({
                email: userData.email,
                status: "error",
                error: "Password is required for new users",
              });
              continue;
            }
            const { data: authData, error: authError } =
              await supabaseAdmin.auth.admin.createUser({
                email: userData.email,
                password: userData.password,
                email_confirm: true,
              });

            if (authError) {
              results.push({
                email: userData.email,
                status: "auth_error",
                error: authError.message,
              });
              continue;
            }

            // Create profile
            const { data: newUser, error: profileError } = await supabaseAdmin
              .from("users")
              .insert({
                id: authData.user.id,
                email: userData.email,
                name: userData.name,
                role: userData.role,
              })
              .select()
              .single();

            if (profileError) {
              await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
              results.push({
                email: userData.email,
                status: "profile_error",
                error: profileError.message,
              });
            } else {
              results.push({ ...newUser, status: "created" });
            }
          }
        } catch (err) {
          results.push({
            email: userData.email,
            status: "error",
            error: String(err),
          });
        }
      }
      return success(results);
    }

    if (!email || !name || !role || !password) {
      return error("Email, name, role, and password are required", 400);
    }

    const validRoles = ["founder", "accountant", "engineer", "sales", "admin"];
    if (!validRoles.includes(role)) {
      return error(
        `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        400,
      );
    }

    // Check if user already exists
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      // Update existing user
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("users")
        .update({ name, role })
        .eq("email", email)
        .select()
        .single();

      if (updateError) {
        return error(updateError.message, 500);
      }
      return success(updated);
    }

    // Create auth user first (password is required and validated above)
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      console.error("Auth error:", authError);
      return error(authError.message || "Failed to create auth user", 500);
    }

    // Create user profile
    const { data: user, error: dbError } = await supabaseAdmin
      .from("users")
      .insert({
        id: authData.user.id,
        email,
        name,
        role,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Rollback auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return error(dbError.message || "Failed to create user profile", 500);
    }

    return created(user);
  } catch (err) {
    return handleApiError(err);
  }
}

// GET /api/users - List all users (for assignment dropdowns)
// SECURITY: Requires authentication (any role can list users for assignment)
export async function GET(request: NextRequest) {
  try {
    // Require authentication (any authenticated user can list users)
    await requireAuth(request);

    const { data: users, error: dbError } = await supabaseAdmin
      .from("users")
      .select(
        "id, email, name, role, phone, language_preference, invitation_status, is_active, created_at",
      )
      .order("name");

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to fetch users", 500);
    }

    return success<User[]>(users || []);
  } catch (err) {
    return handleApiError(err);
  }
}
