// Auth middleware

import type { UserRole } from '@maiyuri/shared';
import { getCurrentUser, getUserRole } from './auth';

export interface AuthContext {
  userId: string;
  role: UserRole;
}

export async function requireAuth(): Promise<AuthContext> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized: No authenticated user');
  }

  const role = await getUserRole(user.id);

  if (!role) {
    throw new Error('Unauthorized: User role not found');
  }

  return { userId: user.id, role };
}

export async function requireRole(allowedRoles: UserRole[]): Promise<AuthContext> {
  const context = await requireAuth();

  if (!allowedRoles.includes(context.role)) {
    throw new Error(`Forbidden: Required role ${allowedRoles.join(' or ')}`);
  }

  return context;
}

export async function requireFounder(): Promise<AuthContext> {
  return requireRole(['founder']);
}
