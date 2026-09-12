/**
 * Production module authorization helper
 *
 * Production API routes use the service-role Supabase client, which bypasses
 * RLS. Every mutating route must therefore enforce roles here — middleware
 * only guarantees an authenticated session, not an authorized one.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { unauthorized, forbidden } from "@/lib/api-utils";

/** Roles allowed to create/edit production orders, shifts, and syncs */
export const PRODUCTION_WRITE_ROLES = [
  "founder",
  "owner",
  "production_supervisor",
] as const;

/** Roles allowed to delete production orders */
export const PRODUCTION_DELETE_ROLES = ["founder", "owner"] as const;

interface AuthResult {
  user: { id: string };
  role: string;
  errorResponse: null;
}

interface AuthFailure {
  user: null;
  role: null;
  errorResponse: NextResponse;
}

/**
 * Verify the request comes from a user whose role is in `allowedRoles`.
 * Returns the user on success, or an errorResponse to return directly.
 */
export async function requireProductionRole(
  request: NextRequest,
  allowedRoles: readonly string[] = PRODUCTION_WRITE_ROLES,
): Promise<AuthResult | AuthFailure> {
  // Cookie session (web) OR Bearer token (native app)
  const user = await getUserFromRequest(request);

  if (!user) {
    return { user: null, role: null, errorResponse: unauthorized() };
  }

  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = userData?.role ?? "";

  if (!allowedRoles.includes(role)) {
    return {
      user: null,
      role: null,
      errorResponse: forbidden(
        "You do not have permission to perform this production action",
      ),
    };
  }

  return { user: { id: user.id }, role, errorResponse: null };
}
