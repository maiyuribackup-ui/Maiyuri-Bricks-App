# Coding Principles & Best Practices

**Purpose:** Comprehensive coding standards to prevent bugs and ensure code quality. **Read this before writing any code.**

**Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase

---

## Table of Contents

1. [Null Safety](#1-null-safety-critical)
2. [TypeScript Patterns](#2-typescript-patterns)
3. [React Best Practices](#3-react-best-practices)
4. [API & Data Handling](#4-api--data-handling)
5. [Async/Promise Safety](#5-asyncpromise-safety)
6. [Input Validation](#6-input-validation)
7. [Error Handling](#7-error-handling)
8. [Testing Requirements](#8-testing-requirements)
9. [Performance](#9-performance)
10. [Security](#10-security)
11. [Naming Conventions](#11-naming-conventions)
12. [Function Design](#12-function-design)
13. [Comment Philosophy](#13-comment-philosophy)

---

## 1. Null Safety (CRITICAL)

**These rules are NON-NEGOTIABLE. Violations cause production crashes.**

### NULL-001: Always Handle Null/Undefined

**Rule:** Never call methods on potentially nullable values without default.

```typescript
// ❌ WRONG - Will crash if value is null/undefined
value.toLocaleString()
array.map(...)
string.toLowerCase()

// ✅ CORRECT - Safe with defaults
(value ?? 0).toLocaleString()
(array ?? []).map(...)
(string ?? '').toLowerCase()
```

### NULL-002: Optional Chaining for Nested Access

**Rule:** Always use `?.` when accessing nested properties.

```typescript
// ❌ WRONG - Crashes if any level is undefined
const name = user.profile.settings.displayName;

// ✅ CORRECT - Safe access with default
const name = user?.profile?.settings?.displayName ?? "Anonymous";
```

### NULL-003: Nullish Coalescing Over Logical OR

**Rule:** Use `??` instead of `||` for defaults (preserves 0 and '').

```typescript
// ❌ WRONG - 0 and '' become default
const count = data.count || 10; // 0 becomes 10!
const name = data.name || "N/A"; // '' becomes 'N/A'!

// ✅ CORRECT - Only null/undefined trigger default
const count = data.count ?? 10; // 0 stays 0
const name = data.name ?? "N/A"; // '' stays ''
```

### NULL-004: Safe Array Operations

**Rule:** Always provide default empty arrays before array methods.

```typescript
// ❌ WRONG
items.map((i) => i.name);
items.filter((i) => i.active);
items
  .reduce(
    (acc, i) => acc + i.value,
    0,
  )(
    // ✅ CORRECT
    items ?? [],
  )
  .map((i) => i.name)(items ?? [])
  .filter((i) => i.active)(items ?? [])
  .reduce((acc, i) => acc + i.value, 0);
```

### NULL-005: Helper Functions for Formatting

**Rule:** Create safe helper functions for common operations.

```typescript
// utils/format.ts
export const formatCurrency = (value: number | null | undefined): string => {
  return `₹${(value ?? 0).toLocaleString('en-IN')}`;
};

export const formatNumber = (value: number | null | undefined): string => {
  return (value ?? 0).toLocaleString();
};

export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN');
};

// Usage in component
<span>{formatCurrency(lead.amount)}</span>
<span>{formatNumber(product.quantity)}</span>
<span>{formatDate(order.createdAt)}</span>
```

---

## 2. TypeScript Patterns

### TYPE-001: Single Source of Truth for Types

**Rule:** Define types once in `packages/shared/src/types/`, import everywhere.

```typescript
// packages/shared/src/types/lead.ts
export interface Lead {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  odoo?: OdooData;
  createdAt: Date;
}

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "lost";

// apps/web/src/components/LeadCard.tsx
import type { Lead } from "@maiyuri/shared";
```

### TYPE-002: Make Optional Fields Explicit

**Rule:** If a field can be undefined, mark it with `?` or `| null`.

```typescript
// ❌ WRONG - Assumes all fields exist
interface Lead {
  name: string;
  odooQuoteAmount: number; // Can be null from DB!
}

// ✅ CORRECT - Explicit nullable
interface Lead {
  name: string;
  odooQuoteAmount?: number; // Optional
  odooOrderId: string | null; // Explicit null
}
```

### TYPE-003: Use Zod for Runtime Validation

**Rule:** Validate external data (API responses, user input) with Zod.

```typescript
import { z } from "zod";

// Define schema
const LeadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().regex(/^\+91\d{10}$/),
  status: z.enum(["new", "contacted", "qualified", "converted", "lost"]),
  odooQuoteAmount: z.number().nullable().optional(),
});

// Validate
const result = LeadSchema.safeParse(apiResponse);
if (!result.success) {
  console.error("Invalid lead data", result.error);
  return null;
}
const lead = result.data; // Type-safe!
```

### TYPE-004: Avoid Type Assertions

**Rule:** Prefer type guards over type assertions (`as`).

```typescript
// ❌ WRONG - Unsafe assertion
const lead = data as Lead;

// ✅ CORRECT - Type guard
function isLead(data: unknown): data is Lead {
  return (
    typeof data === "object" && data !== null && "id" in data && "name" in data
  );
}

if (isLead(data)) {
  // data is now typed as Lead
}
```

---

## 3. React Best Practices

### REACT-001: Safe Conditional Rendering

**Rule:** Check the exact value being rendered, not just the parent.

```typescript
// ❌ WRONG - Only checks lead exists
{lead && <span>{lead.odoo.amount.toLocaleString()}</span>}

// ✅ CORRECT - Check exact value
{lead?.odoo?.amount != null && (
  <span>{lead.odoo.amount.toLocaleString()}</span>
)}

// ✅ BETTER - Use SafeRender component
<SafeRender value={lead?.odoo?.amount}>
  {(amount) => <span>{amount.toLocaleString()}</span>}
</SafeRender>
```

### REACT-002: Error Boundaries for Every Major Section

**Rule:** Wrap major UI sections with error boundaries.

```typescript
// components/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 bg-red-50 text-red-600 rounded">
          Something went wrong. Please refresh.
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage in layout
<ErrorBoundary fallback={<DashboardError />}>
  <Dashboard />
</ErrorBoundary>
```

### REACT-003: Loading and Error States

**Rule:** Every data-fetching component must handle loading, error, and empty states.

```typescript
function LeadsList() {
  const { data, isLoading, error } = useLeads();

  // Loading state
  if (isLoading) {
    return <LeadsListSkeleton />;
  }

  // Error state
  if (error) {
    return <ErrorMessage error={error} retry={refetch} />;
  }

  // Empty state
  if (!data?.length) {
    return <EmptyState message="No leads found" action={<AddLeadButton />} />;
  }

  // Success state
  return <LeadsGrid leads={data} />;
}
```

### REACT-004: Component Props Default Values

**Rule:** Provide sensible defaults for optional props.

```typescript
interface KPICardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  loading?: boolean;
}

function KPICard({
  title,
  value,
  prefix = "",
  suffix = "",
  loading = false,
}: KPICardProps) {
  // props always have values
}
```

---

## 4. API & Data Handling

### API-001: Validate All API Responses

**Rule:** Never trust external data. Always validate.

```typescript
// lib/api.ts
import { z } from "zod";

export async function fetchWithValidation<T>(
  url: string,
  schema: z.ZodSchema<T>,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  const json = await response.json();
  const result = schema.safeParse(json);

  if (!result.success) {
    console.error("API validation failed:", result.error);
    throw new ValidationError(result.error);
  }

  return result.data;
}

// Usage
const leads = await fetchWithValidation("/api/leads", LeadsResponseSchema);
```

### API-002: Default Values in API Responses

**Rule:** API routes should always return consistent shapes.

```typescript
// app/api/leads/route.ts
export async function GET() {
  try {
    const leads = await db.query.leads.findMany();

    return NextResponse.json({
      data: leads ?? [], // Never return undefined
      meta: {
        total: leads?.length ?? 0,
        page: 1,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        data: [], // Return empty array, not error
        meta: { total: 0, page: 1 },
        error: { message: "Failed to fetch leads" },
      },
      { status: 500 },
    );
  }
}
```

### API-003: Handle Network Failures Gracefully

**Rule:** Always handle fetch failures.

```typescript
async function fetchLeads() {
  try {
    const response = await fetch("/api/leads");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch leads:", error);
    return { data: [], error: true };
  }
}
```

---

## 5. Async/Promise Safety

**Handle async operations safely to prevent silent failures and race conditions.**

### ASYNC-001: Always Handle Both Success AND Failure Paths

**Rule:** Every async operation must handle both outcomes.

```typescript
// ❌ WRONG - Fire and forget
async function saveData() {
  await supabase.from("leads").insert(data);
  // What if it fails?
}

// ❌ WRONG - Only success path
const { data } = await supabase.from("leads").insert(data);
console.log("Saved:", data);

// ✅ CORRECT - Both paths handled
const { data, error } = await supabase.from("leads").insert(data);
if (error) {
  console.error("Save failed:", error);
  throw new DatabaseError("Failed to save lead");
}
console.log("Saved:", data);
```

### ASYNC-002: Set Explicit Timeouts

**Rule:** Never use default timeouts for external calls.

```typescript
// ❌ WRONG - No timeout (could hang forever)
const response = await fetch(externalUrl);

// ✅ CORRECT - Explicit timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30s

try {
  const response = await fetch(externalUrl, {
    signal: controller.signal,
  });
  return await response.json();
} finally {
  clearTimeout(timeout);
}

// ✅ BETTER - Reusable helper
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
```

### ASYNC-003: Implement Retry with Exponential Backoff

**Rule:** Retry transient failures with increasing delays.

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-transient errors
      if (!isTransientError(error)) {
        throw lastError;
      }

      // Wait with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("ECONNRESET") ||
      error.message.includes("503")
    );
  }
  return false;
}
```

### ASYNC-004: Cancel Pending Operations

**Rule:** Clean up async operations when no longer needed.

```typescript
// ❌ WRONG - No cleanup
useEffect(() => {
  fetchData().then(setData);
}, []);

// ✅ CORRECT - Proper cleanup
useEffect(() => {
  const controller = new AbortController();

  async function loadData() {
    try {
      const response = await fetch("/api/data", {
        signal: controller.signal,
      });
      const data = await response.json();
      setData(data);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return; // Intentionally cancelled
      }
      setError(error);
    }
  }

  loadData();

  return () => controller.abort();
}, []);
```

### ASYNC-005: Use Promise.all with Proper Error Handling

**Rule:** Handle errors in parallel operations correctly.

```typescript
// ❌ WRONG - One failure loses all results
const [leads, quotes, notes] = await Promise.all([
  fetchLeads(),
  fetchQuotes(), // If this fails, leads/notes results are lost
  fetchNotes(),
]);

// ✅ CORRECT - Handle partial failures
const results = await Promise.allSettled([
  fetchLeads(),
  fetchQuotes(),
  fetchNotes(),
]);

const leads = results[0].status === "fulfilled" ? results[0].value : [];
const quotes = results[1].status === "fulfilled" ? results[1].value : [];
const notes = results[2].status === "fulfilled" ? results[2].value : [];

// Log failures
results.forEach((result, i) => {
  if (result.status === "rejected") {
    console.error(`Fetch ${i} failed:`, result.reason);
  }
});
```

---

## 6. Input Validation

**Validate all external inputs at system boundaries.**

### VAL-001: Validate at System Boundaries

**Rule:** All external data must be validated where it enters the system.

```typescript
// API endpoint boundary
export async function POST(req: Request) {
  const body = await req.json();

  // Validate immediately
  const result = CreateLeadSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        error: "Invalid input",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  // Use validated data
  const lead = await createLead(result.data);
  return Response.json(lead, { status: 201 });
}
```

### VAL-002: Check Type, Format, Range, and Length

**Rule:** Validate all aspects of input data.

```typescript
import { z } from "zod";

const LeadInputSchema = z.object({
  // Type validation
  name: z.string(),

  // Format validation
  phone: z.string().regex(/^\+91\d{10}$/, "Invalid Indian phone number"),
  email: z.string().email().optional(),

  // Range validation
  expectedValue: z.number().min(0).max(10000000),
  priority: z.number().int().min(1).max(5),

  // Length validation
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(10),
});
```

### VAL-003: Use Allowlists Over Denylists

**Rule:** Specify what IS allowed, not what isn't.

```typescript
// ❌ WRONG - Denylist (can miss dangerous values)
const sanitized = input.replace(/<script>/g, "");

// ✅ CORRECT - Allowlist (only permit known-safe values)
const STATUS_VALUES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
] as const;
const StatusSchema = z.enum(STATUS_VALUES);

// For complex content, use allowlist-based sanitizer
import DOMPurify from "dompurify";
const sanitized = DOMPurify.sanitize(userHtml, {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p"],
  ALLOWED_ATTR: ["href"],
});
```

### VAL-004: Validate Early, Fail Fast

**Rule:** Return specific error messages immediately.

```typescript
// ❌ WRONG - Validation scattered throughout
async function createLead(data: unknown) {
  const lead = data as Lead;
  await db.insert(lead); // Might fail with cryptic DB error
}

// ✅ CORRECT - Validate at entry, fail fast
async function createLead(data: unknown) {
  // Validate immediately
  const result = LeadSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Invalid lead data", {
      errors: result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // Safe to use validated data
  return db.insert(result.data);
}
```

### VAL-005: Never Trust Database Format

**Rule:** Validate data even from your own database.

```typescript
// ❌ WRONG - Assumes DB data is always valid
const { data } = await supabase.from("leads").select();
return data.map((lead) => lead.odoo_data.quotes[0].amount); // Crash!

// ✅ CORRECT - Defensive access even for DB data
const { data } = await supabase.from("leads").select();
return (data ?? []).map((lead) => {
  const amount = lead?.odoo_data?.quotes?.[0]?.amount;
  return amount ?? 0;
});

// ✅ BEST - Validate DB responses too
const { data } = await supabase.from("leads").select();
const validated = z.array(LeadSchema).safeParse(data);
if (!validated.success) {
  console.error("DB data invalid:", validated.error);
  return [];
}
return validated.data;
```

---

## 7. Error Handling

### ERR-001: Never Swallow Errors Silently

**Rule:** Always log errors, even if recovering gracefully.

```typescript
// ❌ WRONG - Error silently swallowed
try {
  await riskyOperation();
} catch (e) {
  // nothing
}

// ✅ CORRECT - Error logged
try {
  await riskyOperation();
} catch (error) {
  console.error("Operation failed:", error);
  // Handle gracefully
}
```

### ERR-002: User-Friendly Error Messages

**Rule:** Show user-friendly messages, log technical details.

```typescript
try {
  await submitLead(data);
} catch (error) {
  // Log technical details
  console.error("Lead submission failed:", {
    error,
    data,
    timestamp: new Date().toISOString(),
  });

  // Show user-friendly message
  toast.error("Unable to save. Please try again.");
}
```

---

## 8. Testing Requirements

### TEST-001: Test Null/Undefined Edge Cases

**Rule:** Every component must have null safety tests.

```typescript
describe('KPICard', () => {
  it('should handle undefined value', () => {
    expect(() => render(<KPICard title="Test" value={undefined as any} />))
      .not.toThrow();
  });

  it('should handle null value', () => {
    expect(() => render(<KPICard title="Test" value={null as any} />))
      .not.toThrow();
  });

  it('should handle zero value', () => {
    render(<KPICard title="Test" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
```

### TEST-002: E2E Tests Must Track Runtime Errors

**Rule:** All E2E tests must use error tracking.

```typescript
import { trackErrors } from "../helpers/error-tracker";

test("should load page without errors", async ({ page }) => {
  const errors = await trackErrors(page);

  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  expect(errors, "No runtime errors allowed").toEqual([]);
});
```

### TEST-003: Test with Empty/Incomplete Data

**Rule:** Test components with various data states.

```typescript
describe('LeadsList', () => {
  it('renders with full data', () => {
    render(<LeadsList leads={fullLeads} />);
  });

  it('renders with empty array', () => {
    render(<LeadsList leads={[]} />);
    expect(screen.getByText(/no leads/i)).toBeInTheDocument();
  });

  it('renders with partial data', () => {
    const partialLeads = [{ id: '1', name: 'Test' }]; // Missing fields
    expect(() => render(<LeadsList leads={partialLeads} />)).not.toThrow();
  });
});
```

---

## 9. Performance

### PERF-001: Memoize Expensive Calculations

```typescript
// ❌ WRONG - Recalculates every render
function Dashboard({ leads }) {
  const stats = calculateStats(leads); // Expensive
  return <StatsDisplay stats={stats} />;
}

// ✅ CORRECT - Memoized
function Dashboard({ leads }) {
  const stats = useMemo(() => calculateStats(leads), [leads]);
  return <StatsDisplay stats={stats} />;
}
```

### PERF-002: Lazy Load Heavy Components

```typescript
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});
```

---

## 10. Security

### SEC-001: Never Trust Client Input

```typescript
// Always validate on server
export async function POST(req: Request) {
  const body = await req.json();

  // Validate with Zod
  const result = CreateLeadSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Use validated data
  const lead = await createLead(result.data);
}
```

### SEC-002: Sanitize User Content

```typescript
import DOMPurify from "dompurify";

// Before rendering user content
const sanitized = DOMPurify.sanitize(userContent);
```

---

## 11. Naming Conventions

**Clear naming is the best documentation. Names should reveal intent.**

### NAME-001: Variable Names Describe Content

**Rule:** Names describe what the variable holds, not how it's used.

```typescript
// ❌ WRONG - Vague or technical names
const temp = user.email;
const data = await fetchLeads();
const result = calculateTotal();
const item = leads[0];
const info = getLeadDetails(id);
const val = lead.amount;

// ✅ CORRECT - Descriptive names
const userEmail = user.email;
const allLeads = await fetchLeads();
const totalAmount = calculateTotal();
const firstLead = leads[0];
const leadDetails = getLeadDetails(id);
const quoteAmount = lead.amount;
```

### NAME-002: Function Names Use Verbs

**Rule:** Functions describe actions with clear verbs.

```typescript
// ❌ WRONG - Vague or noun-based names
function process(data) { }
function handle(event) { }
function do(action) { }
function manage(leads) { }
function leadData(id) { }

// ✅ CORRECT - Verb-based names
function validateUserInput(data) { }
function handleFormSubmit(event) { }
function sendWelcomeEmail(user) { }
function calculateTotalPrice(items) { }
function fetchLeadById(id) { }
function updateLeadStatus(id, status) { }
function deleteExpiredSessions() { }
```

### NAME-003: Boolean Names Use Prefixes

**Rule:** Booleans use is/has/should/can/will prefixes.

```typescript
// ❌ WRONG - Ambiguous boolean names
const active = user.status === "active";
const visible = element.style.display !== "none";
const permission = user.role === "admin";
const loading = state.loading;

// ✅ CORRECT - Clear boolean prefixes
const isActive = user.status === "active";
const isVisible = element.style.display !== "none";
const hasPermission = user.role === "admin";
const isLoading = state.loading;
const shouldRetry = attempts < maxAttempts;
const canEdit = isOwner || isAdmin;
const willExpireSoon = daysUntilExpiry < 7;
```

### NAME-004: Constants Use SCREAMING_SNAKE_CASE

**Rule:** Constants are uppercase with descriptive names.

```typescript
// ❌ WRONG - Vague or lowercase constants
const max = 100;
const LIMIT = 50;
const DEFAULT = 10;
const NUM = 5;
const TIMEOUT = 30000;

// ✅ CORRECT - Descriptive constant names
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_PAGE_SIZE = 20;
const API_TIMEOUT_MS = 30000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const LEAD_STATUS_NEW = "new";
```

### NAME-005: Files Match Main Export

**Rule:** File names reflect their primary export.

```
// ❌ WRONG - Generic file names
utils.ts
helpers.ts
stuff.ts
functions.ts
data.ts

// ✅ CORRECT - Specific file names
userValidation.ts      → exports validateUser, UserSchema
emailService.ts        → exports sendEmail, EmailService
leadCalculations.ts    → exports calculateLeadScore
odooClient.ts          → exports OdooClient
formatters.ts          → exports formatCurrency, formatDate
```

---

## 12. Function Design

**Functions should do one thing well and be easy to test.**

### FUNC-001: Single Responsibility

**Rule:** One function = one task.

```typescript
// ❌ WRONG - Multiple responsibilities
async function processLead(data: LeadInput) {
  // Validates
  if (!data.name) throw new Error("Name required");
  if (!data.phone) throw new Error("Phone required");

  // Creates
  const lead = await db.leads.insert(data);

  // Sends notification
  await sendEmail(lead.email, "Welcome!");

  // Syncs to external system
  await odoo.createLead(lead);

  return lead;
}

// ✅ CORRECT - Separated responsibilities
async function validateLeadInput(data: LeadInput) {
  const result = LeadInputSchema.safeParse(data);
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
}

async function createLead(data: ValidatedLeadInput) {
  return db.leads.insert(data);
}

async function notifyNewLead(lead: Lead) {
  await sendEmail(lead.email, "Welcome!");
}

async function syncLeadToOdoo(lead: Lead) {
  await odoo.createLead(lead);
}

// Orchestrator
async function processNewLead(data: LeadInput) {
  const validated = await validateLeadInput(data);
  const lead = await createLead(validated);

  // Non-blocking side effects
  notifyNewLead(lead).catch(console.error);
  syncLeadToOdoo(lead).catch(console.error);

  return lead;
}
```

### FUNC-002: Keep Functions Short

**Rule:** Max 30 lines per function (usually).

```typescript
// If a function exceeds 30 lines, look for:
// - Multiple responsibilities to extract
// - Complex conditions to simplify
// - Repeated patterns to abstract

// Signs a function is too long:
// - Multiple levels of nesting
// - Many local variables
// - Comments explaining sections
// - Scrolling needed to see the whole function
```

### FUNC-003: Limit Parameters

**Rule:** Max 3-4 parameters. Use objects for more.

```typescript
// ❌ WRONG - Too many parameters
function createLead(
  name: string,
  phone: string,
  email: string,
  status: string,
  assignedTo: string,
  priority: number,
  notes: string,
) {}

// ✅ CORRECT - Parameter object
interface CreateLeadParams {
  name: string;
  phone: string;
  email?: string;
  status?: LeadStatus;
  assignedTo?: string;
  priority?: number;
  notes?: string;
}

function createLead(params: CreateLeadParams) {
  const {
    name,
    phone,
    email,
    status = "new",
    assignedTo,
    priority = 3,
    notes,
  } = params;
  // ...
}
```

### FUNC-004: Use Early Returns

**Rule:** Handle edge cases first with guard clauses.

```typescript
// ❌ WRONG - Nested conditions
function calculateDiscount(lead: Lead) {
  let discount = 0;

  if (lead) {
    if (lead.isVip) {
      if (lead.orderCount > 10) {
        discount = 0.2;
      } else {
        discount = 0.1;
      }
    } else {
      if (lead.orderCount > 5) {
        discount = 0.05;
      }
    }
  }

  return discount;
}

// ✅ CORRECT - Early returns
function calculateDiscount(lead: Lead | null): number {
  if (!lead) return 0;

  if (lead.isVip && lead.orderCount > 10) return 0.2;
  if (lead.isVip) return 0.1;
  if (lead.orderCount > 5) return 0.05;

  return 0;
}
```

### FUNC-005: Avoid Boolean Parameters

**Rule:** Use objects or enums instead of boolean flags.

```typescript
// ❌ WRONG - Boolean parameter (what does true mean?)
function fetchLeads(includeArchived: boolean) {}
fetchLeads(true); // ??? Unclear

// ✅ CORRECT - Named parameter
function fetchLeads(options: { includeArchived?: boolean }) {}
fetchLeads({ includeArchived: true }); // Clear!

// ✅ BETTER - Enum for multiple options
type LeadFilter = "active" | "archived" | "all";
function fetchLeads(filter: LeadFilter) {}
fetchLeads("all"); // Crystal clear
```

---

## 13. Comment Philosophy

**Good code is self-documenting. Comments explain WHY, not WHAT.**

### COMMENT-001: Comment the WHY

**Rule:** Explain business logic, decisions, and workarounds.

```typescript
// ✅ GOOD - Explains WHY
// Use 18% GST rate for construction materials per Indian tax code 2024
const gstRate = 0.18;

// Odoo API has a 100 record limit per request, need pagination
const BATCH_SIZE = 100;

// Legacy system uses 1-based month index, adjust for JavaScript's 0-based
const month = odooMonth - 1;

// Customer requested quotes be rounded to nearest 100 for cleaner presentation
const roundedQuote = Math.round(quote / 100) * 100;
```

### COMMENT-002: Don't Comment the WHAT

**Rule:** If you need to explain what code does, improve the code instead.

```typescript
// ❌ WRONG - Comments explain obvious code
// Increment counter by 1
counter++;

// Check if user is logged in
if (user.isLoggedIn) {
}

// Loop through all leads
for (const lead of leads) {
}

// Return the result
return result;

// ✅ CORRECT - Self-explanatory code, no comments needed
counter++;
if (user.isLoggedIn) {
}
for (const lead of leads) {
}
return result;
```

### COMMENT-003: Never Leave Commented-Out Code

**Rule:** Delete unused code. That's what git is for.

```typescript
// ❌ WRONG - Commented-out code
function calculateTotal(items) {
  // const oldTotal = items.reduce((a, b) => a + b.price, 0);
  // return oldTotal * 1.1;

  // New calculation method
  return items.reduce((total, item) => {
    // return total + item.price * item.quantity;
    return total + (item.price ?? 0) * (item.quantity ?? 1);
  }, 0);
}

// ✅ CORRECT - Clean code, history in git
function calculateTotal(items) {
  return items.reduce((total, item) => {
    return total + (item.price ?? 0) * (item.quantity ?? 1);
  }, 0);
}
```

### COMMENT-004: TODO Format

**Rule:** TODOs must have ticket references.

```typescript
// ❌ WRONG - TODOs without context
// TODO: Fix this later
// TODO: Refactor
// FIXME: Hack

// ✅ CORRECT - TODOs with tickets
// TODO(MB-123): Add retry logic for Odoo sync failures
// FIXME(MB-456): Temporary workaround until Odoo API v2 released
// HACK(MB-789): Remove after migrating legacy data

// Format: TODO(TICKET): Brief description
```

### COMMENT-005: Document Public APIs

**Rule:** Public functions and types need JSDoc comments.

```typescript
/**
 * Creates a new lead in the system.
 *
 * @param data - Lead creation data
 * @returns The created lead with generated ID
 * @throws ValidationError if input is invalid
 * @throws DatabaseError if save fails
 *
 * @example
 * const lead = await createLead({
 *   name: 'John Doe',
 *   phone: '+919876543210'
 * });
 */
export async function createLead(data: CreateLeadInput): Promise<Lead> {
  // ...
}

/**
 * Lead status in the sales pipeline.
 * - `new`: Just created, not yet contacted
 * - `contacted`: Initial contact made
 * - `qualified`: Budget and timeline confirmed
 * - `converted`: Sale completed
 * - `lost`: Opportunity lost
 */
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "lost";
```

---

## Quick Reference Card

### Before Writing Code

- [ ] Read relevant sections of this document
- [ ] Check LEARNINGS.md for similar bugs

### While Coding

- [ ] Use `?.` for all nested access
- [ ] Use `??` for all defaults
- [ ] Add null/undefined tests
- [ ] Handle loading/error/empty states

### Before Committing

- [ ] Run `bun typecheck`
- [ ] Run `bun lint`
- [ ] Run `bun test`
- [ ] No `@ts-ignore` or `any` types

### Code Review Checklist

- [ ] All potentially nullable values have defaults
- [ ] API responses are validated
- [ ] Error states are handled
- [ ] Tests cover edge cases

---

_Last Updated: January 17, 2026_
_Version: 1.0_
