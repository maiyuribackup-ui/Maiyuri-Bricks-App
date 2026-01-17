# Code Review Command

Review code changes against coding principles and learnings.

## Instructions

When the user runs `/code-review` or `/review`, perform a comprehensive code review:

### 1. Identify Changes

Get the files to review:
```bash
# Staged changes
git diff --cached --name-only

# Or unstaged changes
git diff --name-only

# Or specific file
# /review src/components/NewFeature.tsx
```

### 2. Review Checklist

For each changed file, check against these categories:

#### Null Safety (CRITICAL)
Reference: `docs/CODING_PRINCIPLES.md#1-null-safety-critical`

- [ ] All method calls on nullable values have defaults
- [ ] Optional chaining used for nested access
- [ ] Nullish coalescing (`??`) used instead of `||`
- [ ] Array methods have default arrays

#### TypeScript
Reference: `docs/CODING_PRINCIPLES.md#2-typescript-patterns`

- [ ] No `any` types (use `unknown` if needed)
- [ ] No `@ts-ignore` or `@ts-expect-error`
- [ ] Interfaces match actual data shapes
- [ ] Proper use of generics

#### React Patterns
Reference: `docs/CODING_PRINCIPLES.md#3-react-best-practices`

- [ ] Safe conditional rendering
- [ ] Error boundaries where needed
- [ ] Loading/error/empty states handled
- [ ] Props have sensible defaults

#### Error Handling
Reference: `docs/CODING_PRINCIPLES.md#5-error-handling`

- [ ] Errors are logged, not swallowed
- [ ] User-friendly error messages
- [ ] API errors handled gracefully

#### Testing
Reference: `docs/CODING_PRINCIPLES.md#6-testing-requirements`

- [ ] Tests for null/undefined edge cases
- [ ] E2E tests for critical flows
- [ ] No console.log left in code

### 3. Check Against Learnings

Compare changes against `docs/LEARNINGS.md`:
- Does this code match any previous bug patterns?
- Are the prevention patterns being followed?

### 4. Output Format

```markdown
## Code Review Results

**Files Reviewed:** X
**Issues Found:** Y (Z critical)

### File: `src/components/NewFeature.tsx`

#### ✅ Passing Checks
- Null safety: Proper defaults used
- TypeScript: Clean types
- Error handling: User-friendly messages

#### ⚠️ Issues Found

**CRITICAL: Null Safety Violation (Line 45)**
```typescript
// Current code
{data.items.map(i => i.name)}

// Should be
{(data?.items ?? []).map(i => i?.name ?? 'Unknown')}
```
Related: BUG-002 in LEARNINGS.md

**MEDIUM: Missing Loading State (Line 23-67)**
Component doesn't handle loading state.
Related: REACT-003 in CODING_PRINCIPLES.md

**LOW: Console.log Left (Line 89)**
```typescript
console.log('Debug:', result); // Remove before commit
```

### Summary

| Category | Status |
|----------|--------|
| Null Safety | ⚠️ 1 issue |
| TypeScript | ✅ Clean |
| React Patterns | ⚠️ 1 issue |
| Error Handling | ✅ Good |
| Testing | ❓ Need tests |

### Recommendations
1. Fix null safety issue on line 45
2. Add loading state handling
3. Remove console.log
4. Add unit tests for edge cases

### Approval Status: ❌ CHANGES REQUESTED
```

## Quick Review Mode

For fast review of specific concerns:

```
/review --null-only        # Only check null safety
/review --types-only       # Only check TypeScript
/review --against-learnings # Check against past bugs
```
