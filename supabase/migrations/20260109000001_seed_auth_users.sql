-- Seed auth users for Maiyuri Bricks
-- This creates both auth.users entries and public.users profiles

-- Enable pgcrypto for password hashing (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Delete existing test users if they exist (clean slate)
DELETE FROM auth.users WHERE email IN (
  'ram@maiyuribricks.com',
  'kavitha@maiyuribricks.com',
  'srinivasan@maiyuribricks.com',
  'admin@maiyuribricks.com'
);

-- Also clean up public.users (cascade should handle this, but just in case)
DELETE FROM public.users WHERE email IN (
  'ram@maiyuribricks.com',
  'kavitha@maiyuribricks.com',
  'srinivasan@maiyuribricks.com',
  'admin@maiyuribricks.com'
);

-- Insert auth users with hashed passwords
-- Password for all users: TempPass123!
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  confirmation_token,
  recovery_token
)
VALUES
  -- Ram Kumaran (Founder)
  (
    'a1111111-1111-1111-1111-111111111111'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'ram@maiyuribricks.com',
    extensions.crypt('TempPass123!', extensions.gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "Ram Kumaran"}'::jsonb,
    'authenticated',
    'authenticated',
    '',
    ''
  ),
  -- Kavitha (Accountant)
  (
    'a2222222-2222-2222-2222-222222222222'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'kavitha@maiyuribricks.com',
    extensions.crypt('TempPass123!', extensions.gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "Kavitha"}'::jsonb,
    'authenticated',
    'authenticated',
    '',
    ''
  ),
  -- Srinivasan (Engineer)
  (
    'a3333333-3333-3333-3333-333333333333'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'srinivasan@maiyuribricks.com',
    extensions.crypt('TempPass123!', extensions.gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "Srinivasan"}'::jsonb,
    'authenticated',
    'authenticated',
    '',
    ''
  );

-- Insert corresponding public.users profiles
-- Note: The trigger may auto-create these, so we use ON CONFLICT
INSERT INTO public.users (id, email, name, role, language_preference, created_at)
VALUES
  ('a1111111-1111-1111-1111-111111111111'::uuid, 'ram@maiyuribricks.com', 'Ram Kumaran', 'founder', 'en', NOW()),
  ('a2222222-2222-2222-2222-222222222222'::uuid, 'kavitha@maiyuribricks.com', 'Kavitha', 'accountant', 'en', NOW()),
  ('a3333333-3333-3333-3333-333333333333'::uuid, 'srinivasan@maiyuribricks.com', 'Srinivasan', 'engineer', 'en', NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  language_preference = EXCLUDED.language_preference;

-- Create identities for email auth (required for Supabase Auth)
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES
  (
    'a1111111-1111-1111-1111-111111111111'::uuid,
    'a1111111-1111-1111-1111-111111111111'::uuid,
    'ram@maiyuribricks.com',
    'email',
    '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "ram@maiyuribricks.com", "email_verified": true}'::jsonb,
    NOW(),
    NOW(),
    NOW()
  ),
  (
    'a2222222-2222-2222-2222-222222222222'::uuid,
    'a2222222-2222-2222-2222-222222222222'::uuid,
    'kavitha@maiyuribricks.com',
    'email',
    '{"sub": "a2222222-2222-2222-2222-222222222222", "email": "kavitha@maiyuribricks.com", "email_verified": true}'::jsonb,
    NOW(),
    NOW(),
    NOW()
  ),
  (
    'a3333333-3333-3333-3333-333333333333'::uuid,
    'a3333333-3333-3333-3333-333333333333'::uuid,
    'srinivasan@maiyuribricks.com',
    'email',
    '{"sub": "a3333333-3333-3333-3333-333333333333", "email": "srinivasan@maiyuribricks.com", "email_verified": true}'::jsonb,
    NOW(),
    NOW(),
    NOW()
  )
ON CONFLICT (provider, provider_id) DO NOTHING;

-- Output confirmation
DO $$
BEGIN
  RAISE NOTICE 'Seeded 3 users with password: TempPass123!';
  RAISE NOTICE '  - ram@maiyuribricks.com (founder)';
  RAISE NOTICE '  - kavitha@maiyuribricks.com (accountant)';
  RAISE NOTICE '  - srinivasan@maiyuribricks.com (engineer)';
END $$;
