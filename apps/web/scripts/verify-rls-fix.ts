/**
 * Verify RLS fix was applied
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function verify() {
  console.log("🔍 Verifying RLS fix...\n");
  console.log("Database URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  // Test the is_founder function
  const { data, error } = await supabase.rpc("is_founder", {
    user_id: "efbb6b34-e3b0-4d79-8913-65c85da1c0b6",
  });

  if (error) {
    console.log("\n❌ is_founder function NOT found:", error.message);
    console.log("\nThe migration was NOT applied to production!");
  } else {
    console.log("\n✅ is_founder function exists, result:", data);
  }

  // Try to get users with an authenticated client simulation
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Sign in as ram@maiyuri.app to test
  const { data: authData, error: authError } =
    await anonClient.auth.signInWithPassword({
      email: "ram@maiyuri.app",
      password: process.env.E2E_TEST_PASSWORD || "",
    });

  if (authError) {
    console.log("\n⚠️  Could not sign in to test RLS:", authError.message);
  } else {
    console.log("\n✅ Signed in as:", authData.user?.email);

    // Now try to get users
    const { data: users, error: usersError } = await anonClient
      .from("users")
      .select("email, role");

    if (usersError) {
      console.log("❌ Error fetching users:", usersError.message);
    } else {
      console.log(`✅ Can see ${users?.length || 0} users`);
      users?.forEach((u) => console.log(`   - ${u.email} (${u.role})`));
    }
  }
}

verify().catch(console.error);
