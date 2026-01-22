import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error } from "@/lib/api-utils";

// POST /api/users/sync - Sync auth users with profiles
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { users } = body;

    if (!users || !Array.isArray(users)) {
      return error("users array is required", 400);
    }

    const results = [];

    // Get all auth users
    const { data: authUsers, error: authError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      return error(authError.message, 500);
    }

    for (const userData of users) {
      // Find auth user by email
      const authUser = authUsers.users.find((u) => u.email === userData.email);

      if (!authUser) {
        // Create auth user - password is required for new users
        if (!userData.password) {
          results.push({
            email: userData.email,
            status: "error",
            error: "Password is required for new users",
          });
          continue;
        }
        const { data: newAuth, error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email: userData.email,
            password: userData.password,
            email_confirm: true,
          });

        if (createError) {
          results.push({
            email: userData.email,
            status: "auth_error",
            error: createError.message,
          });
          continue;
        }

        // Create profile
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("users")
          .upsert({
            id: newAuth.user.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
          })
          .select()
          .single();

        if (profileError) {
          results.push({
            email: userData.email,
            status: "profile_error",
            error: profileError.message,
          });
        } else {
          results.push({ ...profile, status: "created" });
        }
      } else {
        // Auth user exists, upsert profile
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("users")
          .upsert({
            id: authUser.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
          })
          .select()
          .single();

        if (profileError) {
          results.push({
            email: userData.email,
            status: "profile_error",
            error: profileError.message,
          });
        } else {
          results.push({ ...profile, status: "synced" });
        }
      }
    }

    return success(results);
  } catch (err) {
    console.error("Error syncing users:", err);
    return error("Internal server error", 500);
  }
}
