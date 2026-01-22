import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendPasswordResetEmail } from "@/lib/email";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(request: Request) {
  // Debug: Check if env vars are available
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(`[forgot-password] Env check - URL: ${hasUrl}, KEY: ${hasKey}`);

  try {
    const body = await request.json();
    const result = forgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 },
      );
    }

    const { email } = result.data;
    const supabaseAdmin = getSupabaseAdmin();

    // Check if user exists in public.users
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, name, email")
      .eq("email", email)
      .single();

    // For security, always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (userError || !user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return NextResponse.json({
        success: true,
        message:
          "If an account exists with this email, you will receive a password reset link.",
      });
    }

    // Generate recovery link using admin API
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://maiyuri-bricks-app.vercel.app";
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: {
          redirectTo: `${appUrl}/reset-password`,
        },
      });

    if (linkError) {
      console.error("Failed to generate recovery link:", linkError);
      return NextResponse.json(
        { error: "Failed to generate password reset link" },
        { status: 500 },
      );
    }

    // The action_link from Supabase contains the token
    // We need to transform it to use our app URL
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      console.error("No action link in response:", linkData);
      return NextResponse.json(
        { error: "Failed to generate password reset link" },
        { status: 500 },
      );
    }

    // Extract the hash parameters from Supabase's action link
    // Supabase link format: https://project.supabase.co/auth/v1/verify?token=xxx&type=recovery&redirect_to=...
    // We need to transform it to work with our app
    const supabaseUrl = new URL(actionLink);
    const token = supabaseUrl.searchParams.get("token");
    const type = supabaseUrl.searchParams.get("type");

    // Build our reset URL that will be handled by the reset-password page
    // The page expects the token in the URL hash as #access_token=xxx&type=recovery
    // However, Supabase PKCE flow uses a different approach
    // Let's use the action_link directly - Supabase will handle the redirect
    const resetUrl = actionLink;

    // Send the password reset email
    const emailResult = await sendPasswordResetEmail(
      email,
      user.name || "User",
      resetUrl,
    );

    if (!emailResult.success) {
      console.error("Failed to send password reset email:", emailResult.error);
      return NextResponse.json(
        { error: "Failed to send password reset email" },
        { status: 500 },
      );
    }

    console.log(`Password reset email sent to: ${email}`);
    return NextResponse.json({
      success: true,
      message:
        "If an account exists with this email, you will receive a password reset link.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "An unexpected error occurred", details: errorMessage },
      { status: 500 },
    );
  }
}
