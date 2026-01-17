# Pre-Commit Check Command

Run all quality gates before committing code.

## Instructions

When the user runs `/pre-commit`, execute the following checks in order:

### 1. TypeScript Check
```bash
cd /Users/ramkumaranganeshan/Documents/Maiyuri_Bricks_App
bun run typecheck
```
- **Pass Criteria:** Exit code 0
- **On Failure:** List all type errors with file:line references

### 2. ESLint Check
```bash
bun run lint
```
- **Pass Criteria:** Exit code 0, no errors (warnings OK)
- **On Failure:** List all lint errors

### 3. Null Safety Scan
Run the `/null-check` command internally.
- **Pass Criteria:** No critical issues
- **On Failure:** List critical null safety issues

### 4. Run Related Tests
```bash
bun run test:unit -- --run --passWithNoTests
```
- **Pass Criteria:** All tests pass
- **On Failure:** List failing tests

### 5. Check for Secrets
```bash
# Scan for potential secrets
rg -i "api.key|apikey|secret|password|token" --type ts --type tsx --type env | grep -v "\.example\|process\.env\|test"
```
- **Pass Criteria:** No hardcoded secrets found
- **On Failure:** Alert about potential secrets

## Output Format

```markdown
## Pre-Commit Quality Gates

| Check | Status | Details |
|-------|--------|---------|
| TypeScript | ✅/❌ | X errors |
| ESLint | ✅/❌ | X errors, Y warnings |
| Null Safety | ✅/❌ | X critical issues |
| Unit Tests | ✅/❌ | X passed, Y failed |
| Secrets Scan | ✅/❌ | No secrets found |

### Overall: ✅ READY TO COMMIT / ❌ FIX ISSUES FIRST

### Issues to Fix:
1. [Issue details]
2. [Issue details]
```

## Example

```
🔒 Pre-Commit Quality Gates

┌─────────────┬────────┬──────────────────┐
│ Check       │ Status │ Details          │
├─────────────┼────────┼──────────────────┤
│ TypeScript  │ ✅     │ No errors        │
│ ESLint      │ ✅     │ 0 errors, 2 warn │
│ Null Safety │ ⚠️     │ 1 medium issue   │
│ Unit Tests  │ ✅     │ 45 passed        │
│ Secrets     │ ✅     │ Clean            │
└─────────────┴────────┴──────────────────┘

📝 Medium Issue (non-blocking):
- src/components/NewFeature.tsx:23
  Consider adding null check for optional prop

✅ READY TO COMMIT

Suggested commit message:
feat: add new dashboard feature
```
