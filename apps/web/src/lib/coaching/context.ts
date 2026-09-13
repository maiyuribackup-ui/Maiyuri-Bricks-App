/**
 * Coaching auth/context helpers. Resolves the current user + role, exposes an
 * admin check (founder/owner), and lazily provisions the learner's coach_users
 * row so every authenticated user can use the Coach immediately.
 */
import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CoachUser } from "@maiyuri/shared";

const ADMIN_ROLES = new Set(["founder", "owner"]);

export interface CoachContext {
  userId: string;
  role: string | null;
  isAdmin: boolean;
}

/** Returns the auth context, or null when unauthenticated. */
export async function getCoachContext(
  request: NextRequest,
): Promise<CoachContext | null> {
  const user = await getUserFromRequest(request);
  if (!user) return null;

  let role: string | null = null;
  try {
    const { data } = await getSupabaseAdmin()
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    role = (data?.role as string) ?? null;
  } catch {
    role = null;
  }

  return { userId: user.id, role, isAdmin: role ? ADMIN_ROLES.has(role) : false };
}

/**
 * Ensure a coach_users profile exists for this user; returns it.
 * Default training path is derived from their app role when recognisable.
 */
export async function getOrCreateCoachUser(
  userId: string,
  appRole?: string | null,
): Promise<CoachUser> {
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("coach_users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing as CoachUser;

  const trainingPath =
    appRole === "sales"
      ? "sales_executive"
      : appRole === "engineer"
        ? "site_engineer"
        : appRole === "accountant"
          ? "accounts_assistant"
          : appRole === "driver"
            ? "delivery_coordinator"
            : "production_supervisor";

  const { data: created, error } = await admin
    .from("coach_users")
    .insert({ user_id: userId, role: appRole ?? null, training_path: trainingPath })
    .select()
    .single();
  if (error || !created) {
    throw new Error(`Failed to provision coach_users: ${error?.message ?? "unknown"}`);
  }
  return created as CoachUser;
}
