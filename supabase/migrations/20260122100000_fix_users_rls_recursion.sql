-- Fix infinite recursion in users RLS policy
-- The previous policy caused recursion by querying users table within the policy

-- First, create a security definer function to check if user is founder
-- This bypasses RLS and prevents recursion
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

-- Also fix the founders update policy which might have same issue
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

-- Comment
COMMENT ON FUNCTION public.is_founder(UUID) IS 'Security definer function to check if user is founder/owner without RLS recursion';
