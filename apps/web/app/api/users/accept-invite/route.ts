import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWelcomeEmail } from '@/lib/email';

// Use service role client for user creation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * POST /api/users/accept-invite
 * Accept an invitation and create the user account
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }

    // Validate password
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Find the invitation
    const { data: invitation, error: findError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('invitation_token', token)
      .eq('invitation_status', 'pending')
      .single();

    if (findError || !invitation) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 400 }
      );
    }

    // Check if invitation has expired
    if (new Date(invitation.invitation_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Create the auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true, // Auto-confirm since they were invited
      user_metadata: {
        name: invitation.name,
        role: invitation.role,
        phone: invitation.phone,
      },
    });

    if (authError) {
      console.error('Failed to create auth user:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 500 }
      );
    }

    // Update the users table with the real auth user ID
    // First, delete the temporary record
    await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', invitation.id);

    // Then insert with the real auth user ID
    // Note: The trigger on auth.users should handle this automatically
    // But we update to make sure the invitation fields are cleared
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: authUser.user.id,
        email: invitation.email,
        name: invitation.name,
        phone: invitation.phone,
        role: invitation.role,
        invitation_token: null,
        invitation_expires_at: null,
        invitation_status: 'active',
        is_active: true,
        notification_preferences: invitation.notification_preferences || {
          email: true,
          whatsapp: false,
          daily_summary: true,
        },
      });

    if (updateError) {
      console.error('Failed to update user record:', updateError);
      // Don't fail - the user was created, they just might need manual fixing
    }

    // Send welcome email
    await sendWelcomeEmail(invitation.email, invitation.name, invitation.role);

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/users/accept-invite
 * Validate an invitation token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Find the invitation
    const { data: invitation, error: findError } = await supabaseAdmin
      .from('users')
      .select('email, name, role, invitation_expires_at')
      .eq('invitation_token', token)
      .eq('invitation_status', 'pending')
      .single();

    if (findError || !invitation) {
      return NextResponse.json(
        { valid: false, error: 'Invalid invitation' },
        { status: 400 }
      );
    }

    // Check if invitation has expired
    if (new Date(invitation.invitation_expires_at) < new Date()) {
      return NextResponse.json(
        { valid: false, error: 'This invitation has expired' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
    });
  } catch (error) {
    console.error('Validate invite error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to validate invitation' },
      { status: 500 }
    );
  }
}
