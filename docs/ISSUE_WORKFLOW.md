# Issue Workflow & Testing Strategy

Complete guide for reporting, fixing, testing, and deploying issue fixes for Maiyuri Bricks App.

## Table of Contents

1. [Quick Command Reference](#quick-command-reference)
2. [Issue Reporting](#issue-reporting)
3. [Fix This Issue Workflow](#fix-this-issue-workflow)
4. [Testing Strategy](#testing-strategy)
5. [Deployment & Verification](#deployment--verification)
6. [Troubleshooting](#troubleshooting)

---

## Quick Command Reference

### Report Issue
```bash
gh issue create --label bug --title "Bug: Brief description"
```

### Fix This Issue (Complete Workflow)
```bash
# When you say "fix this issue", follow this checklist:
□ Create feature branch from main
□ Implement fix with unit tests
□ Run unit tests locally
□ Run integration tests
□ Run E2E tests in browser
□ Test in production environment
□ Create PR with test evidence
□ Deploy and verify
```

---

## Issue Reporting

### 1. Identify the Issue

**Bug Checklist:**
- [ ] Can you reproduce it consistently?
- [ ] What's the expected behavior?
- [ ] What's the actual behavior?
- [ ] Which environment? (Local/Staging/Production)
- [ ] Which user role? (Founder/Accountant/Engineer)

**Feature Request Checklist:**
- [ ] What problem does this solve?
- [ ] Who benefits from this?
- [ ] Is this critical, high, or nice-to-have?

### 2. Create GitHub Issue

**Using GitHub CLI:**
```bash
# Bug report
gh issue create \
  --label bug \
  --label "needs-triage" \
  --title "Bug: Login redirect loop on session timeout" \
  --body "
## Description
Users get stuck in a redirect loop when their session expires.

## Steps to Reproduce
1. Log in as Founder
2. Wait for session to expire (30 minutes)
3. Try to access /dashboard
4. Observe redirect loop

## Expected Behavior
Should redirect to /login with clear message

## Actual Behavior
Infinite redirect between /dashboard and /login

## Environment
- Browser: Chrome 120
- Device: Desktop
- Environment: Production
- User Role: Founder

## Screenshots
[Attach if available]

## Additional Context
Started happening after PR #123 merged
"

# Feature request
gh issue create \
  --label enhancement \
  --title "Feature: Export leads to Excel" \
  --body "
## Problem
Users need to export lead data for offline analysis

## Proposed Solution
Add 'Export to Excel' button on leads page

## Who Benefits
Founder, Accountant roles

## Priority
High - frequently requested
"
```

**Using GitHub Web Interface:**
1. Go to https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/issues/new
2. Select template (Bug Report or Feature Request)
3. Fill in all sections
4. Add labels: `bug`, `enhancement`, `urgent`, etc.
5. Assign to yourself or team member
6. Link to related issues/PRs if any

### 3. Issue Triage

**Labels to Use:**
| Label | When to Use |
|-------|-------------|
| `bug` | Something is broken |
| `enhancement` | New feature or improvement |
| `urgent` | Needs immediate attention |
| `high-priority` | Important but not urgent |
| `good-first-issue` | Good for new contributors |
| `needs-testing` | Requires thorough testing |
| `production` | Affects production environment |

---

## Fix This Issue Workflow

### Step 1: Setup (5 minutes)

```bash
# 1. Sync with main
git checkout main
git pull origin main

# 2. Create feature branch (use issue number)
# Format: fix/issue-123-short-description
git checkout -b fix/issue-45-login-redirect-loop

# 3. Verify clean state
git status
npm run typecheck
```

### Step 2: Implement Fix (Variable time)

**Implementation Checklist:**
- [ ] Read issue description carefully
- [ ] Reproduce the bug locally
- [ ] Identify root cause
- [ ] Implement fix with minimal changes
- [ ] Write/update unit tests
- [ ] Update documentation if needed

**Code Quality Requirements:**
```bash
# Before committing, ensure:
- TypeScript strict mode passes
- No console.log statements (use proper logging)
- No @ts-ignore or @ts-expect-error
- Follow existing code patterns
```

### Step 3: Unit Testing (15-30 minutes)

**Write Unit Tests:**
```typescript
// Example: Fix login redirect - test the auth middleware
// File: apps/web/middleware.test.ts

import { describe, it, expect } from 'vitest';
import { middleware } from './middleware';

describe('Auth Middleware - Session Expiry', () => {
  it('should redirect to login when session expired', () => {
    const request = new NextRequest('http://localhost:3000/dashboard');
    // Mock expired session
    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('/login?expired=true');
  });

  it('should allow access with valid session', () => {
    const request = new NextRequest('http://localhost:3000/dashboard');
    // Mock valid session
    const response = middleware(request);

    expect(response).toBeUndefined(); // No redirect
  });
});
```

**Run Unit Tests:**
```bash
# Run all tests
npm run test

# Run specific test file
npm run test middleware.test.ts

# Run with coverage
npm run test -- --coverage

# Watch mode during development
npm run test -- --watch

# REQUIREMENT: All tests must pass before proceeding
```

**Unit Test Coverage Requirements:**
- **Minimum:** 80% coverage for changed files
- **Target:** 90%+ coverage for new code
- Test all edge cases and error conditions

### Step 4: Integration Testing (15-30 minutes)

**Integration Test Scope:**
- API route handlers
- Database operations
- External service calls (Supabase, Resend, etc.)

**Example Integration Test:**
```typescript
// File: apps/web/app/api/auth/login/route.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from './route';

describe('POST /api/auth/login - Integration', () => {
  beforeEach(async () => {
    // Setup test database state
    await setupTestDB();
  });

  it('should login user with valid credentials', async () => {
    const request = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@maiyuri.com',
        password: 'TestPassword123'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session).toBeDefined();
    expect(data.user.email).toBe('test@maiyuri.com');
  });

  it('should reject invalid credentials', async () => {
    const request = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@maiyuri.com',
        password: 'WrongPassword'
      })
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
```

**Run Integration Tests:**
```bash
# Run integration tests (with test database)
npm run test:integration

# Or if no separate script, use pattern matching
npm run test -- --run --grep "Integration"

# REQUIREMENT: All integration tests must pass
```

### Step 5: E2E Testing in Browser (30-60 minutes)

**E2E Test with Playwright:**
```typescript
// File: apps/web/tests/e2e/auth-flow.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Login Flow - Session Expiry Fix', () => {
  test('should handle expired session gracefully', async ({ page }) => {
    // 1. Login
    await page.goto('http://localhost:3000/login');
    await page.fill('[name="email"]', 'founder@maiyuri.com');
    await page.fill('[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');

    // 2. Verify logged in
    await expect(page).toHaveURL(/.*dashboard/);

    // 3. Simulate session expiry by clearing cookies
    await page.context().clearCookies();

    // 4. Try to access protected route
    await page.goto('http://localhost:3000/dashboard');

    // 5. Should redirect to login with message
    await expect(page).toHaveURL(/.*login.*expired=true/);
    await expect(page.locator('text=Session expired')).toBeVisible();
  });

  test('should redirect to intended page after login', async ({ page }) => {
    // 1. Try to access protected page without login
    await page.goto('http://localhost:3000/leads/123');

    // 2. Should redirect to login
    await expect(page).toHaveURL(/.*login/);

    // 3. Login
    await page.fill('[name="email"]', 'founder@maiyuri.com');
    await page.fill('[name="password"]', 'TestPassword123');
    await page.click('button[type="submit"]');

    // 4. Should redirect back to intended page
    await expect(page).toHaveURL(/.*leads\/123/);
  });
});
```

**Run E2E Tests Locally:**
```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests in headless mode
npm run test:e2e

# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e tests/e2e/auth-flow.spec.ts

# Run with UI mode (interactive)
npm run test:e2e -- --ui

# REQUIREMENT: All E2E tests must pass
```

**E2E Test Coverage Requirements:**
- Test critical user flows
- Test all changed UI components
- Test on Chrome and Safari (minimum)
- Test responsive design (mobile + desktop)

### Step 6: Production Environment Testing (15-30 minutes)

**CRITICAL: Test in production-like environment before merging**

**Option A: Deploy to Vercel Preview**
```bash
# Push branch - Vercel auto-creates preview deployment
git push -u origin fix/issue-45-login-redirect-loop

# Get preview URL from Vercel dashboard or GitHub PR
# URL format: https://maiyuri-bricks-app-web-git-fix-issue-45-[hash].vercel.app
```

**Option B: Test Against Production API (with caution)**
```bash
# Run E2E tests against production
PLAYWRIGHT_BASE_URL=https://maiyuri-bricks-app.vercel.app npm run test:e2e

# WARNING: Only use test accounts, never modify production data
```

**Production Testing Checklist:**
- [ ] Test with real production data (read-only)
- [ ] Test with production Supabase instance
- [ ] Test with production email service (Resend)
- [ ] Test with production Telegram bot
- [ ] Verify SSL/HTTPS works correctly
- [ ] Test session persistence across page reloads
- [ ] Check browser console for errors
- [ ] Check Network tab for failed requests
- [ ] Test on actual mobile device (not just DevTools)

**Browser Testing Matrix:**
| Browser | Desktop | Mobile | Status |
|---------|---------|--------|--------|
| Chrome  | ✅ Required | ✅ Required | |
| Safari  | ✅ Required | ✅ Required | |
| Firefox | ⚪ Optional | ⚪ Optional | |
| Edge    | ⚪ Optional | ⚪ Optional | |

### Step 7: Quality Checks (5 minutes)

```bash
# Run all quality checks
npm run typecheck && npm run lint && npm run test

# Fix auto-fixable issues
npm run lint:fix

# Verify no debug code left
git diff | grep -i "console.log\|debugger\|TODO\|FIXME"

# REQUIREMENT: All checks must pass
```

### Step 8: Commit & Create PR (10 minutes)

**Commit with Evidence:**
```bash
# Stage changes
git add .

# Commit with conventional format + test evidence
git commit -m "fix: resolve login redirect loop on session expiry

- Added session expiry check in middleware
- Updated redirect logic to preserve intended URL
- Added error message display on login page

Testing:
- ✅ Unit tests: 95% coverage (middleware.test.ts)
- ✅ Integration tests: All passing (auth API routes)
- ✅ E2E tests: Chrome + Safari (auth-flow.spec.ts)
- ✅ Production: Verified on preview deployment

Fixes #45

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push branch
git push -u origin fix/issue-45-login-redirect-loop
```

**Create PR with Test Report:**
```bash
gh pr create --title "Fix: Resolve login redirect loop (#45)" --body "
## Summary
Fixed infinite redirect loop when user session expires. Now properly redirects to login with clear message and preserves intended URL.

## Closes
Fixes #45

## Type of Change
- [x] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- Added session expiry validation in \`middleware.ts\`
- Updated redirect logic to use \`callbackUrl\` parameter
- Added user-friendly error message on login page
- Improved session cookie handling

## Testing Evidence

### Unit Tests
\`\`\`
✓ middleware.test.ts (8 tests)
  ✓ Auth Middleware - Session Expiry
    ✓ should redirect to login when session expired
    ✓ should allow access with valid session
    ✓ should preserve intended URL in callback

Coverage: 95% statements, 92% branches
\`\`\`

### Integration Tests
\`\`\`
✓ route.test.ts (12 tests)
  ✓ POST /api/auth/login
    ✓ should login with valid credentials
    ✓ should reject invalid credentials
    ✓ should handle expired sessions

All integration tests passing ✅
\`\`\`

### E2E Tests (Playwright)
\`\`\`
✓ auth-flow.spec.ts (4 tests)
  ✓ should handle expired session gracefully
  ✓ should redirect to intended page after login
  ✓ should show error message on expired session
  ✓ should work on mobile viewport

Browsers: Chrome ✅, Safari ✅
\`\`\`

### Production Verification
- [x] Tested on Vercel preview: https://maiyuri-bricks-app-web-git-fix-issue-45.vercel.app
- [x] Session expiry flow works correctly
- [x] Error message displays properly
- [x] Redirect to intended URL works
- [x] Mobile responsive - tested on iPhone 14
- [x] No console errors
- [x] All API calls succeed

### Screenshots
**Before Fix:**
![Before](url-to-screenshot-showing-issue)

**After Fix:**
![After](url-to-screenshot-showing-fix)

## Checklist
- [x] Code follows project standards (CLAUDE.md)
- [x] TypeScript strict mode passes
- [x] Linting passes
- [x] Unit tests written and passing (95% coverage)
- [x] Integration tests passing
- [x] E2E tests written and passing
- [x] Tested in production environment
- [x] Documentation updated (if needed)
- [x] No sensitive data in commits
- [x] Conventional commit message
- [x] Self-reviewed code changes

## Deployment Notes
- No database migrations required
- No environment variable changes
- Safe to deploy immediately after merge
"
```

### Step 9: Code Review & CI (Variable time)

**Wait for:**
- [ ] CI checks pass (typecheck, lint, test)
- [ ] 1 approval from team member
- [ ] All conversations resolved
- [ ] No merge conflicts

**If CI Fails:**
```bash
# Check logs
gh run view --log-failed

# Fix issues locally
# Re-run quality checks
npm run typecheck && npm run lint && npm run test

# Push fix
git add .
git commit -m "fix: address CI feedback"
git push
```

### Step 10: Merge & Deploy (5 minutes)

```bash
# After approval, merge via GitHub UI (Squash and Merge)
# Or via CLI:
gh pr merge --squash --delete-branch

# Monitor deployment
gh run list --limit 1

# Vercel auto-deploys to production
# Monitor at: https://vercel.com/maiyuris-projects-10ac9ffa/maiyuri-bricks-app-web
```

---

## Testing Strategy

### Test Pyramid

```
         /\
        /  \  E2E Tests (10%)
       /____\  - Critical user flows
      /      \  - Production environment
     /________\ Integration Tests (30%)
    /          \ - API routes + DB
   /____________\ - External services
  /              \
 /________________\ Unit Tests (60%)
                    - Pure functions
                    - Business logic
                    - Edge cases
```

### Test Coverage Targets

| Test Type | Coverage Target | Tool |
|-----------|----------------|------|
| **Unit** | 80%+ | Vitest |
| **Integration** | 70%+ | Vitest |
| **E2E** | Critical flows | Playwright |

### Test Environments

| Environment | Purpose | Database | External APIs |
|-------------|---------|----------|---------------|
| **Local** | Development | Local/Test DB | Mocked |
| **CI** | Automated testing | Test DB | Mocked |
| **Preview** | PR testing | Staging DB | Real (sandboxed) |
| **Production** | Final verification | Production DB | Real |

### Test Data Management

**For Unit/Integration Tests:**
```typescript
// Use test fixtures
import { testLeads, testUsers } from '@/tests/fixtures';

// Or factories
import { createTestLead } from '@/tests/factories';

const lead = createTestLead({ status: 'hot' });
```

**For E2E Tests:**
```typescript
// Use dedicated test accounts
const TEST_ACCOUNTS = {
  founder: {
    email: 'test-founder@maiyuri.com',
    password: process.env.TEST_PASSWORD
  },
  accountant: {
    email: 'test-accountant@maiyuri.com',
    password: process.env.TEST_PASSWORD
  }
};

// Clean up test data after tests
test.afterEach(async () => {
  await cleanupTestData();
});
```

---

## Deployment & Verification

### Pre-Deployment Checklist

- [ ] All tests passing (unit, integration, E2E)
- [ ] Code reviewed and approved
- [ ] CI checks passing
- [ ] No merge conflicts
- [ ] Database migrations tested (if any)
- [ ] Environment variables documented (if new)

### Post-Deployment Verification

**Immediate (0-5 minutes):**
```bash
# 1. Check deployment status
gh run list --limit 1

# 2. Verify Vercel deployment
# Visit: https://maiyuri-bricks-app.vercel.app

# 3. Check health endpoint
curl https://maiyuri-bricks-app.vercel.app/api/health

# 4. Monitor Sentry for errors
# Visit: https://sentry.io/organizations/maiyuri/issues/
```

**Smoke Tests (5-10 minutes):**
- [ ] Login flow works
- [ ] Dashboard loads correctly
- [ ] Critical features working (leads, notes, etc.)
- [ ] No console errors
- [ ] API responses normal (<2s)

**Full Verification (30 minutes):**
```bash
# Run E2E tests against production
PLAYWRIGHT_BASE_URL=https://maiyuri-bricks-app.vercel.app npm run test:e2e

# Manual testing checklist:
- [ ] Test the specific bug fix
- [ ] Test related features
- [ ] Test on mobile device
- [ ] Check database (no corrupted data)
- [ ] Check Telegram notifications
- [ ] Check email delivery (if applicable)
```

### Rollback Procedure

**If Issues Found in Production:**

```bash
# 1. Immediately revert the PR
gh pr reopen <PR-number>
gh pr merge <previous-working-pr> --revert

# 2. Or revert specific commit
git revert <commit-hash>
git push origin main

# 3. Create hotfix issue
gh issue create --label urgent --title "Hotfix: Revert broken feature"

# 4. Monitor deployment of revert
gh run list --limit 1

# 5. Verify production is stable
curl https://maiyuri-bricks-app.vercel.app/api/health
```

---

## Troubleshooting

### Tests Failing Locally

```bash
# 1. Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# 2. Clear test cache
npm run test -- --clearCache

# 3. Run tests with verbose output
npm run test -- --reporter=verbose

# 4. Check for port conflicts
lsof -i :3000
```

### E2E Tests Failing

```bash
# 1. Update Playwright browsers
npx playwright install --force

# 2. Run with headed mode to debug
npm run test:e2e -- --headed --debug

# 3. Check screenshot diffs
# Located in: apps/web/test-results/

# 4. Increase timeouts if flaky
test.setTimeout(60000); // 60 seconds
```

### CI Failing But Local Passes

```bash
# 1. Check Node version matches CI
node --version  # Should be 20.x

# 2. Run with CI environment
CI=true npm run test

# 3. Check for environment-specific issues
# Review .github/workflows/ci.yml
```

### Production Issues After Deploy

```bash
# 1. Check Vercel logs
vercel logs https://maiyuri-bricks-app.vercel.app --follow

# 2. Check environment variables
# Vercel Dashboard → Settings → Environment Variables

# 3. Rollback if critical
git revert <commit-hash>
git push origin main

# 4. Create incident report
gh issue create --label urgent --label production
```

---

## Issue Workflow Checklist Template

Use this when someone says **"fix this issue"**:

```markdown
## Issue: #<number> - <title>

### Phase 1: Setup ✅
- [ ] Synced with main branch
- [ ] Created feature branch: fix/issue-<number>-<description>
- [ ] Verified clean state

### Phase 2: Implementation ✅
- [ ] Reproduced the bug locally
- [ ] Identified root cause
- [ ] Implemented fix
- [ ] Code follows standards (CLAUDE.md)
- [ ] No debug code left

### Phase 3: Unit Testing ✅
- [ ] Unit tests written
- [ ] All unit tests passing
- [ ] Coverage: ___% (target: 80%+)
- [ ] Edge cases covered

### Phase 4: Integration Testing ✅
- [ ] Integration tests written (if applicable)
- [ ] All integration tests passing
- [ ] Database operations verified
- [ ] External service calls verified

### Phase 5: E2E Testing ✅
- [ ] E2E test written
- [ ] Tested in Chrome (desktop)
- [ ] Tested in Safari (desktop)
- [ ] Tested in Chrome (mobile)
- [ ] Tested in Safari (mobile)
- [ ] All E2E tests passing

### Phase 6: Production Testing ✅
- [ ] Tested on Vercel preview deployment
- [ ] Preview URL: ___________________
- [ ] Tested with production data (read-only)
- [ ] No console errors
- [ ] No network errors
- [ ] Mobile device tested: ___________

### Phase 7: Quality Checks ✅
- [ ] TypeScript: `npm run typecheck` ✅
- [ ] Linting: `npm run lint` ✅
- [ ] All tests: `npm run test` ✅
- [ ] No TODO/FIXME/console.log

### Phase 8: PR Creation ✅
- [ ] Conventional commit message
- [ ] PR includes test evidence
- [ ] Screenshots attached (if UI change)
- [ ] Linked to issue: Fixes #___

### Phase 9: Review & Deploy ✅
- [ ] CI checks passing
- [ ] Code reviewed and approved
- [ ] PR merged (squash)
- [ ] Vercel deployment succeeded

### Phase 10: Verification ✅
- [ ] Health check passed
- [ ] Smoke tests passed
- [ ] Feature verified in production
- [ ] No errors in Sentry
- [ ] Issue closed
```

---

**Last Updated:** 2026-01-17

**Related Documentation:**
- [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) - Complete Git workflow
- [CLAUDE.md](../CLAUDE.md) - Coding standards
- [TESTING.md](./TESTING.md) - Testing guidelines (if exists)
