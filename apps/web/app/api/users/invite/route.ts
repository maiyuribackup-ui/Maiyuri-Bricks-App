import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient, getUserFromRequest } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendInvitationEmail } from '@/lib/email';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * POST /api/users/invite
 * Invite a new staff member (founder only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);

    // Check authentication (supports both cookies and Bearer token)
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is founder
    const { data: currentUser, error: roleError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('[Invite] User ID:', user.id, 'Email:', user.email);
    console.log('[Invite] Role query result:', currentUser, 'Error:', roleError);

    if (!currentUser || currentUser.role !== 'founder') {
      // Try with admin client as fallback
      const { data: adminCheck } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      console.log('[Invite] Admin check:', adminCheck);

      if (!adminCheck || adminCheck.role !== 'founder') {
        return NextResponse.json(
          { error: 'Only founders can invite staff' },
          { status: 403 }
        );
      }
    }

    // Parse request body
    const body = await request.json();
    const { email, name, phone, role } = body;

    if (!email || !name || !role) {
      return NextResponse.json(
        { error: 'Email, name, and role are required' },
        { status: 400 }
      );
    }

    if (!['founder', 'accountant', 'engineer'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be founder, accountant, or engineer' },
        { status: 400 }
      );
    }

    // Generate invitation token upfront
    const invitationToken = uuidv4();
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7); // 7 days

    // Check if user already exists (use admin to bypass RLS)
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, invitation_status')
      .eq('email', email)
      .single();

    if (existingUser) {
      if (existingUser.invitation_status === 'active') {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 409 }
        );
      }
      // If pending, we can resend the invitation
    }

    // Also check if auth user exists but not in public.users (edge case)
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = authUsers?.users?.find(u => u.email === email);
    if (existingAuthUser && !existingUser) {
      // Auth user exists but no public.users record - create one
      console.log('[Invite] Found orphan auth user, creating public.users record');
      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: existingAuthUser.id,
          email,
          name,
          phone: phone || null,
          role,
          invitation_token: invitationToken,
          invitation_expires_at: invitationExpiresAt.toISOString(),
          invitation_status: 'pending',
          is_active: false,
        });

      if (insertError) {
        console.error('Failed to create user record for orphan auth user:', insertError);
        return NextResponse.json(
          { error: 'Failed to create invitation', details: insertError.message },
          { status: 500 }
        );
      }

      // Send invitation email
      const emailResult = await sendInvitationEmail(email, name, role, invitationToken);

      return NextResponse.json({
        success: true,
        message: `Invitation sent to ${email}`,
        emailSent: emailResult.success,
      });
    }

    if (existingUser) {
      // Update existing pending invitation (use admin to bypass RLS)
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          name,
          phone: phone || null,
          role,
          invitation_token: invitationToken,
          invitation_expires_at: invitationExpiresAt.toISOString(),
          invitation_status: 'pending',
        })
        .eq('id', existingUser.id);

      if (updateError) {
        console.error('Failed to update invitation:', updateError);
        return NextResponse.json(
          { error: 'Failed to update invitation' },
          { status: 500 }
        );
      }
    } else {
      // First, create an auth user with a temporary password (they'll set their own on accept)
      const tempPassword = crypto.randomBytes(32).toString('hex');

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: false, // Don't confirm email yet
        user_metadata: {
          name,
          role,
          invitation_pending: true,
        },
      });

      if (authError) {
        console.error('Failed to create auth user:', authError);
        return NextResponse.json(
          { error: 'Failed to create invitation', details: authError.message },
          { status: 500 }
        );
      }

      // Now create the public.users record with the auth user's ID
      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: authUser.user.id, // Use the auth user's ID to satisfy FK constraint
          email,
          name,
          phone: phone || null,
          role,
          invitation_token: invitationToken,
          invitation_expires_at: invitationExpiresAt.toISOString(),
          invitation_status: 'pending',
          is_active: false, // Not active until they accept
        });

      if (insertError) {
        console.error('Failed to create user record:', insertError);
        // Clean up the auth user we just created
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        return NextResponse.json(
          { error: 'Failed to create invitation', details: insertError.message },
          { status: 500 }
        );
      }
    }

    // Send invitation email
    const emailResult = await sendInvitationEmail(
      email,
      name,
      role,
      invitationToken
    );

    if (!emailResult.success) {
      console.error('Failed to send invitation email:', emailResult.error);
      // Don't fail the request, just log the error
      // The invitation is still valid
    }

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}`,
      emailSent: emailResult.success,
    });
  } catch (error) {
    console.error('Invite user error:', error);
    return NextResponse.json(
      { error: 'Failed to invite user' },
      { status: 500 }
    );
  }
}
