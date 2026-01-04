import { NextRequest } from 'next/server';
import { supabaseAdmin, getUserFromRequest } from '@/lib/supabase';
import { success, error, unauthorized } from '@/lib/api-utils';
import type { User } from '@maiyuri/shared';

// GET /api/users/me - Get current authenticated user
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);

    if (!authUser) {
      return unauthorized('Not authenticated');
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, created_at')
      .eq('id', authUser.id)
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to fetch user profile', 500);
    }

    if (!user) {
      return error('User profile not found', 404);
    }

    return success<User>(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    return error('Internal server error', 500);
  }
}
