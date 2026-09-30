import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Email transport: Gmail SMTP (switched from Resend, whose key died and whose
 * test sender couldn't reach non-owner recipients without domain DNS).
 * Requires two Vercel env vars:
 *   GMAIL_SMTP_USER          — the Gmail address (maiyuribricks@gmail.com)
 *   GMAIL_SMTP_APP_PASSWORD  — a Google "App password" (needs 2-Step
 *                              Verification on the account)
 * Gmail free tier ≈ 500 mails/day — far above this app's volume.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const user = process.env.GMAIL_SMTP_USER;
    const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
    if (!user || !pass) {
      throw new Error(
        'Email is not configured: set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD',
      );
    }
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return transporter;
}

// Gmail rewrites the sender to the authenticated account; the display name sticks.
const FROM_EMAIL = `Maiyuri Bricks <${process.env.GMAIL_SMTP_USER ?? 'maiyuribricks@gmail.com'}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://maiyuri-bricks-app.vercel.app';

/**
 * Resend-shaped wrapper over SMTP so the four senders below keep their
 * original structure ({ data, error } destructuring) untouched.
 */
async function sendViaSmtp(opts: {
  from?: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  try {
    const info = await getTransporter().sendMail({
      from: opts.from ?? FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { data: { id: info.messageId }, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'SMTP send failed' },
    };
  }
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send staff invitation email
 */
export async function sendInvitationEmail(
  email: string,
  name: string,
  role: string,
  invitationToken: string
): Promise<SendEmailResult> {
  const inviteUrl = `${APP_URL}/accept-invite?token=${invitationToken}`;
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  try {
    const { data, error } = await sendViaSmtp({
      from: FROM_EMAIL,
      to: email,
      subject: 'You are invited to join Maiyuri Bricks Lead Management',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🧱 Maiyuri Bricks</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Lead Management System</p>
          </div>

          <div style="background: #fff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #333; margin-top: 0;">Welcome, ${name}!</h2>

            <p>You have been invited to join the Maiyuri Bricks Lead Management system as <strong>${roleLabel}</strong>.</p>

            <p>Click the button below to set up your account:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background: #f97316; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>

            <p style="color: #666; font-size: 14px;">
              This invitation link will expire in 7 days. If the button doesn't work, copy and paste this URL into your browser:
            </p>
            <p style="color: #666; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 6px;">
              ${inviteUrl}
            </p>

            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; margin: 0;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send invitation email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Email service error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email'
    };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<SendEmailResult> {
  try {
    const { data, error } = await sendViaSmtp({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your Maiyuri Bricks password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🧱 Maiyuri Bricks</h1>
          </div>

          <div style="background: #fff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>

            <p>Hi ${name},</p>

            <p>We received a request to reset your password. Click the button below to create a new password:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #f97316; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Reset Password
              </a>
            </div>

            <p style="color: #666; font-size: 14px;">
              This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
            </p>

            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; margin: 0;">
              For security, this request was received from your account.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Email service error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email'
    };
  }
}

/**
 * Send welcome email after account creation
 */
export async function sendWelcomeEmail(
  email: string,
  name: string,
  role: string
): Promise<SendEmailResult> {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const dashboardUrl = `${APP_URL}/dashboard`;

  try {
    const { data, error } = await sendViaSmtp({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to Maiyuri Bricks!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🧱 Maiyuri Bricks</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Lead Management System</p>
          </div>

          <div style="background: #fff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #333; margin-top: 0;">Welcome aboard, ${name}! 🎉</h2>

            <p>Your account has been successfully created. You are now a <strong>${roleLabel}</strong> in the Maiyuri Bricks Lead Management system.</p>

            <div style="background: #fef3e2; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #9a3412;">
                <strong>Quick Start:</strong> Log in to view leads, manage notes, and track customer interactions.
              </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}" style="display: inline-block; background: #f97316; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Go to Dashboard
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">

            <p style="color: #999; font-size: 12px; margin: 0;">
              Need help? Contact your administrator.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Email service error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email'
    };
  }
}

/**
 * Send notification email (generic)
 */
export async function sendNotificationEmail(
  email: string,
  subject: string,
  content: string
): Promise<SendEmailResult> {
  try {
    const { data, error } = await sendViaSmtp({
      from: FROM_EMAIL,
      to: email,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🧱 Maiyuri Bricks</h1>
          </div>

          <div style="background: #fff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
            ${content}
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send notification email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Email service error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email'
    };
  }
}
