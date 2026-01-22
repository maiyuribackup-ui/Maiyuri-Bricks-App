/**
 * Debug authentication issues
 * Run with: npx tsx scripts/debug-auth.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function debugAuth() {
  console.log("🔍 Debugging authentication...\n");

  // 1. Check auth users
  const { data: authData } = await adminClient.auth.admin.listUsers();
  console.log("Auth users:");
  for (const user of authData?.users || []) {
    console.log(
      `  - ${user.email} (confirmed: ${user.email_confirmed_at ? "yes" : "NO"})`,
    );
  }

  // 2. Check if ram@maiyuri.app exists and is confirmed
  const ramUser = authData?.users.find((u) => u.email === "ram@maiyuri.app");
  if (ramUser) {
    console.log("\n📧 ram@maiyuri.app details:");
    console.log(`  ID: ${ramUser.id}`);
    console.log(
      `  Email confirmed: ${ramUser.email_confirmed_at ? "yes" : "NO"}`,
    );
    console.log(`  Last sign in: ${ramUser.last_sign_in_at || "never"}`);
    console.log(`  Created: ${ramUser.created_at}`);
  }

  // 3. Check public.users for ram@maiyuri.app
  const { data: publicUser, error } = await adminClient
    .from("users")
    .select("*")
    .eq("email", "ram@maiyuri.app")
    .single();

  if (publicUser) {
    console.log("\n📋 public.users record:");
    console.log(`  ID: ${publicUser.id}`);
    console.log(`  Name: ${publicUser.name}`);
    console.log(`  Role: ${publicUser.role}`);
    console.log(`  Active: ${publicUser.is_active}`);
    console.log(`  Status: ${publicUser.invitation_status}`);
  } else {
    console.log("\n❌ No public.users record found for ram@maiyuri.app");
    console.log("Error:", error?.message);
  }

  // 4. Test if IDs match
  if (ramUser && publicUser) {
    if (ramUser.id === publicUser.id) {
      console.log("\n✅ Auth ID matches public.users ID");
    } else {
      console.log("\n❌ ID MISMATCH!");
      console.log(`  Auth ID: ${ramUser.id}`);
      console.log(`  Public ID: ${publicUser.id}`);
    }
  }

  // 5. Try to query users with service role (bypasses RLS)
  console.log("\n📊 All users via service role (bypasses RLS):");
  const { data: allUsers } = await adminClient
    .from("users")
    .select("email, role, is_active");
  console.log(`  Found ${allUsers?.length || 0} users`);

  // 6. Test with anon key (subject to RLS)
  console.log("\n📊 Testing with anon key (subject to RLS)...");
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: anonUsers, error: anonError } = await anonClient
    .from("users")
    .select("email");
  if (anonError) {
    console.log(`  Error: ${anonError.message}`);
  } else {
    console.log(
      `  Found ${anonUsers?.length || 0} users (should be 0 without auth)`,
    );
  }
}

debugAuth().catch(console.error);
