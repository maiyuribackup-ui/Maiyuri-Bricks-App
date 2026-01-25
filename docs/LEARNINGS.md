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
6. [CI/Build Configuration Issues](#6-cibuild-configuration-issues)
7. [Implementation Patterns](#7-implementation-patterns)
8. [Prevention Checklist](#prevention-checklist)

---

## 1. Null Safety Issues

### [2026-01-17] BUG-001: NULL - toLocaleString on Undefined

**Severity:** Critical (Production crash)
**Files Affected:** `OdooSyncCard.tsx`, `KPICard.tsx`, `ProductInterestBreakdown.tsx`

**Context:** Displaying formatted currency and numbers in UI components.

**Mistake:** Called `.toLocaleString()` on values that could be `undefined` or `null`.

**Error Message:**

```
Cannot read properties of undefined (reading 'toLocaleString')
```

**Root Cause:** Database queries can return incomplete data. TypeScript interface said `number` but actual value was `undefined`.

**Prevention Rule:** Never call instance methods on unguarded nullable values; always use `(value ?? default).method()`.

**Code Example:**

```typescript
❌ Wrong:   <span>₹{quote.amount.toLocaleString('en-IN')}</span>
✅ Correct: <span>₹{(quote?.amount ?? 0).toLocaleString('en-IN')}</span>
```

**Solution:**

```typescript
// Create safe helper
const safeFormat = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString('en-IN');

// Use in component
<span>₹{safeFormat(quote.amount)}</span>
```

**Test Case:**

```typescript
it('should handle undefined values gracefully', () => {
  const props = { value: undefined };
  expect(() => render(<Component {...props} />)).not.toThrow();
});
```

**Related Bugs:** BUG-002, BUG-005, BUG-006
**Related Coding Principle:** [NULL-001](./CODING_PRINCIPLES.md#null-001-always-handle-null-undefined)

---

### [2026-01-17] BUG-002: NULL - Optional Chaining Not Used on Nested Objects

**Severity:** High
**Files Affected:** `OdooSyncCard.tsx`, `LeadActivityTimeline.tsx`

**Context:** Accessing Odoo response data in sync log display.

**Mistake:** Accessed nested object properties directly without checking if parent exists.

**Error Message:**

```
Cannot read properties of undefined (reading 'quotes')
```

**Root Cause:** API responses don't always include all nested data. TypeScript types showed nested structure but actual data was sparse.

**Prevention Rule:** For nested access, always use `?.` chain with `??` default: `obj?.level1?.level2 ?? defaultValue`.

**Code Example:**

```typescript
❌ Wrong:   const quotes = syncLog.odoo_response.quotes;
✅ Correct: const quotes = syncLog?.odoo_response?.quotes ?? [];
```

**Solution:**

```typescript
// Helper for deep access
import { get } from "lodash";
const quotes = get(syncLog, "odoo_response.quotes", []);
```

**Related Bugs:** BUG-001, BUG-005
**Related Coding Principle:** [NULL-002](./CODING_PRINCIPLES.md#null-002-optional-chaining-for-nested-access)

---

## 2. TypeScript Type Mismatches

### [2026-01-17] BUG-003: TYPE - Interface Does Not Match Database Schema

**Severity:** Medium
**Files Affected:** `odoo-service.ts`, `OdooSyncCard.tsx`

**Context:** Displaying Odoo quote data in the sync card component.

**Mistake:** Service and component used different property names for the same field (`name` vs `number`).

**Error Message:**

```
Component expected `number` field but service saved as `name`
```

**Root Cause:**
TypeScript interface defined field as `number: string` but service saved it as `name: string`, causing mismatch.

**Prevention Rule:** Define types once in shared package; import everywhere—never duplicate interfaces.

**Code Example:**

```typescript
❌ Wrong:   { name: q.name, amount: q.amount_total }  // Service
           interface Quote { number: string; }        // Component (different!)
✅ Correct: import { OdooQuote } from "@maiyuri/shared"  // Both use same type
```

**Solution:**

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

**Related Bugs:** BUG-007
**Related Coding Principle:** [TYPE-001](./CODING_PRINCIPLES.md#type-001-single-source-of-truth-for-types)

---

## 3. API Response Handling

### [2026-01-17] BUG-004: API - Not Handling Empty API Responses

**Severity:** Medium
**Files Affected:** Various API consumers

**Context:** Fetching and rendering lists from API endpoints.

**Mistake:** Called `.map()` directly on API response without checking if array exists.

**Error Message:**

```
Cannot read properties of undefined (reading 'map')
```

**Root Cause:** API can return empty or malformed responses; code assumed data always exists.

**Prevention Rule:** Always validate API response structure with Zod schema before accessing properties.

**Code Example:**

```typescript
❌ Wrong:   return data.leads.map(l => ...);  // CRASHES if data.leads is undefined
✅ Correct: const leads = data?.leads ?? []; return leads.map(l => ...);
```

**Solution:**

```typescript
// Always validate API responses with Zod
const ApiResponseSchema = z.object({
  data: z.array(LeadSchema).default([]),
  meta: z
    .object({
      total: z.number().default(0),
      page: z.number().default(1),
    })
    .optional(),
});

async function fetchWithValidation<T>(
  url: string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  return schema.parse(json);
}
```

**Related Bugs:** BUG-001, BUG-002
**Related Coding Principle:** [API-001](./CODING_PRINCIPLES.md#api-001-validate-all-api-responses)

---

## 4. React Rendering Issues

### [2026-01-17] BUG-005: REACT - Conditional Rendering Not Checking All Dependencies

**Severity:** Medium
**Files Affected:** Various React components

**Context:** Conditionally rendering nested data in React components.

**Mistake:** Used `&&` to check parent object but accessed deeply nested property that could be undefined.

**Error Message:**

```
Cannot read properties of undefined (reading 'toLocaleString')
```

**Root Cause:** `lead && ...` only checks if `lead` is truthy, not if `lead.odoo.quoteAmount` exists.

**Prevention Rule:** Conditional render checks must match the exact property chain being accessed.

**Code Example:**

```typescript
❌ Wrong:   {lead && (<div>{lead.odoo.quoteAmount.toLocaleString()}</div>)}
✅ Correct: {lead?.odoo?.quoteAmount != null && (<div>{lead.odoo.quoteAmount.toLocaleString()}</div>)}
```

**Solution:**

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

// Usage
<SafeRender value={lead?.odoo?.quoteAmount}>
  {(amount) => <div>{amount.toLocaleString()}</div>}
</SafeRender>
```

**Related Bugs:** BUG-001, BUG-002
**Related Coding Principle:** [REACT-001](./CODING_PRINCIPLES.md#react-001-safe-conditional-rendering)

---

## 5. Database & Data Issues

### [2026-01-17] BUG-006: DB - Database Returns NULL for Aggregations

**Severity:** Medium
**Files Affected:** `ProductInterestBreakdown.tsx`

**Context:** Displaying average product quantities in dashboard breakdown.

**Mistake:** Interface declared `avgQuantity: number` but SQL `AVG()` returns `NULL` when no rows match.

**Error Message:**

```
Cannot read properties of null (reading 'toLocaleString')
```

**Root Cause:** SQL aggregation functions (`AVG`, `SUM`, `COUNT`) return `NULL` when no rows match, but TypeScript interface expected `number`.

**Prevention Rule:** Always use COALESCE in SQL aggregations; never assume aggregates return non-null.

**Code Example:**

```typescript
❌ Wrong:   SELECT AVG(quantity) as avg_quantity  // Returns NULL if no rows
✅ Correct: SELECT COALESCE(AVG(quantity), 0) as avg_quantity
```

**Solution:**

```typescript
// Option 1: Make interface nullable
interface Product { avgQuantity: number | null; }

// Option 2: Use COALESCE in SQL (PREFERRED)
SELECT COALESCE(AVG(quantity), 0) as avg_quantity

// Option 3: Default in TypeScript
const avgQuantity = row.avg_quantity ?? 0;
```

**Related Bugs:** BUG-001
**Related Coding Principle:** [DB-001](./CODING_PRINCIPLES.md#db-001-handle-null-in-aggregations)

---

### [2026-01-17] BUG-007: DB - XML-RPC Parser Fails on Nested Tags

**Severity:** Critical (Data loss - quotes displayed as empty)
**Files Affected:** `apps/web/src/lib/odoo-service.ts`

**Context:** Parsing Odoo XML-RPC responses to extract quote data.

**Mistake:** Custom regex-based XML parser had incorrect depth tracking, causing nested tags to be skipped.

**Error Message:**

```
No visible error - data silently lost. Quotes array contained empty objects: [{}]
```

**Root Cause:**
Custom XML-RPC parser used regex to find matching close tags, but `findMatchingClose` started with `depth = 0` at the opening tag position, causing it to never find the correct closing tag for nested structures.

**Prevention Rule:** Never parse XML/HTML with regex; always use proper parser libraries like `fast-xml-parser`.

**Code Example:**

```typescript
❌ Wrong:   let depth = 0; let pos = startPos;  // Starting AT the tag with depth 0
✅ Correct: let depth = 1; let pos = startPos + openTag.length;  // AFTER tag, depth 1
```

**Solution:**

```typescript
function findMatchingClose(
  xml: string,
  tagName: string,
  startPos: number,
): number {
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

**Test Case:**

```typescript
describe("XML-RPC Parser", () => {
  it("should handle nested structs with arrays", () => {
    const xml = `<struct>
      <member><name>partner_id</name>
      <value><array><data>
        <value><int>429</int></value>
        <value><string>Test</string></value>
      </data></array></value></member>
    </struct>`;

    const result = parseValue(xml);
    expect(result).toEqual({ partner_id: [429, "Test"] });
  });
});
```

**Related Bugs:** BUG-003
**Related Coding Principle:** [PARSE-001: Avoid Parsing Complex Formats with Regex]

---

### [2026-01-17] BUG-008: DB - Inconsistent Phone Number Normalization for WhatsApp

**Severity:** High (User experience - broken WhatsApp links)
**Files Affected:**

- `apps/web/app/(dashboard)/leads/page.tsx`
- `apps/web/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/components/leads/WhatsAppButton.tsx`
- `apps/web/app/api/leads/[id]/whatsapp-response/route.ts`

**Context:** Opening WhatsApp chat links from various parts of the application.

**Mistake:** Multiple files had different phone normalization logic—some added country codes, some didn't.

**Error Message:**

```
No visible error - WhatsApp links opened wrong numbers or failed silently.
Example: wa.me/9876543210 instead of wa.me/919876543210
```

**Root Cause:**
Multiple files had different implementations for normalizing phone numbers. Lack of centralized utility led to inconsistent behavior.

**Prevention Rule:** Any function used in 2+ places must be centralized in shared package; search before implementing.

**Code Example:**

```typescript
❌ Wrong:   window.open(`https://wa.me/${contact.replace(/[^0-9]/g, "")}`, "_blank");  // Missing country code
✅ Correct: import { buildWhatsAppUrl } from "@maiyuri/shared"; window.open(buildWhatsAppUrl(contact), "_blank");
```

**Solution:**

```typescript
// packages/shared/src/utils.ts
export function normalizePhoneForWhatsApp(
  phone: string,
  defaultCountryCode: string = "91",
): string {
  let normalized = phone.replace(/\D/g, "");
  if (normalized.length === 10) {
    normalized = defaultCountryCode + normalized;
  }
  if (normalized.startsWith("0") && normalized.length === 11) {
    normalized = defaultCountryCode + normalized.slice(1);
  }
  return normalized;
}

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const normalizedPhone = normalizePhoneForWhatsApp(phone);
  const baseUrl = `https://wa.me/${normalizedPhone}`;
  return message ? `${baseUrl}?text=${encodeURIComponent(message)}` : baseUrl;
}
```

**Test Case:**

```typescript
describe("normalizePhoneForWhatsApp", () => {
  it("should add 91 prefix to 10-digit numbers", () => {
    expect(normalizePhoneForWhatsApp("9876543210")).toBe("919876543210");
  });
  it("should handle numbers with +91 prefix", () => {
    expect(normalizePhoneForWhatsApp("+91 98765 43210")).toBe("919876543210");
  });
});
```

**Related Bugs:** None
**Related Coding Principle:** [UTIL-001: Centralize Shared Utilities]

---

## 6. CI/Build Configuration Issues

### [2026-01-17] BUG-009: CI - ESLint 9 Flat Config CLI Flag Incompatibility

**Severity:** Critical (CI completely blocked)
**Files Affected:**

- `apps/web/package.json`
- `apps/api/package.json`
- `packages/shared/package.json`
- `packages/ui/package.json`

**Context:** Running lint in CI pipeline after upgrading to ESLint 9.

**Mistake:** Used `--max-warnings -1` CLI flag which is not valid in ESLint 9 flat config.

**Error Message:**

```
No -NUM option defined.
You're using eslint.config.js, some command line flags are no longer available.
```

**Root Cause:**
ESLint 9 with flat config (`eslint.config.js`) does not support the `--max-warnings -1` syntax from legacy `.eslintrc` configurations.

**Prevention Rule:** Test lint locally before committing; check ESLint version compatibility for CLI flags.

**Code Example:**

```json
❌ Wrong:   "lint": "eslint . --max-warnings -1"
✅ Correct: "lint": "eslint ."
```

**Solution:**
Move warnings/errors config to `eslint.config.js` rules instead of CLI flags.

**Related Bugs:** BUG-012
**Related Coding Principle:** [CI-001: Test Build Configuration Locally Before Push]

---

### [2026-01-17] BUG-010: CI - Environment Missing Runtime (bun not installed)

**Severity:** Critical (CI completely blocked)
**Files Affected:**

- `package.json` (root)
- `apps/api/package.json`

**Context:** Running tests in GitHub Actions CI pipeline.

**Mistake:** Scripts used `bun test` but CI environment doesn't have bun installed by default.

**Error Message:**

```
Process completed with exit code 127.
bun: command not found
```

**Root Cause:**
Root `package.json` test script used `bun test` but GitHub Actions CI uses npm without bun.

**Prevention Rule:** Match CI runtime to local; use turbo for orchestration or add runtime setup step.

**Code Example:**

```json
❌ Wrong:   "test": "bun test --test-name-pattern '.*' apps/api"
✅ Correct: "test": "turbo run test"
```

**Solution:**
Either use turbo for orchestration, or add bun setup step in CI:

```yaml
- name: Setup Bun
  uses: oven-sh/setup-bun@v1
```

**Related Bugs:** BUG-011
**Related Coding Principle:** [CI-002: Match Local and CI Environments]

---

### [2026-01-17] BUG-011: CI - Turbo Task Dependencies Triggering Unavailable Commands

**Severity:** High (CI blocked)
**Files Affected:**

- `turbo.json`

**Context:** Running tests through turbo in CI pipeline.

**Mistake:** Test task had `dependsOn: ["^build"]` which triggered builds using unavailable bun command.

**Error Message:**

```
@maiyuri/api#build: command exited (127)
```

**Root Cause:**
Turbo test task had `dependsOn: ["^build"]` which triggered API build using `bun build` (not available in CI).

**Prevention Rule:** Use `turbo run test --dry-run` to review task graph before committing turbo.json changes.

**Code Example:**

```json
❌ Wrong:   "test": { "dependsOn": ["^build"], "env": ["CI"] }
✅ Correct: "test": { "env": ["CI"] }
```

**Solution:**
Remove unnecessary build dependencies for test tasks; Vitest doesn't need build output.

**Related Bugs:** BUG-010
**Related Coding Principle:** [CI-003: Verify Turbo Task Dependencies]

---

### [2026-01-17] BUG-012: CI - lint-staged with Invalid ESLint Flags

**Severity:** Medium (Pre-commit hooks blocked)
**Files Affected:**

- `package.json` (root)

**Context:** Running pre-commit hooks with lint-staged.

**Mistake:** lint-staged used `--max-warnings 0` flag incompatible with ESLint 9 flat config.

**Error Message:**

```
eslint --fix --max-warnings 0 failed
```

**Root Cause:**
lint-staged configuration used `--max-warnings 0` which has issues with ESLint 9 flat config.

**Prevention Rule:** Test `npx lint-staged` manually after config changes; align with lint script flags.

**Code Example:**

```json
❌ Wrong:   "*.{ts,tsx}": ["eslint --fix --max-warnings 0", "prettier --write"]
✅ Correct: "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
```

**Solution:**
Remove incompatible CLI flags; use eslint.config.js for warning configuration.

**Related Bugs:** BUG-009
**Related Coding Principle:** [CI-004: Keep lint-staged in Sync with lint Script]

---

### [2026-01-17] BUG-013: CI - Database Migration Not Applied Before Code Deployment

**Severity:** Critical (Production runtime errors)
**Files Affected:**

- `apps/web/app/api/leads/[id]/route.ts`
- `supabase/migrations/20260117_add_lead_classification_fields.sql`

**Context:** Deploying code that references new database columns.

**Mistake:** Merged PR before applying Supabase migration; code deployed but columns didn't exist.

**Error Message:**

```
Failed to update lead
(Database log: column "classification" does not exist)
```

**Root Cause:**
Code referencing new columns was deployed to Vercel before Supabase migration was applied. Code and database deployments are decoupled.

**Prevention Rule:** Schema-first deployment: always apply database migrations BEFORE merging code that uses new columns.

**Code Example:**

```
❌ Wrong:   Merge PR → Vercel auto-deploys → Migration NOT applied → Errors
✅ Correct: Apply migration → Verify health check → THEN merge PR → Vercel deploys
```

**Solution:**

1. Apply migration to production Supabase FIRST
2. Verify: `curl /api/health | jq '.data.services.schema'`
3. THEN merge PR to trigger Vercel deployment

**Test Case:**

```typescript
async function checkSchema(): Promise<SchemaHealth> {
  const { error } = await supabase
    .from("leads")
    .select(REQUIRED_LEAD_COLUMNS.join(","))
    .limit(1);

  if (error?.message.includes("does not exist")) {
    return { status: "invalid", error: "Missing columns - run migrations" };
  }
  return { status: "valid" };
}
```

**Related Bugs:** None
**Related Coding Principle:** [DEPLOY-001: Always Apply Migrations Before Code Deployment]

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
- [ ] Run `npm run lint` to verify lint config works
- [ ] Verify scripts use npm-compatible commands (not bun-only)

### Before Deploying

- [ ] **Apply database migrations to production Supabase FIRST**
- [ ] Verify schema health: `curl /api/health | jq '.data.services.schema'`
- [ ] Run E2E tests with error tracking
- [ ] Test with empty/incomplete data
- [ ] Verify no console errors
- [ ] Check health endpoint shows `status: "healthy"`

### Before Modifying CI/Build Configuration

- [ ] Test lint script: `npm run lint`
- [ ] Test test script: `npm run test`
- [ ] Verify turbo dependencies: `turbo run test --dry-run`
- [ ] Check ESLint version and config format compatibility
- [ ] Ensure scripts work with npm (not just bun)

---

## How to Add New Bugs

When a bug is found, add it using this template:

```markdown
### [YYYY-MM-DD] BUG-XXX: CATEGORY - Brief Title

**Severity:** Critical/High/Medium/Low
**Files Affected:** [List of files]

**Context:** What were you trying to do?

**Mistake:** What went wrong (in simple terms)?

**Error Message:**
```

[Exact error message]

````

**Root Cause:** Why did this happen?

**Prevention Rule:** One-line axiom to never repeat this.

**Code Example:**
```typescript
❌ Wrong:   [bad code]
✅ Correct: [good code]
````

**Solution:**

```typescript
[Complete fixed code with explanation]
```

**Test Case:**

```typescript
[Test that would catch this bug]
```

**Related Bugs:** BUG-XXX, BUG-XXX
**Related Coding Principle:** [Link to principle]

````

**Categories:**
- `NULL` - Null/undefined safety issues
- `TYPE` - TypeScript type mismatches
- `API` - API response handling
- `ASYNC` - Async/promise issues
- `REACT` - React rendering issues
- `DB` - Database/data issues
- `CI` - CI/build configuration
- `SECURITY` - Security vulnerabilities
- `PERF` - Performance issues

---

## Statistics

| Month | Bugs Found | Bugs Prevented | Prevention Rate |
|-------|-----------|----------------|-----------------|
| Jan 2026 | 14 | 0 | - |
| Feb 2026 | TBD | TBD | TBD |

### Bug Categories (Jan 2026)
- NULL (Null Safety): 2 (BUG-001, BUG-002)
- TYPE (TypeScript): 1 (BUG-003)
- API (Response Handling): 1 (BUG-004)
- REACT (Rendering): 1 (BUG-005)
- DB (Database/Data): 4 (BUG-006, BUG-007, BUG-008, BUG-014)
- CI (Build Configuration): 5 (BUG-009, BUG-010, BUG-011, BUG-012, BUG-013)

### Implementation Patterns (Jan 2026)
- PATTERN-001: Worker-to-API Auto-Trigger Pattern

**Goal:** 95%+ bug prevention rate through proactive coding principles and testing.

---

## 7. Implementation Patterns

### [2026-01-20] PATTERN-001: Worker-to-API Auto-Trigger Pattern

**Category:** Architecture Pattern
**Files Implemented:**
- `workers/call-recording-processor/src/lead-analysis-trigger.ts`
- `workers/call-recording-processor/src/processor.ts`

**Context:** Auto-triggering lead AI analysis when voice recordings complete processing, eliminating manual "Analyze" button clicks.

**Pattern:** Worker calls existing API endpoint via HTTP after processing completion.

**Why This Pattern:**
1. **Code Reuse:** Leverages existing battle-tested `/api/leads/[id]/analyze` endpoint
2. **Separation of Concerns:** Worker handles audio, API handles intelligence
3. **Idempotency:** Analysis endpoint is already idempotent (safe to call multiple times)
4. **Feature Flag:** Easy to enable/disable via `AUTO_TRIGGER_ANALYSIS` env var
5. **Rollback:** Instant disable without code deployment

**Implementation Details:**

```typescript
// 1. Feature Flag Check
const autoTrigger = process.env.AUTO_TRIGGER_ANALYSIS === "true";
if (!autoTrigger) return false;

// 2. Debouncing (prevent duplicate triggers)
const DEBOUNCE_WINDOW_MS = 60000; // 1 minute
if (shouldDebounce(leadId)) return false;

// 3. Non-blocking HTTP Call
triggerLeadAnalysis({ leadId, recordingId }).catch((err) => {
  logError(`Failed to trigger analysis`, err);
  // Don't fail recording processing
});

// 4. Auth with Service Role Key
headers: {
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
}
````

**Anti-Patterns Avoided:**

- ❌ Duplicating analysis logic in worker (code duplication)
- ❌ Blocking recording completion on analysis success (coupling)
- ❌ No feature flag (can't disable without deploy)
- ❌ No debouncing (duplicate analyses on rapid uploads)

**Key Design Decisions:**

| Decision                | Reasoning                                    |
| ----------------------- | -------------------------------------------- |
| Call existing endpoint  | Reuse > rewrite; single source of truth      |
| Non-blocking `.catch()` | Analysis failure shouldn't fail recording    |
| 60s debounce window     | Prevents duplicate triggers on rapid uploads |
| Service role key auth   | Worker is trusted internal service           |
| Feature flag            | Instant rollback without code deploy         |

**Testing Checklist:**

- [ ] Upload voice for existing lead → Analysis triggered automatically
- [ ] Upload voice with no lead match → No analysis triggered
- [ ] Set `AUTO_TRIGGER_ANALYSIS=false` → No analysis triggered
- [ ] Upload 2 recordings quickly for same lead → Second debounced
- [ ] API returns error → Recording still marked completed

**Related Principles:**

- DRY: Reuse existing endpoints over reimplementing
- Feature Flags: Always add for new behaviors
- Non-blocking: Background tasks shouldn't block critical path
- Graceful Degradation: Failures shouldn't cascade

---

### [2026-01-21] BUG-014: DB - Supabase Client Created with Non-Null Assertions

**Severity:** Critical (Production errors - API routes failing silently)
**Files Affected:**

- `apps/web/src/lib/ticket-service.ts`

**Context:** Creating Supabase clients in service files for database operations.

**Mistake:** Created a new Supabase client using non-null assertions (`!`) instead of using the centralized `supabaseAdmin` client.

**Error Message:**

```
supabaseKey is required
```

**Root Cause:**
Service file created its own Supabase client with `!` assertions:

```typescript
createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

When environment variables were undefined, the `!` assertion passed `undefined` to the SDK, causing the error.

**Prevention Rule:** NEVER create Supabase clients with `!` assertions; always use centralized `supabaseAdmin` from `@/lib/supabase`.

**Code Example:**

```typescript
❌ Wrong:
import { createClient } from "@supabase/supabase-js";
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

✅ Correct:
import { supabaseAdmin } from "./supabase";
function getSupabase() {
  return supabaseAdmin;
}
```

**Solution:**

The centralized `supabaseAdmin` in `@/lib/supabase` has proper lazy initialization with null checks:

```typescript
// apps/web/src/lib/supabase.ts - Centralized pattern
let _supabaseAdmin: SupabaseClient | null = null;

export const supabaseAdmin = (() => {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      console.error("Supabase env vars missing");
      // Graceful handling instead of runtime crash
    }

    _supabaseAdmin = createClient(url!, key!);
  }
  return _supabaseAdmin!;
})();
```

**Test Case:**

```typescript
describe("Supabase Client Usage", () => {
  it("should not create clients with non-null assertions", () => {
    const files = glob.sync("apps/web/src/**/*.ts");
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      if (file !== "apps/web/src/lib/supabase.ts") {
        expect(content).not.toMatch(/createClient\([^)]*!/);
      }
    }
  });
});
```

**Related Bugs:** BUG-001, BUG-002
**Related Coding Principle:** [NULL-003: Never Use Non-Null Assertions for Environment Variables]

---

### [2026-01-25] BUG-015: Worker Processing Voice Messages Prematurely

**Severity:** Medium (Data quality issues, poor UX)
**Files Affected:**

- `workers/call-recording-processor/src/index.ts`
- `apps/web/app/api/telegram/webhook/route.ts`

**Context:** Voice messages sent to Telegram bot without phone number in filename.

**Mistake:** Worker processed recordings with `phone_number='PENDING'` before user could provide the actual phone number.

**Symptoms:**

- Transcription notification shows "PENDING" as phone number
- Google Drive file uploaded with "PENDING" in filename
- No lead associated, so AI analysis doesn't auto-populate lead details
- When user provides phone later, recording is linked but not re-processed

**Root Cause:**
Worker query didn't filter out recordings awaiting user input:

```typescript
// ❌ Before: Processes ALL pending recordings including PENDING phone
const { data: recordings } = await supabase
  .from("call_recordings")
  .select("*")
  .in("processing_status", ["pending", "failed"])
  .lt("retry_count", MAX_RETRIES);
```

**Prevention Rule:** When using sentinel values (like 'PENDING') to indicate incomplete data, always filter them out in processing queries.

**Code Example:**

```typescript
// ✅ After: Exclude recordings awaiting user input
const { data: recordings } = await supabase
  .from("call_recordings")
  .select("*")
  .in("processing_status", ["pending", "failed"])
  .neq("phone_number", "PENDING") // Don't process until phone provided
  .lt("retry_count", MAX_RETRIES);
```

**Flow After Fix:**

1. Voice message received → stored with `phone_number='PENDING'`
2. Webhook asks user for phone number
3. Worker skips this recording (filtered by `.neq('phone_number', 'PENDING')`)
4. User provides phone via `PHONE: 9876543210`
5. Recording updated with real phone number
6. Worker picks up recording (now eligible for processing)
7. Full processing with correct data

**Test Case:**

```typescript
describe("Voice Recording Processing", () => {
  it("should NOT process recordings with PENDING phone number", async () => {
    // Insert recording with PENDING phone
    await supabase.from("call_recordings").insert({
      phone_number: "PENDING",
      processing_status: "pending",
    });

    // Run poll cycle
    await pollAndProcess();

    // Verify NOT processed
    const { data } = await supabase
      .from("call_recordings")
      .select("processing_status")
      .single();
    expect(data.processing_status).toBe("pending"); // Still pending
  });
});
```

**Related Issue:** GitHub Issue #35
**Related Bugs:** BUG-014 (Supabase client patterns)

---

_Last Updated: January 25, 2026_
_Maintainers: Development Team_
