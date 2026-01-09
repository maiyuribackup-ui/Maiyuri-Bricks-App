-- Fix corrupted auth.users entries from previous direct insert
-- This migration cleans up and lets us recreate users properly via Admin API

-- Delete the incorrectly inserted identities
DELETE FROM auth.identities WHERE user_id IN (
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'a3333333-3333-3333-3333-333333333333'::uuid
);

-- Delete the incorrectly inserted auth users
DELETE FROM auth.users WHERE id IN (
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'a3333333-3333-3333-3333-333333333333'::uuid
);

-- Clean up the public.users that reference these
DELETE FROM public.users WHERE id IN (
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'a3333333-3333-3333-3333-333333333333'::uuid
);

-- Also delete any users with @maiyuribricks.com emails
DELETE FROM auth.identities WHERE provider_id LIKE '%@maiyuribricks.com';
DELETE FROM auth.users WHERE email LIKE '%@maiyuribricks.com';
DELETE FROM public.users WHERE email LIKE '%@maiyuribricks.com';
