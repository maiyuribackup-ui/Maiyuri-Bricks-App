# Credential Rotation Guide

## Overview

This document outlines the credential rotation required after the P0-2 security fix that removed hardcoded credentials from the codebase.

## Compromised Credentials

The following credentials were exposed in the codebase and MUST be rotated:

### 1. Test User Accounts (TempPass123!)

**Status:** Disabled via migration `20260118000001_disable_seeded_users.sql`

| Email                        | Role       | Action Required         |
| ---------------------------- | ---------- | ----------------------- |
| ram@maiyuribricks.com        | founder    | Password reset required |
| kavitha@maiyuribricks.com    | accountant | Password reset required |
| srinivasan@maiyuribricks.com | engineer   | Password reset required |

**How to Reset:**

1. Go to `/forgot-password`
2. Enter email address
3. Check email for reset link
4. Set a new secure password (min 12 chars, mixed case, numbers, symbols)

### 2. Supabase Service Role Key

**Status:** Previously hardcoded in `test_invite.mjs`

**Action Required:**

1. Rotate the Supabase service role key in Supabase Dashboard
2. Update the key in all secure environments (Vercel, local .env files)
3. Never commit the new key to the repository

**Steps:**

```bash
# 1. Go to Supabase Dashboard > Settings > API
# 2. Click "Regenerate service_role key"
# 3. Update Vercel environment variables:
vercel env rm SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# 4. Update local .env.local with the new key
```

### 3. Test Email/Password Credentials

**Status:** Must be set via environment variables

All E2E tests now require these environment variables:

```bash
# Required for all E2E tests
E2E_TEST_EMAIL=your-test-email@domain.com
E2E_TEST_PASSWORD=your-secure-password

# For role-specific tests
E2E_TEST_FOUNDER_EMAIL=founder@domain.com
E2E_TEST_ACCOUNTANT_EMAIL=accountant@domain.com
E2E_TEST_ENGINEER_EMAIL=engineer@domain.com
```

**Setup for CI/CD (GitHub Actions):**

1. Go to Repository Settings > Secrets and variables > Actions
2. Add the following secrets:
   - `E2E_TEST_EMAIL`
   - `E2E_TEST_PASSWORD`
   - `E2E_TEST_FOUNDER_EMAIL`
   - `E2E_TEST_ACCOUNTANT_EMAIL`
   - `E2E_TEST_ENGINEER_EMAIL`

## Verification Checklist

After completing credential rotation, verify:

- [ ] All seeded users can reset passwords via email
- [ ] E2E tests pass with new environment variables
- [ ] Supabase service role key is rotated
- [ ] No hardcoded credentials remain in codebase (run: `grep -r "TempPass123" .`)
- [ ] CI/CD pipeline has all required secrets configured

## Timeline

| Task                                  | Priority | Status      |
| ------------------------------------- | -------- | ----------- |
| Delete test-credentials.txt           | P0       | Complete    |
| Remove hardcoded passwords from code  | P0       | Complete    |
| Add migration to disable seeded users | P0       | Complete    |
| Rotate service role key               | P0       | **PENDING** |
| Reset user passwords                  | P1       | **PENDING** |
| Configure CI/CD secrets               | P1       | **PENDING** |

## Security Notes

1. **Never commit credentials** - Use `.env.local` for local development
2. **Use secure passwords** - Minimum 12 characters with complexity
3. **Rotate keys regularly** - Schedule quarterly key rotation
4. **Audit access** - Review who has access to production secrets

## Contact

For security concerns, contact the project owner immediately.
