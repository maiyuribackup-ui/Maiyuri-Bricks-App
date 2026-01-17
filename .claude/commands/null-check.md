# Null Safety Check Command

Scan the codebase for potential null safety issues that could cause runtime errors.

## Instructions

When the user runs `/null-check`, perform the following:

### 1. Scan for Dangerous Patterns

Search the codebase for these vulnerability patterns:

```bash
# Pattern 1: Method calls without null checks
rg "\.toLocaleString\(\)" apps/web/src --type ts --type tsx
rg "\.toLowerCase\(\)" apps/web/src --type ts --type tsx
rg "\.toUpperCase\(\)" apps/web/src --type ts --type tsx
rg "\.toString\(\)" apps/web/src --type ts --type tsx
rg "\.trim\(\)" apps/web/src --type ts --type tsx

# Pattern 2: Array methods without defaults
rg "\.map\(" apps/web/src --type ts --type tsx | grep -v "?? \[\]"
rg "\.filter\(" apps/web/src --type ts --type tsx
rg "\.reduce\(" apps/web/src --type ts --type tsx
rg "\.forEach\(" apps/web/src --type ts --type tsx

# Pattern 3: Nested property access without optional chaining
rg "\w+\.\w+\.\w+" apps/web/src --type ts --type tsx | grep -v "\?\\."
```

### 2. Analyze Each Finding

For each potential issue found:
1. Read the surrounding code context
2. Check if null safety is already handled
3. Identify if the value can actually be null/undefined

### 3. Report Format

Output a report in this format:

```markdown
## Null Safety Scan Results

**Files Scanned:** X
**Potential Issues Found:** Y
**Critical:** Z

### Critical Issues (Fix Immediately)
| File | Line | Code | Risk |
|------|------|------|------|
| ... | ... | ... | High/Medium/Low |

### Recommendations
1. [Specific fix for issue 1]
2. [Specific fix for issue 2]

### Safe Patterns (No Action Needed)
- [Files with proper null handling]
```

### 4. Auto-Fix Option

If user adds `--fix` flag, offer to automatically fix obvious issues:
- Add `?? 0` for number formatting
- Add `?? []` for array operations
- Add `?.` for nested access

## Example Output

```
🔍 Null Safety Scan

Scanning apps/web/src...

⚠️  FOUND 3 POTENTIAL ISSUES:

1. src/components/dashboard/NewCard.tsx:45
   → value.toLocaleString() without null check
   → Fix: (value ?? 0).toLocaleString()

2. src/components/leads/LeadTable.tsx:89
   → items.map() without default array
   → Fix: (items ?? []).map()

3. src/lib/utils.ts:23
   → data.user.profile.name without optional chaining
   → Fix: data?.user?.profile?.name ?? 'Unknown'

✅ SAFE: 45 files have proper null handling

Run with --fix to auto-apply fixes.
```
