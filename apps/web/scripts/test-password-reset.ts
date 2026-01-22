/**
 * Test password reset flow end-to-end
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

const TEST_EMAIL = "ram@maiyuri.app";

async function testPasswordReset() {
  console.log("🧪 Testing Password Reset Flow\n");
  console.log("=".repeat(50));

  // Step 1: Test forgot-password API
  console.log("\n📧 Step 1: Testing /api/auth/forgot-password API...");

  try {
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL }),
    });

    const forgotData = await forgotRes.json();
    console.log(`   Status: ${forgotRes.status}`);
    console.log(`   Response:`, forgotData);

    if (forgotRes.ok && forgotData.success) {
      console.log("   ✅ Forgot password API works");
      console.log("   📬 Password reset email should be sent to:", TEST_EMAIL);
      console.log("   👉 Check your inbox for the reset link!");
    } else {
      console.log("   ❌ Forgot password API failed");
    }
  } catch (err) {
    console.log("   ❌ Error calling forgot-password API:", err);
  }

  // Step 2: Test Supabase password reset directly
  console.log("\n🔑 Step 2: Testing Supabase resetPasswordForEmail...");

  const { data: resetData, error: resetError } =
    await anonClient.auth.resetPasswordForEmail(TEST_EMAIL, {
      redirectTo: `${baseUrl}/reset-password`,
    });

  if (resetError) {
    console.log("   ❌ Supabase reset failed:", resetError.message);
  } else {
    console.log("   ✅ Supabase reset email sent (check inbox)");
  }

  // Step 3: Test admin generateLink (what Manage Credentials uses)
  console.log("\n🔗 Step 3: Testing admin generateLink for recovery...");

  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: TEST_EMAIL,
    });

  if (linkError) {
    console.log("   ❌ Generate link failed:", linkError.message);
  } else {
    console.log("   ✅ Recovery link generated");
    console.log("   Link properties:", {
      hasToken: !!linkData?.properties?.hashed_token,
      hasActionLink: !!linkData?.properties?.action_link,
    });

    // Extract the token from action_link if available
    if (linkData?.properties?.action_link) {
      const url = new URL(linkData.properties.action_link);
      console.log("   Action link host:", url.host);
      console.log("   Has token param:", url.searchParams.has("token"));
    }
  }

  // Step 4: Check reset-password page endpoint
  console.log("\n📄 Step 4: Testing /reset-password page...");

  try {
    const pageRes = await fetch(`${baseUrl}/reset-password`);
    console.log(`   Status: ${pageRes.status}`);

    if (pageRes.ok) {
      console.log("   ✅ Reset password page loads");
    } else {
      console.log("   ❌ Reset password page failed");
    }
  } catch (err) {
    console.log("   ❌ Error:", err);
  }

  // Step 5: Test reset-password API
  console.log("\n🔄 Step 5: Testing /api/auth/reset-password API...");

  try {
    // Test with invalid token (should fail gracefully)
    const resetApiRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "invalid-test-token",
        password: "NewPassword123!",
      }),
    });

    const resetApiData = await resetApiRes.json();
    console.log(`   Status: ${resetApiRes.status}`);
    console.log(`   Response:`, resetApiData);

    if (resetApiRes.status === 400 || resetApiRes.status === 401) {
      console.log("   ✅ API correctly rejects invalid token");
    } else if (resetApiRes.ok) {
      console.log("   ⚠️  API accepted invalid token (unexpected)");
    }
  } catch (err) {
    console.log("   ❌ Error:", err);
  }

  console.log("\n" + "=".repeat(50));
  console.log("🏁 Test complete!\n");
}

testPasswordReset().catch(console.error);
