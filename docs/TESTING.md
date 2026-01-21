# Testing & Debugging Standards

**Purpose:** Comprehensive testing standards and debugging protocol. Follow this when writing tests or investigating bugs.

**Related Documents:**

- [CODING_PRINCIPLES.md](./CODING_PRINCIPLES.md) - Code quality standards
- [LEARNINGS.md](./LEARNINGS.md) - Bug registry and prevention patterns
- [ISSUE_WORKFLOW.md](./ISSUE_WORKFLOW.md) - Issue fixing workflow

---

## Table of Contents

1. [Debugging Protocol](#1-debugging-protocol)
2. [Test Execution](#2-test-execution)
3. [Test Coverage Requirements](#3-test-coverage-requirements)
4. [Test Patterns](#4-test-patterns)
5. [Error Investigation](#5-error-investigation)
6. [Integration Test Patterns](#6-integration-test-patterns)

---

## 1. Debugging Protocol

**MANDATORY:** Follow this 7-step protocol when ANY error occurs. Don't skip steps.

### Step 1: STOP

**DO NOT immediately try random fixes.**

```
❌ WRONG: See error → Try fix 1 → Fail → Try fix 2 → Fail → Try fix 3
✅ RIGHT: See error → Understand → Identify root cause → Apply correct fix once
```

Actions:

- Take a breath
- Resist the urge to "just try something"
- This step saves hours of wasted effort

### Step 2: UNDERSTAND

**Read the error message COMPLETELY.**

```typescript
// Error example:
// TypeError: Cannot read properties of undefined (reading 'toLocaleString')
//     at OdooSyncCard (OdooSyncCard.tsx:45:28)
//     at renderWithHooks (react-dom.development.js:14985:18)

// Extract information:
// - Error type: TypeError (property access on undefined)
// - Method: toLocaleString()
// - File: OdooSyncCard.tsx
// - Line: 45, Column: 28
// - Context: React component rendering
```

Questions to answer:

- What type of error? (TypeError, SyntaxError, NetworkError, etc.)
- What exact operation failed?
- What file and line?
- What function/component was executing?

### Step 3: INVESTIGATE

**Trace the execution path.**

Tools to use:

1. **Browser DevTools Console**
   - Check for additional error messages
   - Look at stack trace

2. **Browser DevTools Network Tab**
   - Check API response status codes
   - Verify response payload structure
   - Check for 4xx/5xx errors

3. **Strategic console.log**

   ```typescript
   // Add BEFORE the error line:
   console.log("DEBUG: value before error:", {
     syncLog,
     odoo_response: syncLog?.odoo_response,
     quotes: syncLog?.odoo_response?.quotes,
   });
   ```

4. **Supabase Logs**
   - Dashboard > Logs > Edge Functions
   - Dashboard > Logs > Postgres
   - Check for query failures or RLS denials

5. **Vercel Logs** (for production)
   - Project > Logs
   - Filter by function or time range

### Step 4: IDENTIFY

**Find the ROOT CAUSE, not just symptoms.**

Decision Tree for Common Bugs:

```
Error: "Cannot read properties of undefined"
├── Check: Is the variable initialized?
│   └── No → Initialize or add default
├── Check: Is it an async data fetch issue?
│   └── Yes → Add loading state check
├── Check: Is the API returning expected shape?
│   └── No → Validate API response, add Zod schema
└── Check: Is optional chaining missing?
    └── Yes → Add ?. and ?? operators
```

```
Error: "Network error" or "Failed to fetch"
├── Check: Is the API endpoint correct?
│   └── Verify URL, check for typos
├── Check: Are credentials included?
│   └── Verify auth headers, check token expiry
├── Check: Is CORS configured?
│   └── Verify server-side CORS headers
└── Check: Is the server running?
    └── Check Vercel/Supabase status
```

```
Error: Database query returns empty/wrong data
├── Check: Is the query correct?
│   └── Test query directly in Supabase SQL editor
├── Check: Are RLS policies blocking access?
│   └── Temporarily disable RLS, test again
├── Check: Is the user authenticated?
│   └── Verify session exists
└── Check: Does the data exist?
    └── Query with admin credentials
```

### Step 5: FIX

**Address the root cause, not symptoms.**

```typescript
// ❌ WRONG - Symptom fix (adds check but doesn't fix design)
if (syncLog?.odoo_response?.quotes) {
  // render
}

// ✅ CORRECT - Root cause fix (ensure data has defaults)
const quotes = syncLog?.odoo_response?.quotes ?? [];
// Safe to render with empty state handling
```

Fix checklist:

- [ ] Fix addresses ROOT CAUSE, not just current symptom
- [ ] Fix doesn't introduce new bugs
- [ ] Fix follows coding principles (see CODING_PRINCIPLES.md)
- [ ] Fix has appropriate test coverage

### Step 6: LEARN

**Document in LEARNINGS.md.**

After EVERY bug fix, add an entry:

```markdown
### [YYYY-MM-DD] BUG-XXX: CATEGORY - Brief Title

**Context**: What were you trying to do?
**Mistake**: What went wrong?
**Root Cause**: Why did this happen?
**Solution**: How to fix/avoid?

**Prevention Rule**: One-line axiom to never repeat this.

**Code Example**:
❌ Wrong: `syncLog.odoo_response.quotes.map(...)`
✅ Correct: `(syncLog?.odoo_response?.quotes ?? []).map(...)`

**Test Case**: [Include test]
```

### Step 7: PREVENT

**Consider if similar issues exist elsewhere.**

```bash
# Search for similar patterns in codebase
rg "\.toLocaleString\(\)" --type ts
rg "\.map\(" --type tsx -A 1 | grep -v "??"

# Check for same anti-pattern in other files
rg "odoo_response\." --type ts
```

If found:

1. Fix all occurrences
2. Consider adding a lint rule
3. Update CODING_PRINCIPLES.md if needed

---

## 2. Test Execution

### Running Tests

```bash
# All tests
bun test

# Watch mode during development
bun test --watch

# Specific file
bun test src/components/OdooSyncCard.test.tsx

# With coverage
bun test --coverage

# E2E tests
bun test:e2e

# Specific E2E test
bunx playwright test tests/e2e/login.spec.ts
```

### Before Every PR

```bash
# Quality gate (must all pass)
bun typecheck && bun lint && bun test
```

### Test File Naming

```
Component.tsx      → Component.test.tsx
utils.ts           → utils.test.ts
route.ts           → __tests__/route.test.ts
```

---

## 3. Test Coverage Requirements

### Coverage Targets

| Test Type         | Target         | Minimum           |
| ----------------- | -------------- | ----------------- |
| Unit Tests        | 80%            | 70%               |
| Integration Tests | 70%            | 60%               |
| E2E Tests         | Critical flows | All user journeys |

### What Must Be Tested

1. **Components**
   - Renders without crashing
   - Handles null/undefined props
   - Handles loading state
   - Handles error state
   - Handles empty state

2. **API Routes**
   - Success response
   - Error response
   - Invalid input handling
   - Authentication required (if protected)

3. **Utilities**
   - Happy path
   - Edge cases (null, empty, boundary values)
   - Error cases

---

## 4. Test Patterns

### 4.1 Null Safety Testing (MANDATORY)

Every component must have null safety tests:

```typescript
describe('OdooSyncCard', () => {
  describe('Null Safety', () => {
    it('should render without crashing when syncLog is undefined', () => {
      expect(() => render(<OdooSyncCard syncLog={undefined} />))
        .not.toThrow();
    });

    it('should render without crashing when odoo_response is undefined', () => {
      const syncLog = createTestSyncLog({ odoo_response: undefined });
      expect(() => render(<OdooSyncCard syncLog={syncLog} />))
        .not.toThrow();
    });

    it('should handle null values in nested properties', () => {
      const syncLog = createTestSyncLog({
        odoo_response: { quotes: [{ amount: null }] },
      });
      render(<OdooSyncCard syncLog={syncLog} />);
      expect(screen.getByText('₹0')).toBeInTheDocument();
    });
  });
});
```

### 4.2 Factory Pattern for Test Data

```typescript
// tests/factories/syncLog.ts
export function createTestSyncLog(overrides: Partial<SyncLog> = {}): SyncLog {
  return {
    id: "sync-123",
    sync_type: "quote_pull",
    status: "success",
    created_at: "2026-01-17T10:00:00Z",
    odoo_response: {
      quotes: [{ number: "Q001", amount: 10000, state: "sent" }],
    },
    ...overrides,
  };
}

// Usage in tests
const syncLog = createTestSyncLog({ status: "failed" });
```

### 4.3 E2E Error Tracking

```typescript
import { trackErrors } from "../helpers/error-tracker";

test("should load dashboard without errors", async ({ page }) => {
  const errors = await trackErrors(page);

  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  // Verify no runtime errors
  expect(errors, "Page should have no runtime errors").toEqual([]);

  // Verify no console errors
  const consoleErrors = errors.filter((e) => e.type === "console");
  expect(consoleErrors).toEqual([]);
});
```

### 4.4 API Route Testing

```typescript
describe("POST /api/leads", () => {
  it("should create a lead with valid data", async () => {
    const response = await POST(
      new Request("http://localhost/api/leads", {
        method: "POST",
        body: JSON.stringify({ name: "Test", phone: "+919876543210" }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBeDefined();
  });

  it("should return 400 for invalid data", async () => {
    const response = await POST(
      new Request("http://localhost/api/leads", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });
});
```

---

## 5. Error Investigation

### Browser DevTools Usage

#### Console Tab

```
1. Filter by "Error" to focus on problems
2. Click error to expand stack trace
3. Click file:line to jump to source
4. Right-click → "Store as global variable" to inspect
```

#### Network Tab

```
1. Filter by "XHR" for API calls
2. Check Status column for non-200 codes
3. Click request → Preview for response body
4. Check Timing for slow requests (>500ms)
```

#### React DevTools

```
1. Components tab → Search for component
2. Check Props for unexpected undefined
3. Check State for stale data
4. Highlight updates to spot re-render issues
```

### Supabase Logs Interpretation

```sql
-- Check recent errors
SELECT * FROM auth.audit_log_entries
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check RLS denials (in Postgres logs)
-- Look for: "new row violates row-level security policy"
```

### Common Error Patterns

| Error Pattern                            | Likely Cause                  | Fix                             |
| ---------------------------------------- | ----------------------------- | ------------------------------- |
| `Cannot read properties of undefined`    | Missing null check            | Add `?.` or `??`                |
| `Failed to fetch`                        | Network/CORS issue            | Check API URL, verify CORS      |
| `Hydration mismatch`                     | Server/client content differs | Use `useEffect` for client-only |
| `RLS policy violation`                   | Missing auth or wrong user    | Check session, verify policies  |
| `Type 'X' is not assignable to type 'Y'` | Schema mismatch               | Update types, verify API        |

---

## 6. Integration Test Patterns

### 6.1 Supabase Test Transactions

```typescript
import { createClient } from "@supabase/supabase-js";

describe("Lead CRUD - Integration", () => {
  let supabase: SupabaseClient;
  let testLeadId: string;

  beforeAll(async () => {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  });

  afterEach(async () => {
    // Clean up test data
    if (testLeadId) {
      await supabase.from("leads").delete().eq("id", testLeadId);
    }
  });

  it("should create and retrieve a lead", async () => {
    // Create
    const { data: created, error: createError } = await supabase
      .from("leads")
      .insert({ name: "Test Lead", phone: "+919876543210" })
      .select()
      .single();

    expect(createError).toBeNull();
    testLeadId = created.id;

    // Retrieve
    const { data: retrieved, error: readError } = await supabase
      .from("leads")
      .select()
      .eq("id", testLeadId)
      .single();

    expect(readError).toBeNull();
    expect(retrieved.name).toBe("Test Lead");
  });
});
```

### 6.2 Mock External APIs

```typescript
// tests/mocks/odoo.ts
import { http, HttpResponse } from "msw";

export const odooHandlers = [
  http.post("https://odoo.example.com/jsonrpc", async ({ request }) => {
    const body = await request.json();

    if (body.method === "call" && body.params.method === "search_read") {
      return HttpResponse.json({
        result: [{ id: 1, name: "Quote 1", amount_total: 10000 }],
      });
    }

    return HttpResponse.json({ error: "Unknown method" }, { status: 400 });
  }),
];

// tests/setup.ts
import { setupServer } from "msw/node";
import { odooHandlers } from "./mocks/odoo";

export const server = setupServer(...odooHandlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 6.3 Test Data Factories

```typescript
// tests/factories/index.ts
import { faker } from "@faker-js/faker";

export const factories = {
  lead: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    phone: `+91${faker.string.numeric(10)}`,
    email: faker.internet.email(),
    status: "new",
    created_at: faker.date.recent().toISOString(),
    ...overrides,
  }),

  quote: (overrides = {}) => ({
    id: faker.number.int({ min: 1, max: 1000 }),
    name: `Q${faker.string.numeric(4)}`,
    amount_total: faker.number.float({ min: 1000, max: 100000 }),
    state: faker.helpers.arrayElement(["draft", "sent", "sale"]),
    ...overrides,
  }),
};
```

---

## Quick Reference

### When Debugging

1. STOP - Don't guess
2. UNDERSTAND - Read error completely
3. INVESTIGATE - Use DevTools, logs
4. IDENTIFY - Find root cause
5. FIX - Address root cause
6. LEARN - Update LEARNINGS.md
7. PREVENT - Check for similar issues

### Before Writing Tests

- [ ] Identify all states (loading, error, empty, success)
- [ ] List null/undefined edge cases
- [ ] Define expected behaviors
- [ ] Check LEARNINGS.md for related bugs

### Test Checklist

- [ ] Null safety tests included
- [ ] Loading state tested
- [ ] Error state tested
- [ ] Empty state tested
- [ ] E2E tests track runtime errors

---

_Last Updated: January 17, 2026_
_Version: 1.0_
