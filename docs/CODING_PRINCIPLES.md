# Coding Principles & Best Practices

**Purpose:** Comprehensive coding standards to prevent bugs and ensure code quality. **Read this before writing any code.**

**Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase

---

## Table of Contents

1. [Null Safety](#1-null-safety-critical)
2. [TypeScript Patterns](#2-typescript-patterns)
3. [React Best Practices](#3-react-best-practices)
4. [API & Data Handling](#4-api--data-handling)
5. [Error Handling](#5-error-handling)
6. [Testing Requirements](#6-testing-requirements)
7. [Performance](#7-performance)
8. [Security](#8-security)

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
const name = user?.profile?.settings?.displayName ?? 'Anonymous';
```

### NULL-003: Nullish Coalescing Over Logical OR

**Rule:** Use `??` instead of `||` for defaults (preserves 0 and '').

```typescript
// ❌ WRONG - 0 and '' become default
const count = data.count || 10;  // 0 becomes 10!
const name = data.name || 'N/A'; // '' becomes 'N/A'!

// ✅ CORRECT - Only null/undefined trigger default
const count = data.count ?? 10;  // 0 stays 0
const name = data.name ?? 'N/A'; // '' stays ''
```

### NULL-004: Safe Array Operations

**Rule:** Always provide default empty arrays before array methods.

```typescript
// ❌ WRONG
items.map(i => i.name)
items.filter(i => i.active)
items.reduce((acc, i) => acc + i.value, 0)

// ✅ CORRECT
(items ?? []).map(i => i.name)
(items ?? []).filter(i => i.active)
(items ?? []).reduce((acc, i) => acc + i.value, 0)
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

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

// apps/web/src/components/LeadCard.tsx
import type { Lead } from '@maiyuri/shared';
```

### TYPE-002: Make Optional Fields Explicit

**Rule:** If a field can be undefined, mark it with `?` or `| null`.

```typescript
// ❌ WRONG - Assumes all fields exist
interface Lead {
  name: string;
  odooQuoteAmount: number;  // Can be null from DB!
}

// ✅ CORRECT - Explicit nullable
interface Lead {
  name: string;
  odooQuoteAmount?: number;  // Optional
  odooOrderId: string | null;  // Explicit null
}
```

### TYPE-003: Use Zod for Runtime Validation

**Rule:** Validate external data (API responses, user input) with Zod.

```typescript
import { z } from 'zod';

// Define schema
const LeadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().regex(/^\+91\d{10}$/),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']),
  odooQuoteAmount: z.number().nullable().optional(),
});

// Validate
const result = LeadSchema.safeParse(apiResponse);
if (!result.success) {
  console.error('Invalid lead data', result.error);
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
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'name' in data
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
  prefix = '',
  suffix = '',
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
import { z } from 'zod';

export async function fetchWithValidation<T>(
  url: string,
  schema: z.ZodSchema<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  const json = await response.json();
  const result = schema.safeParse(json);

  if (!result.success) {
    console.error('API validation failed:', result.error);
    throw new ValidationError(result.error);
  }

  return result.data;
}

// Usage
const leads = await fetchWithValidation('/api/leads', LeadsResponseSchema);
```

### API-002: Default Values in API Responses

**Rule:** API routes should always return consistent shapes.

```typescript
// app/api/leads/route.ts
export async function GET() {
  try {
    const leads = await db.query.leads.findMany();

    return NextResponse.json({
      data: leads ?? [],  // Never return undefined
      meta: {
        total: leads?.length ?? 0,
        page: 1,
      },
    });
  } catch (error) {
    return NextResponse.json({
      data: [],  // Return empty array, not error
      meta: { total: 0, page: 1 },
      error: { message: 'Failed to fetch leads' },
    }, { status: 500 });
  }
}
```

### API-003: Handle Network Failures Gracefully

**Rule:** Always handle fetch failures.

```typescript
async function fetchLeads() {
  try {
    const response = await fetch('/api/leads');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch leads:', error);
    return { data: [], error: true };
  }
}
```

---

## 5. Error Handling

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
  console.error('Operation failed:', error);
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
  console.error('Lead submission failed:', {
    error,
    data,
    timestamp: new Date().toISOString(),
  });

  // Show user-friendly message
  toast.error('Unable to save. Please try again.');
}
```

---

## 6. Testing Requirements

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
import { trackErrors } from '../helpers/error-tracker';

test('should load page without errors', async ({ page }) => {
  const errors = await trackErrors(page);

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  expect(errors, 'No runtime errors allowed').toEqual([]);
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

## 7. Performance

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

## 8. Security

### SEC-001: Never Trust Client Input

```typescript
// Always validate on server
export async function POST(req: Request) {
  const body = await req.json();

  // Validate with Zod
  const result = CreateLeadSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Use validated data
  const lead = await createLead(result.data);
}
```

### SEC-002: Sanitize User Content

```typescript
import DOMPurify from 'dompurify';

// Before rendering user content
const sanitized = DOMPurify.sanitize(userContent);
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

*Last Updated: January 17, 2026*
*Version: 1.0*
