-- Production Auth Migration
-- Adds fields for staff invitation, notification preferences, and soft delete

-- Add phone column for WhatsApp notifications
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add invitation tracking columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invitation_token UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invitation_status TEXT DEFAULT 'active'
  CHECK (invitation_status IN ('pending', 'active', 'deactivated'));

-- Add notification preferences (email enabled by default)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"email": true, "whatsapp": false, "daily_summary": true}'::jsonb;

-- Add soft delete flag
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add updated_at column for tracking changes
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create index for invitation token lookup
CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON public.users(invitation_token)
  WHERE invitation_token IS NOT NULL;

-- Create index for active users
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active)
  WHERE is_active = true;

-- Update the handle_new_user function to include new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, phone, notification_preferences, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'engineer'),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(
      (NEW.raw_user_meta_data->>'notification_preferences')::jsonb,
      '{"email": true, "whatsapp": false, "daily_summary": true}'::jsonb
    ),
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow founders to delete (deactivate) users
DROP POLICY IF EXISTS "Founders can delete users" ON public.users;
CREATE POLICY "Founders can delete users" ON public.users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder'
    )
  );

-- Update select policy to only show active users (unless founder)
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
CREATE POLICY "Users can view active users" ON public.users
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      is_active = true OR
      EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
    )
  );

-- Allow founders to update any user (for role changes, deactivation)
DROP POLICY IF EXISTS "Founders can update users" ON public.users;
CREATE POLICY "Founders can update any user" ON public.users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder'
    )
  );

-- Comment on new columns
COMMENT ON COLUMN public.users.phone IS 'Phone number for WhatsApp notifications';
COMMENT ON COLUMN public.users.invitation_token IS 'UUID token for staff invitation links';
COMMENT ON COLUMN public.users.invitation_expires_at IS 'Expiry time for invitation token (7 days)';
COMMENT ON COLUMN public.users.invitation_status IS 'Status: pending (invited), active, deactivated';
COMMENT ON COLUMN public.users.notification_preferences IS 'JSON preferences for email, whatsapp, daily_summary';
COMMENT ON COLUMN public.users.is_active IS 'Soft delete flag - false means user is deactivated';
