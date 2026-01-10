import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendInvitationEmail } from '@/lib/email';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/users/invite
 * Invite a new staff member (founder only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
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

    // Check if user already exists
    const { data: existingUser } = await supabase
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

    // Generate invitation token
    const invitationToken = uuidv4();
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7); // 7 days

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
      // Create a pending invitation record (use admin to bypass RLS)
      // Note: We don't create the auth.users entry yet - that happens when they accept
      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: uuidv4(), // Temporary ID, will be replaced when auth user is created
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
        console.error('Failed to create invitation:', insertError);
        return NextResponse.json(
          { error: 'Failed to create invitation' },
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
