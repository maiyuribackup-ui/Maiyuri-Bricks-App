# Learning Documentation Command

Document a bug or learning to prevent future occurrences.

## Instructions

When the user runs `/learning`, help them document a bug using this workflow:

### 1. Gather Information

Ask the user (or extract from context):
- **Bug ID:** Auto-generate next number (BUG-XXX)
- **Error Message:** What error appeared?
- **Files Affected:** Which files had the bug?
- **Severity:** Critical/High/Medium/Low
- **Root Cause:** Why did it happen?

### 2. Generate Documentation

Create an entry for `docs/LEARNINGS.md` in this format:

```markdown
### BUG-XXX: [Short Description]

**Date:** [Today's date]
**Severity:** [Critical/High/Medium/Low]
**Files Affected:** [List]

**Error Message:**
```
[Exact error message]
```

**Root Cause:**
[Explanation]

**Bad Code:**
```typescript
[Code that caused the bug]
```

**Good Code:**
```typescript
[Fixed code]
```

**Prevention Pattern:**
[Generic pattern to prevent similar bugs]

**Test Case to Add:**
```typescript
[Test that would catch this]
```

**Related Coding Principle:** [Link]
```

### 3. Update Related Documents

After adding the learning:
1. Check if a new coding principle is needed in `CODING_PRINCIPLES.md`
2. Update the prevention checklist if needed
3. Suggest a test to add

### 4. Output

```markdown
## Learning Documented

✅ Added BUG-XXX to docs/LEARNINGS.md
✅ Related to principle: [PRINCIPLE-ID]

### Summary
- **Bug:** [Short description]
- **Root Cause:** [One sentence]
- **Prevention:** [Pattern name]

### Action Items
- [ ] Add unit test: `[file].test.tsx`
- [ ] Update component with fix
- [ ] Consider adding ESLint rule

### Similar Code to Check
Found X similar patterns that might have same issue:
1. [file:line]
2. [file:line]
```

## Quick Add Mode

If user provides error message directly, auto-fill:

```
/learning "Cannot read properties of undefined (reading 'toLocaleString')"
```

Auto-extracts:
- Pattern: Method call on undefined
- Category: Null Safety
- Suggested principle: NULL-001
