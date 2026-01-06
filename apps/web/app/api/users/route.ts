import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, created } from '@/lib/api-utils';
import type { User } from '@maiyuri/shared';
import { randomUUID } from 'crypto';

// POST /api/users - Create a new user (creates auth user first, then profile)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, role, password, seed } = body;

    // Seed mode - bulk create users
    if (seed && Array.isArray(body.users)) {
      const results = [];
      for (const userData of body.users) {
        try {
          // Check if user already exists
          const { data: existing } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', userData.email)
            .single();

          if (existing) {
            // Update existing user
            const { data: updated } = await supabaseAdmin
              .from('users')
              .update({ name: userData.name, role: userData.role })
              .eq('email', userData.email)
              .select()
              .single();
            results.push({ ...updated, status: 'updated' });
          } else {
            // Create new auth user
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
              email: userData.email,
              password: userData.password || 'TempPass123!',
              email_confirm: true,
            });

            if (authError) {
              results.push({ email: userData.email, status: 'auth_error', error: authError.message });
              continue;
            }

            // Create profile
            const { data: newUser, error: profileError } = await supabaseAdmin
              .from('users')
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
              results.push({ email: userData.email, status: 'profile_error', error: profileError.message });
            } else {
              results.push({ ...newUser, status: 'created' });
            }
          }
        } catch (err) {
          results.push({ email: userData.email, status: 'error', error: String(err) });
        }
      }
      return success(results);
    }

    if (!email || !name || !role) {
      return error('Email, name, and role are required', 400);
    }

    const validRoles = ['founder', 'accountant', 'engineer'];
    if (!validRoles.includes(role)) {
      return error(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400);
    }

    // Check if user already exists
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      // Update existing user
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('users')
        .update({ name, role })
        .eq('email', email)
        .select()
        .single();

      if (updateError) {
        return error(updateError.message, 500);
      }
      return success(updated);
    }

    // Create auth user first
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || 'TempPass123!',
      email_confirm: true,
    });

    if (authError) {
      console.error('Auth error:', authError);
      return error(authError.message || 'Failed to create auth user', 500);
    }

    // Create user profile
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        name,
        role,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Rollback auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return error(dbError.message || 'Failed to create user profile', 500);
    }

    return created(user);
  } catch (err) {
    console.error('Error creating user:', err);
    return error('Internal server error', 500);
  }
}

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
