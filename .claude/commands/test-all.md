# Comprehensive Test Command

Run all tests with detailed reporting and error tracking.

## Instructions

When the user runs `/test-all` or `/test`, execute the complete test suite:

### 1. Pre-Test Setup

```bash
# Ensure dependencies are installed
cd /Users/ramkumaranganeshan/Documents/Maiyuri_Bricks_App
bun install

# Clear previous test results
rm -rf apps/web/test-results apps/web/coverage
```

### 2. Run Test Layers

Execute tests in order of speed (fast to slow):

#### Layer 1: Unit Tests (Fast)
```bash
cd apps/web
bun run test:unit -- --run --coverage
```
- Target: >80% coverage
- Focus: Components, hooks, utils

#### Layer 2: Integration Tests (Medium)
```bash
bun run test:integration -- --run
```
- Target: >70% coverage
- Focus: API routes, database operations

#### Layer 3: E2E Tests (Slow)
```bash
bunx playwright test
```
- Focus: Critical user flows
- Must use error tracking

### 3. Error Tracking Verification

Verify E2E tests use error tracking:
```typescript
// Every E2E test should have:
const errors = await trackErrors(page);
// ... test actions ...
expect(errors).toEqual([]);
```

### 4. Report Format

```markdown
## Test Results Summary

**Total Tests:** XXX
**Passed:** XXX (XX%)
**Failed:** XXX
**Skipped:** XXX

### Unit Tests
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Tests Run | 150 | - | ✅ |
| Passed | 148 | 100% | ⚠️ |
| Coverage | 82% | 80% | ✅ |

### Integration Tests
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Tests Run | 45 | - | ✅ |
| Passed | 45 | 100% | ✅ |
| Coverage | 75% | 70% | ✅ |

### E2E Tests
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Tests Run | 12 | - | ✅ |
| Passed | 12 | 100% | ✅ |
| Error Tracking | Yes | Required | ✅ |

### Failed Tests (2)
1. **src/components/KPICard.test.tsx**
   - Test: should handle undefined value
   - Error: Expected not to throw
   - Fix: Add null safety to line 84

2. **tests/e2e/dashboard.spec.ts**
   - Test: should load without errors
   - Error: Runtime error captured
   - Fix: Check error-tracker output

### Coverage Report
```
┌──────────────────────┬──────────┬──────────┬──────────┐
│ File                 │ Lines    │ Branches │ Functions│
├──────────────────────┼──────────┼──────────┼──────────┤
│ components/          │ 85%      │ 78%      │ 82%      │
│ hooks/               │ 92%      │ 88%      │ 95%      │
│ lib/                 │ 78%      │ 72%      │ 80%      │
│ api/                 │ 70%      │ 65%      │ 75%      │
└──────────────────────┴──────────┴──────────┴──────────┘
```

### Overall Status: ⚠️ 2 FAILING TESTS

### Artifacts
- Coverage Report: `apps/web/coverage/index.html`
- Test Report: `apps/web/test-results/`
- Playwright Report: `apps/web/playwright-report/`
```

### 5. Quick Test Options

```bash
/test --unit        # Only unit tests
/test --e2e         # Only E2E tests
/test --coverage    # With coverage report
/test --watch       # Watch mode
/test --failed      # Only re-run failed tests
```

### 6. CI Mode

When running in CI, use strict thresholds:
```bash
bun run test:unit -- --run --coverage --coverageThreshold '{"lines":80,"branches":70,"functions":75}'
```

## Integration with Learnings

After tests complete:
1. If tests fail due to null safety → suggest adding to LEARNINGS.md
2. If coverage drops → identify untested code paths
3. If E2E catches runtime error → document in LEARNINGS.md
