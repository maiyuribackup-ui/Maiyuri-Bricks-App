# Issue Fix Checklist

Use this checklist when fixing any issue. Copy and paste into your PR description or issue comment.

## Issue: #<number> - <title>

### Phase 1: Setup ✅
- [ ] Synced with main branch
- [ ] Created feature branch: `fix/issue-<number>-<description>`
- [ ] Verified clean state (`git status`)
- [ ] Quality checks pass (`npm run typecheck`)

### Phase 2: Implementation ✅
- [ ] Reproduced the bug locally
- [ ] Identified root cause
- [ ] Implemented fix with minimal changes
- [ ] Code follows standards (see [CLAUDE.md](../CLAUDE.md))
- [ ] No debug code left (console.log, debugger, TODO)
- [ ] Updated documentation (if needed)

### Phase 3: Unit Testing ✅
- [ ] Unit tests written
- [ ] All unit tests passing (`npm run test`)
- [ ] Coverage: **_____%** (target: 80%+)
- [ ] Edge cases covered
- [ ] Test file: `_________________________________`

**Test Output:**
```
Paste unit test results here
```

### Phase 4: Integration Testing ✅
- [ ] Integration tests written (if applicable)
- [ ] All integration tests passing
- [ ] Database operations verified
- [ ] External service calls verified (Supabase, Resend, etc.)
- [ ] Test file: `_________________________________`

**Test Output:**
```
Paste integration test results here
```

### Phase 5: E2E Testing ✅
- [ ] E2E test written
- [ ] Tested in Chrome (desktop)
- [ ] Tested in Safari (desktop)
- [ ] Tested in Chrome (mobile)
- [ ] Tested in Safari (mobile)
- [ ] All E2E tests passing (`npm run test:e2e`)
- [ ] Test file: `_________________________________`

**Test Output:**
```
Paste E2E test results here
```

**Screenshots:**
- Desktop (Chrome): [Add screenshot or link]
- Mobile (Safari): [Add screenshot or link]

### Phase 6: Production Testing ✅
- [ ] Tested on Vercel preview deployment
- [ ] Preview URL: `_________________________________________________`
- [ ] Tested with production data (read-only)
- [ ] No console errors in browser
- [ ] No network errors (check Network tab)
- [ ] Tested on actual mobile device: **______________** (e.g., iPhone 14)
- [ ] Session persistence works across page reloads
- [ ] SSL/HTTPS works correctly

**Browser Testing:**
| Browser | Desktop | Mobile | Status |
|---------|---------|--------|--------|
| Chrome  | ✅ Required | ✅ Required | ☐ |
| Safari  | ✅ Required | ✅ Required | ☐ |
| Firefox | ⚪ Optional | ⚪ Optional | ☐ |

**Production Verification:**
- API response times: **____ms** (target: <2s)
- Console errors: **None** ☐
- Network errors: **None** ☐
- Database queries working: ✅ ☐

### Phase 7: Quality Checks ✅
- [ ] TypeScript: `npm run typecheck` ✅
- [ ] Linting: `npm run lint` ✅
- [ ] All tests: `npm run test` ✅
- [ ] No TODO/FIXME/console.log in code
- [ ] Git diff reviewed (no accidental changes)

**Quality Check Output:**
```bash
$ npm run typecheck && npm run lint && npm run test
# Paste results here
```

### Phase 8: PR Creation ✅
- [ ] Conventional commit message used
- [ ] PR title: `fix: <description> (#<issue-number>)`
- [ ] PR includes test evidence (screenshots, logs)
- [ ] PR linked to issue: `Fixes #____`
- [ ] Before/After screenshots attached (if UI change)
- [ ] Deployment notes added (migrations, env vars, etc.)

**Commit Message:**
```
fix: <brief description>

- <change 1>
- <change 2>

Testing:
- ✅ Unit tests: __% coverage
- ✅ Integration tests: All passing
- ✅ E2E tests: Chrome + Safari
- ✅ Production: Verified on preview

Fixes #<issue-number>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Phase 9: Review & Deploy ✅
- [ ] CI checks passing
- [ ] Code reviewed and approved by: **______________**
- [ ] All conversations resolved
- [ ] No merge conflicts
- [ ] PR merged (squash and merge)
- [ ] Branch deleted after merge
- [ ] Vercel deployment succeeded

**Deployment Status:**
- Vercel build: ✅ ☐
- Deployment URL: `_________________________________________________`
- Deploy time: **______________**

### Phase 10: Post-Deployment Verification ✅
- [ ] Health check passed (`/api/health`)
- [ ] Smoke tests passed
- [ ] Feature verified in production
- [ ] No errors in Sentry/logs
- [ ] Telegram notification sent (if applicable)
- [ ] Issue closed automatically

**Production Verification:**
```bash
# Health check
$ curl https://maiyuri-bricks-app.vercel.app/api/health
# Paste results

# Feature verification
# List steps taken to verify in production
```

---

## Test Evidence Summary

### Coverage Report
- Unit Test Coverage: **_____%**
- Integration Test Coverage: **_____%**
- E2E Tests: **____ tests passing**

### Files Changed
```
List key files changed:
- apps/web/...
- apps/api/...
```

### Database Changes
- [ ] No database changes
- [ ] Database migration: `migrations/__________________.sql`
- [ ] Migration tested in staging: ✅

### Environment Variables
- [ ] No new environment variables
- [ ] New variables documented: `_______________________________`

---

## Sign-off

**Developer:** @<your-github-username>
**Reviewer:** @<reviewer-github-username>
**Date:** <YYYY-MM-DD>

**Issue Status:**
- [ ] Ready for merge
- [ ] Deployed to production
- [ ] Verified in production
- [ ] Issue closed

---

**Related Documentation:**
- [ISSUE_WORKFLOW.md](../docs/ISSUE_WORKFLOW.md) - Complete issue fixing guide
- [GIT_WORKFLOW.md](../docs/GIT_WORKFLOW.md) - Git workflow
- [CLAUDE.md](../CLAUDE.md) - Coding standards
