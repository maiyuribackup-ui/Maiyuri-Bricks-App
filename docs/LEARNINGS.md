# Bug Learnings & Prevention Registry

**Purpose:** Document every bug, its root cause, and prevention patterns to build institutional knowledge and prevent recurrence.

**Principle:** "Every bug is a lesson. Document it, prevent it, never repeat it."

---

## Table of Contents

1. [Null Safety Issues](#1-null-safety-issues)
2. [TypeScript Type Mismatches](#2-typescript-type-mismatches)
3. [API Response Handling](#3-api-response-handling)
4. [React Rendering Issues](#4-react-rendering-issues)
5. [Database & Data Issues](#5-database--data-issues)
6. [Prevention Checklist](#prevention-checklist)

---

## 1. Null Safety Issues

### BUG-001: toLocaleString on Undefined (Critical)

**Date:** January 17, 2026
**Severity:** Critical (Production crash)
**Files Affected:**
- `OdooSyncCard.tsx`
- `KPICard.tsx`
- `ProductInterestBreakdown.tsx`

**Error Message:**
```
Cannot read properties of undefined (reading 'toLocaleString')
```

**Root Cause:**
Calling `.toLocaleString()` on values that could be `undefined` or `null` when database queries return incomplete data.

**Bad Code:**
```typescript
// CRASHED when value was null/undefined
<span>₹{quote.amount.toLocaleString('en-IN')}</span>
<span>{value.toLocaleString()}</span>
<span>{product.avgQuantity.toLocaleString()} units</span>
```

**Good Code:**
```typescript
// SAFE with default value
<span>₹{(quote.amount || 0).toLocaleString('en-IN')}</span>
<span>{(value || 0).toLocaleString()}</span>
<span>{(product.avgQuantity || 0).toLocaleString()} units</span>

// SAFER with optional chaining + nullish coalescing
<span>₹{(quote?.amount ?? 0).toLocaleString('en-IN')}</span>
```

**Prevention Pattern:**
```typescript
// RULE: Always wrap potentially nullable values before method calls
const safeFormat = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString('en-IN');

// Use in component
<span>₹{safeFormat(quote.amount)}</span>
```

**Test Case to Add:**
```typescript
it('should handle undefined values gracefully', () => {
  const props = { value: undefined };
  expect(() => render(<Component {...props} />)).not.toThrow();
});
```

**Related Coding Principle:** [NULL-001](./CODING_PRINCIPLES.md#null-001-always-handle-null-undefined)

---

### BUG-002: Optional Chaining Not Used on Nested Objects

**Date:** January 17, 2026
**Severity:** High
**Files Affected:** `OdooSyncCard.tsx`, `LeadActivityTimeline.tsx`

**Error Message:**
```
Cannot read properties of undefined (reading 'quotes')
```

**Root Cause:**
Accessing nested object properties without optional chaining when parent objects can be undefined.

**Bad Code:**
```typescript
// CRASHED when odoo_response was undefined
const quotes = syncLog.odoo_response.quotes;
```

**Good Code:**
```typescript
// SAFE with optional chaining and default
const quotes = syncLog.odoo_response?.quotes ?? [];
```

**Prevention Pattern:**
```typescript
// RULE: For nested access, always use optional chaining
const safeNestedAccess = <T,>(obj: any, path: string, defaultValue: T): T => {
  return path.split('.').reduce((o, k) => o?.[k], obj) ?? defaultValue;
};

// Or use lodash/get
import { get } from 'lodash';
const quotes = get(syncLog, 'odoo_response.quotes', []);
```

**Related Coding Principle:** [NULL-002](./CODING_PRINCIPLES.md#null-002-optional-chaining-for-nested-access)

---

## 2. TypeScript Type Mismatches

### BUG-003: Interface Does Not Match Database Schema

**Date:** January 17, 2026
**Severity:** Medium
**Files Affected:** `odoo-service.ts`, `OdooSyncCard.tsx`

**Error Message:**
Component expected `number` field but service saved as `name`

**Root Cause:**
TypeScript interface defined field as `number: string` but service saved it as `name: string`, causing mismatch.

**Bad Code:**
```typescript
// Service saved:
{ name: q.name, amount: q.amount_total }

// Component expected:
interface Quote { number: string; amount: number; }
```

**Good Code:**
```typescript
// Create shared type used by both service and component
// types/odoo.ts
export interface OdooQuote {
  number: string;
  amount: number;
  state: string;
  date?: string;
}

// Service uses shared type
const quote: OdooQuote = { number: q.name, amount: q.amount_total, ... };

// Component uses same shared type
interface Props { quotes: OdooQuote[]; }
```

**Prevention Pattern:**
1. Define types in `packages/shared/src/types/`
2. Import from shared package in both frontend and backend
3. Use Zod schemas to validate at boundaries

**Related Coding Principle:** [TYPE-001](./CODING_PRINCIPLES.md#type-001-single-source-of-truth-for-types)

---

## 3. API Response Handling

### BUG-004: Not Handling Empty API Responses

**Date:** TBD
**Severity:** Medium

**Common Error:**
```
Cannot read properties of undefined (reading 'map')
```

**Bad Code:**
```typescript
const data = await fetchLeads();
return data.leads.map(l => ...); // CRASHES if data.leads is undefined
```

**Good Code:**
```typescript
const data = await fetchLeads();
const leads = data?.leads ?? [];
return leads.map(l => ...);

// Or with validation
const result = LeadsResponseSchema.safeParse(data);
if (!result.success) {
  console.error('Invalid API response', result.error);
  return [];
}
return result.data.leads.map(l => ...);
```

**Prevention Pattern:**
```typescript
// Always validate API responses with Zod
const ApiResponseSchema = z.object({
  data: z.array(LeadSchema).default([]),
  meta: z.object({
    total: z.number().default(0),
    page: z.number().default(1),
  }).optional(),
});

async function fetchWithValidation<T>(url: string, schema: z.ZodSchema<T>): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  return schema.parse(json);
}
```

**Related Coding Principle:** [API-001](./CODING_PRINCIPLES.md#api-001-validate-all-api-responses)

---

## 4. React Rendering Issues

### BUG-005: Conditional Rendering Not Checking All Dependencies

**Date:** TBD
**Severity:** Medium

**Bad Code:**
```typescript
// Only checks lead, not nested properties
{lead && (
  <div>{lead.odoo.quoteAmount.toLocaleString()}</div>
)}
```

**Good Code:**
```typescript
// Check the exact property being accessed
{lead?.odoo?.quoteAmount != null && (
  <div>{lead.odoo.quoteAmount.toLocaleString()}</div>
)}

// Or use a helper component
<SafeRender value={lead?.odoo?.quoteAmount}>
  {(amount) => <div>{amount.toLocaleString()}</div>}
</SafeRender>
```

**Prevention Pattern:**
```typescript
// SafeRender component
function SafeRender<T>({
  value,
  children,
  fallback = null
}: {
  value: T | null | undefined;
  children: (value: T) => React.ReactNode;
  fallback?: React.ReactNode;
}) {
  if (value == null) return <>{fallback}</>;
  return <>{children(value)}</>;
}
```

**Related Coding Principle:** [REACT-001](./CODING_PRINCIPLES.md#react-001-safe-conditional-rendering)

---

## 5. Database & Data Issues

### BUG-006: Database Returns NULL for Aggregations

**Date:** January 17, 2026
**Severity:** Medium
**Files Affected:** `ProductInterestBreakdown.tsx`

**Root Cause:**
SQL `AVG()` returns `NULL` when no rows match, but TypeScript interface expects `number`.

**Bad Code:**
```typescript
interface Product { avgQuantity: number; } // Interface says number

// But SQL returns:
SELECT AVG(quantity) as avg_quantity // Returns NULL if no rows
```

**Good Code:**
```typescript
// Option 1: Make interface nullable
interface Product { avgQuantity: number | null; }

// Option 2: Use COALESCE in SQL
SELECT COALESCE(AVG(quantity), 0) as avg_quantity

// Option 3: Default in TypeScript
const avgQuantity = row.avg_quantity ?? 0;
```

**Prevention Pattern:**
- Always use `COALESCE` for aggregations in SQL
- Always handle nullable fields in interfaces
- Add database constraints where appropriate

**Related Coding Principle:** [DB-001](./CODING_PRINCIPLES.md#db-001-handle-null-in-aggregations)

---

### BUG-007: XML-RPC Parser Fails on Nested Tags (Critical)

**Date:** January 17, 2026
**Severity:** Critical (Data loss - quotes displayed as empty)
**Files Affected:** `apps/web/src/lib/odoo-service.ts`

**Error Message:**
```
No visible error - data silently lost. Quotes array contained empty objects: [{}]
```

**Root Cause:**
Custom XML-RPC parser used regex to find matching close tags, but the `findMatchingClose` function had incorrect depth tracking logic. It started with `depth = 0` and incremented when finding the opening tag, but by that point the function was already AT the opening tag (passed `startPos`), causing it to never find the correct closing tag.

The Odoo XML-RPC response contains nested structures like:
```xml
<struct>
  <member>
    <name>partner_id</name>
    <value><array><data>
      <value><int>429</int></value>
      <value><string>Name</string></value>
    </data></array></value>
  </member>
</struct>
```

**Bad Code:**
```typescript
function findMatchingClose(xml: string, tagName: string, startPos: number): number {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  let depth = 0;  // BUG: Should start at 1 since we're AT the opening tag
  let pos = startPos;  // BUG: Should start AFTER the opening tag

  while (pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;  // First iteration finds the tag we're already at!
      // ...
    }
  }
}
```

**Good Code:**
```typescript
function findMatchingClose(xml: string, tagName: string, startPos: number): number {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  // Start AFTER the opening tag, with depth already at 1
  let depth = 1;
  let pos = startPos + openTag.length;

  while (pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeTag.length;
    }
  }
  return -1;
}
```

**Prevention Pattern:**
1. **Don't parse XML with regex** - Use proper XML parser libraries like `fast-xml-parser`
2. **Test with nested data** - Always test parsers with deeply nested structures
3. **Add debug logging** - Log intermediate parsing steps to catch silent failures
4. **Validate output** - Check that parsed data has expected structure before saving

**Test Case to Add:**
```typescript
describe('XML-RPC Parser', () => {
  it('should handle nested structs with arrays', () => {
    const xml = `<struct>
      <member><name>partner_id</name>
      <value><array><data>
        <value><int>429</int></value>
        <value><string>Test</string></value>
      </data></array></value></member>
    </struct>`;

    const result = parseValue(xml);
    expect(result).toEqual({
      partner_id: [429, "Test"]
    });
  });
});
```

**Related Coding Principle:** [PARSE-001: Avoid Parsing Complex Formats with Regex]

---

## Prevention Checklist

### Before Writing Code
- [ ] Read `CODING_PRINCIPLES.md` null safety section
- [ ] Check if similar bugs exist in this file
- [ ] Understand data sources and what can be null/undefined

### While Writing Code
- [ ] Use optional chaining (`?.`) for all nested access
- [ ] Use nullish coalescing (`??`) for defaults
- [ ] Never call methods on potentially undefined values
- [ ] Validate API responses with Zod

### Before Committing
- [ ] Run `/null-check` command to scan for vulnerabilities
- [ ] Add tests for null/undefined edge cases
- [ ] Run `bun typecheck` with strict mode
- [ ] Check this file for similar bugs

### Before Deploying
- [ ] Run E2E tests with error tracking
- [ ] Test with empty/incomplete data
- [ ] Verify no console errors

---

## How to Add New Bugs

When a bug is found, add it using this template:

```markdown
### BUG-XXX: [Short Description]

**Date:** [Date discovered]
**Severity:** Critical/High/Medium/Low
**Files Affected:** [List of files]

**Error Message:**
```
[Exact error message]
```

**Root Cause:**
[Explanation of why it happened]

**Bad Code:**
```typescript
[Code that caused the bug]
```

**Good Code:**
```typescript
[Fixed code with explanation]
```

**Prevention Pattern:**
[Generic pattern to prevent similar bugs]

**Test Case to Add:**
```typescript
[Test that would catch this bug]
```

**Related Coding Principle:** [Link to principle]
```

---

## Statistics

| Month | Bugs Found | Bugs Prevented | Prevention Rate |
|-------|-----------|----------------|-----------------|
| Jan 2026 | 7 | 0 | - |
| Feb 2026 | TBD | TBD | TBD |

**Goal:** 95%+ bug prevention rate through proactive coding principles and testing.

---

*Last Updated: January 17, 2026*
*Maintainers: Development Team*
