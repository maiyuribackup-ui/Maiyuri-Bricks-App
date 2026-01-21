# E2E Testing Issues Summary

**Date:** 2026-01-22
**Status:** In Progress
**Priority:** HIGH (Production Live)

---

## Executive Summary

The E2E test suite for the Help Button functionality has been partially fixed. The core issue was **React hydration timing** - Playwright clicks were happening before React event handlers were attached. Additional issues include incorrect test assertions and some page-specific failures.

---

## Issues Discovered

### 1. E2E Login Not Working (FIXED)

**Root Cause:** React Hook Form with Playwright incompatibility

- Playwright's `page.fill()` and `page.click()` didn't trigger React Hook Form's validation
- Native form submission caused page reload before React's `preventDefault()` could fire

**Solution Implemented:**

- Bypass UI login entirely
- Use direct Supabase REST API authentication via Playwright's request API
- Set SSR auth cookie manually: `sb-pailepomvvwjkrhkwdqt-auth-token`

**File:** `tests/e2e/help-button.spec.ts` (lines 17-91)

---

### 2. Help Button Modal Not Opening (FIXED)

**Root Cause:** React hydration timing issue

- `networkidle` state doesn't guarantee React hydration completion
- Button clicks happened before React attached onClick handlers
- Dev server needed restart to pick up component changes

**Solution Implemented:**

- Added explicit wait for `h1` element (page content indicator)
- Added 500ms delay after page load for hydration
- Regular Playwright click now works after proper hydration wait

**File:** `tests/e2e/help-button.spec.ts` (lines 109-156)

---

### 3. Incorrect Test Assertions (PARTIALLY FIXED)

**Root Cause:** Test expected titles didn't match actual user-manual.ts titles

| Test Expected        | Actual in user-manual.ts |
| -------------------- | ------------------------ |
| "Dashboard Overview" | "Dashboard"              |
| "Lead Management"    | "Leads Management"       |
| "Create New Lead"    | "Add New Lead"           |
| "Task Management"    | "Tasks"                  |
| "Staff Coaching"     | "Sales Coaching"         |
| "KPI Dashboard"      | "KPI Analytics"          |

**Solution Implemented:**

- Updated `pagesToTest` array with correct titles from user-manual.ts

---

### 4. React Hydration Mismatch Warning

**Root Cause:** Select component generates different IDs on server vs client

- Server: `select-1seriii3yr8j`
- Client: `select-aip8i2xo0jc`

**Impact:** Non-blocking warning, but clutters error logs

**Solution:** Updated error filter to exclude React warnings

---

### 5. Remaining Failing Tests (5 tests)

| Test                          | Issue                               | Status      |
| ----------------------------- | ----------------------------------- | ----------- |
| Coaching page                 | Unknown - needs investigation       | Pending     |
| Approvals page                | Unknown - needs investigation       | Pending     |
| Backdrop click to close modal | Click position may miss backdrop    | Pending     |
| Full Help Page sections       | Multiple "Getting Started" elements | Partial fix |
| Navigate to section detail    | Wrong element clicked               | Partial fix |

---

## Current Test Results

```
14 passed
5 failed
2 skipped
```

---

## Files Modified

1. `tests/e2e/help-button.spec.ts` - Main test file with fixes
2. `src/components/help/HelpButton.tsx` - Added debug logs (removed)
3. `playwright.config.ts` - Added dotenv loading

---

## Key Technical Findings

### Supabase SSR Authentication

- Cookie name pattern: `sb-{project-ref}-auth-token`
- Cookie value: JSON stringified session object
- Required fields: `access_token`, `refresh_token`, `expires_in`, `expires_at`, `token_type`, `user`

### React Hydration in Next.js 14

- `networkidle` is NOT sufficient for hydration completion
- Client components (`"use client"`) need time for event handler attachment
- Explicit waits (500-1000ms) or waiting for interactive elements helps

### Playwright Best Practices Learned

- Use `page.waitForSelector('h1')` to wait for content
- Add small delays after navigation for React hydration
- Regular `click()` works after proper hydration
- `evaluate()` clicks are sometimes needed but not preferred

---

## Recommendations

### Immediate (Before Production Testing)

1. Use Vercel preview URL instead of localhost for E2E tests
2. Focus on critical paths: Lead management, Dashboard
3. Skip non-critical tests (Help page detail navigation)

### Short-term

1. Fix Select component ID hydration mismatch
2. Add `data-testid` attributes for reliable element selection
3. Create reusable `waitForHydration()` helper

### Long-term

1. Implement proper test authentication state (Playwright auth storage)
2. Add visual regression tests
3. Set up CI/CD pipeline with E2E tests

---

## Production Vercel Testing Setup

To run tests against Vercel:

```bash
# Set environment variable
export BASE_URL=https://your-app.vercel.app

# Run tests
bun playwright test tests/e2e/help-button.spec.ts --project=chromium
```

Or update `.env.local`:

```
BASE_URL=https://your-app.vercel.app
```
