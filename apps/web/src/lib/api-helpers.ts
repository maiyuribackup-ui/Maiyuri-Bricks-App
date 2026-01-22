import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "./supabase-server";
import { supabaseAdmin } from "./supabase-admin";
import type { UserRole } from "@maiyuri/shared";

// Re-export UserRole for convenience
export type { UserRole } from "@maiyuri/shared";

// Custom error class for auth errors
export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

// Standardized error response
export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

// Standardized success response
export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

// User with role information
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Require authentication for an API route.
 * Returns the authenticated user or throws AuthError.
 */
export async function requireAuth(
  request: NextRequest,
): Promise<AuthenticatedUser> {
  const user = await getUserFromRequest(request);

  if (!user) {
    throw new AuthError("Unauthorized: Authentication required", 401);
  }

  // Get user role from the users table
  const { data: userData, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !userData) {
    console.error("Failed to fetch user role:", error);
    throw new AuthError("Unauthorized: User not found in system", 401);
  }

  return {
    id: user.id,
    email: user.email ?? "",
    role: userData.role as UserRole,
  };
}

/**
 * Require specific role(s) for an API route.
 * Must be called after requireAuth or use this directly (it calls requireAuth internally).
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[],
): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);

  if (!allowedRoles.includes(user.role)) {
    throw new AuthError(
      `Forbidden: Requires one of these roles: ${allowedRoles.join(", ")}`,
      403,
    );
  }

  return user;
}

/**
 * Require founder role (highest privilege)
 */
export async function requireFounder(
  request: NextRequest,
): Promise<AuthenticatedUser> {
  return requireRole(request, ["founder"]);
}

/**
 * Require admin-level access (founder or owner role)
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<AuthenticatedUser> {
  return requireRole(request, ["founder", "owner"]);
}

/**
 * Handle API errors consistently.
 * Use this in catch blocks to return proper error responses.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return errorResponse(error.message, error.status);
  }

  if (error instanceof Error) {
    console.error("API Error:", error.message, error.stack);
    // Don't expose internal error details in production
    const message =
      process.env.NODE_ENV === "development"
        ? error.message
        : "Internal server error";
    return errorResponse(message, 500);
  }

  console.error("Unknown API Error:", error);
  return errorResponse("Internal server error", 500);
}

/**
 * Wrapper for API route handlers that provides automatic auth and error handling.
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   return withAuth(request, async (user) => {
 *     // user is guaranteed to be authenticated
 *     const data = await fetchData(user.id);
 *     return successResponse(data);
 *   });
 * }
 */
export async function withAuth(
  request: NextRequest,
  handler: (user: AuthenticatedUser) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);
    return await handler(user);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Wrapper for API route handlers that require specific roles.
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   return withRole(request, ['founder', 'admin'], async (user) => {
 *     // user is guaranteed to have founder or admin role
 *     await createUser(data);
 *     return successResponse({ success: true });
 *   });
 * }
 */
export async function withRole(
  request: NextRequest,
  allowedRoles: UserRole[],
  handler: (user: AuthenticatedUser) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const user = await requireRole(request, allowedRoles);
    return await handler(user);
  } catch (error) {
    return handleApiError(error);
  }
}
