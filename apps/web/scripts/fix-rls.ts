/**
 * Fix RLS recursion issue
 * Run with: npx tsx scripts/fix-rls.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SQL = `
-- Fix infinite recursion in users RLS policy

-- First, create a security definer function to check if user is founder
CREATE OR REPLACE FUNCTION public.is_founder(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id AND role IN ('founder', 'owner')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_founder(UUID) TO authenticated;

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view active users" ON public.users;
DROP POLICY IF EXISTS "Users can view all users" ON public.users;

-- Create fixed policy using the security definer function
CREATE POLICY "Users can view users" ON public.users
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      is_active = true OR
      public.is_founder(auth.uid())
    )
  );

-- Also fix the founders update policy
DROP POLICY IF EXISTS "Founders can update any user" ON public.users;
CREATE POLICY "Founders can update any user" ON public.users
  FOR UPDATE USING (
    public.is_founder(auth.uid())
  );

-- Fix founders delete policy
DROP POLICY IF EXISTS "Founders can delete users" ON public.users;
CREATE POLICY "Founders can delete users" ON public.users
  FOR DELETE USING (
    public.is_founder(auth.uid())
  );

-- Fix founders insert policy
DROP POLICY IF EXISTS "Founders can insert users" ON public.users;
CREATE POLICY "Founders can insert users" ON public.users
  FOR INSERT WITH CHECK (
    public.is_founder(auth.uid())
  );
`;

async function fixRLS() {
  console.log("🔧 Fixing RLS recursion issue...\n");

  const { error } = await supabase.rpc("exec_sql", { sql: SQL });

  if (error) {
    // Try running via raw query if rpc doesn't work
    console.log("RPC not available, will need to run SQL manually.");
    console.log(
      "\n📋 Please run this SQL in Supabase Dashboard > SQL Editor:\n",
    );
    console.log(SQL);
    return;
  }

  console.log("✅ RLS policies fixed!");
}

fixRLS().catch(console.error);
