import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error } from '@/lib/api-utils';
import type { User } from '@maiyuri/shared';

// GET /api/users - List all users (for assignment dropdowns)
export async function GET(request: NextRequest) {
  try {
    const { data: users, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, created_at')
      .order('name');

    if (dbError) {
      console.error('Database error:', dbError);
      return error('Failed to fetch users', 500);
    }

    return success<User[]>(users || []);
  } catch (err) {
    console.error('Error fetching users:', err);
    return error('Internal server error', 500);
  }
}
