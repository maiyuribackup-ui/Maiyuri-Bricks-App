-- Migration: Disable seeded users with compromised passwords
--
-- SECURITY FIX: The seeded users had hardcoded passwords (TempPass123!) that were
-- committed to the repository. These accounts must be disabled and require
-- password reset before they can be used again.
--
-- Affected users:
--   - ram@maiyuribricks.com
--   - kavitha@maiyuribricks.com
--   - srinivasan@maiyuribricks.com
--
-- After running this migration, users must:
--   1. Use "Forgot Password" to reset their password
--   2. Set a new secure password

-- Step 1: Invalidate existing passwords by setting a random encrypted password
-- This prevents login with the compromised TempPass123! password
UPDATE auth.users
SET
  -- Set encrypted_password to a random value that can't be guessed
  encrypted_password = extensions.crypt(extensions.gen_random_uuid()::text, extensions.gen_salt('bf')),
  -- Clear any recovery tokens
  recovery_token = '',
  -- Add note in metadata
  raw_user_meta_data = raw_user_meta_data || '{"password_reset_required": true, "reset_reason": "compromised_seed_password"}'::jsonb,
  updated_at = NOW()
WHERE email IN (
  'ram@maiyuribricks.com',
  'kavitha@maiyuribricks.com',
  'srinivasan@maiyuribricks.com'
);

-- Step 2: Also update public.users to flag the accounts
UPDATE public.users
SET
  updated_at = NOW()
WHERE email IN (
  'ram@maiyuribricks.com',
  'kavitha@maiyuribricks.com',
  'srinivasan@maiyuribricks.com'
);

-- Step 3: Log the security action
DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'SECURITY FIX: Disabled seeded user accounts';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'The following accounts have been disabled:';
  RAISE NOTICE '  - ram@maiyuribricks.com';
  RAISE NOTICE '  - kavitha@maiyuribricks.com';
  RAISE NOTICE '  - srinivasan@maiyuribricks.com';
  RAISE NOTICE '';
  RAISE NOTICE 'ACTION REQUIRED: Each user must use "Forgot Password"';
  RAISE NOTICE 'to set a new secure password before logging in.';
  RAISE NOTICE '===========================================';
END $$;
