# Security Remediation Plan

**Created:** 2026-01-22
**Status:** In Progress
**Based on:** `docs/REVIEW_RECOMMENDATIONS.md`

## Executive Summary

This plan addresses 15 findings from the static code review, prioritized by security impact and business risk.

---

## Phase 1: Critical Security (P0) - IMMEDIATE

### 1.1 API Authentication Middleware

**Problem:** `/api/*` routes allow unauthenticated access
**Risk:** Unauthorized data access/modification
**Files:** `apps/web/middleware.ts`

**Implementation:**

```typescript
// Add to middleware.ts - require auth for /api/* except public endpoints
const PUBLIC_API_ROUTES = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/webhooks/telegram",
];

if (
  pathname.startsWith("/api/") &&
  !PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))
) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

**Checklist:**

- [ ] Update middleware to check auth on `/api/*`
- [ ] Create whitelist for public API endpoints
- [ ] Add `requireAuth()` helper for route handlers
- [ ] Add `requireRole(role)` helper for admin routes
- [ ] Test all API routes with/without auth

---

### 1.2 Split Supabase Clients

**Problem:** Browser and admin clients in same module risks bundling server code
**Risk:** Service role key exposure in client bundle
**Files:** `apps/web/src/lib/supabase.ts`

**Implementation:**

```
apps/web/src/lib/
├── supabase-browser.ts    # Client-side only
├── supabase-admin.ts      # Server-only (with 'server-only' pragma)
└── supabase.ts            # Re-exports for backwards compatibility
```

**supabase-admin.ts:**

```typescript
import "server-only";
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

**Checklist:**

- [ ] Create `supabase-browser.ts` with client-only exports
- [ ] Create `supabase-admin.ts` with `server-only` pragma
- [ ] Update imports across codebase
- [ ] Verify no admin client in client bundle (build analysis)

---

### 1.3 Secure Seed Credentials

**Problem:** Hardcoded passwords in migrations and tests
**Risk:** Known credentials in production
**Files:**

- `supabase/migrations/20260109000001_seed_auth_users.sql`
- `apps/web/tests/*.ts`

**Implementation:**

1. Move seed SQL to `supabase/seeds/` (not run in production)
2. Gate seed migration with environment check
3. Replace hardcoded test credentials with env vars
4. Rotate all affected passwords

**Checklist:**

- [ ] Move seed users to `supabase/seeds/dev_users.sql`
- [ ] Add env check to prevent seed in production
- [ ] Update test files to use `process.env.TEST_USER_*`
- [ ] Add `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` to `.env.example`
- [ ] Rotate `TempPass123!` passwords in all environments
- [ ] Remove `test-credentials.txt` references

---

### 1.4 Role Gates for User Management

**Problem:** User creation/management endpoints lack authorization
**Risk:** Anyone can create admin users
**Files:** `apps/web/app/api/users/route.ts`

**Implementation:**

```typescript
export async function POST(request: NextRequest) {
  const { user, role } = await requireAuth(request);

  // Only founder can create users
  if (role !== "founder") {
    return error("Forbidden: Only founders can create users", 403);
  }

  // ... rest of handler
}
```

**Checklist:**

- [ ] Add `requireAuth()` to all user management routes
- [ ] Require `founder` role for user creation
- [ ] Require `founder` role for role changes
- [ ] Disable bulk seed endpoint in production
- [ ] Add audit logging for user management actions

---

## Phase 2: Correctness & Security (P1)

### 2.1 Fix Enum Validation

**Problem:** Empty string `""` fails validation for optional enums
**Files:** `packages/shared/src/schemas.ts`

**Implementation:**

```typescript
// Helper for optional enums that accept empty string
const optionalEnum = <T extends readonly string[]>(values: T) =>
  z.enum(values)
    .or(z.literal(''))
    .transform(v => v === '' ? null : v)
    .nullable()
    .optional();

// Usage
classification: optionalEnum(['residential', 'commercial', 'industrial', 'government']),
```

**Checklist:**

- [ ] Create `optionalEnum` helper
- [ ] Update `classification` field
- [ ] Update `requirement_type` field
- [ ] Test form submissions with empty selections

---

### 2.2 Production CSP Headers

**Problem:** `unsafe-eval` in production CSP
**Files:** `apps/web/middleware.ts`

**Implementation:**

```typescript
const isDev = process.env.NODE_ENV === "development";

const cspDirectives = {
  "script-src": isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'", // Remove unsafe-eval in prod
  // ... other directives
};
```

**Checklist:**

- [ ] Make CSP environment-aware
- [ ] Remove `unsafe-eval` in production
- [ ] Test production build works without `unsafe-eval`
- [ ] Add nonce-based script loading if needed

---

### 2.3 Lead Search Filter Sanitization

**Problem:** Search input can break Supabase `.or()` queries
**Files:** `apps/web/app/api/leads/route.ts`

**Implementation:**

```typescript
// Escape special characters in search
const sanitizeSearch = (search: string) => search.replace(/[%_\\]/g, "\\$&");

// Use separate .ilike() instead of .or() interpolation
if (filters.search) {
  const safe = sanitizeSearch(filters.search);
  query = query.or(
    `name.ilike.%${safe}%,contact.ilike.%${safe}%,location.ilike.%${safe}%`,
  );
}
```

**Checklist:**

- [ ] Add `sanitizeSearch()` helper
- [ ] Update leads search query
- [ ] Test with special characters (commas, quotes, percent)

---

### 2.4 WhatsApp Phone Normalization

**Problem:** Inconsistent country code handling
**Files:** Multiple components

**Implementation:**

```typescript
// packages/shared/src/utils/phone.ts
export function normalizePhoneE164(
  phone: string,
  defaultCountry = "91",
): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  if (digits.startsWith("0")) return `${defaultCountry}${digits.slice(1)}`;
  return digits;
}

export function getWhatsAppUrl(phone: string): string {
  return `https://wa.me/${normalizePhoneE164(phone)}`;
}
```

**Checklist:**

- [ ] Create phone normalization utility in shared package
- [ ] Update `WhatsAppButton.tsx`
- [ ] Update `leads/page.tsx`
- [ ] Update `dashboard/page.tsx`
- [ ] Test with various phone formats

---

## Phase 3: Maintainability (P2)

### 3.1 Centralize Domain Constants

**Files to create:** `packages/shared/src/constants/leads.ts`

```typescript
export const LEAD_SOURCES = [
  "walk-in",
  "phone",
  "referral",
  "whatsapp",
  "website",
  "other",
] as const;
export const LEAD_CLASSIFICATIONS = [
  "residential",
  "commercial",
  "industrial",
  "government",
] as const;
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  "walk-in": "Walk-in",
  phone: "Phone Call",
  // ...
};
```

**Checklist:**

- [ ] Create constants file
- [ ] Export from shared package
- [ ] Update UI components to use constants
- [ ] Update API validation to use constants

---

### 3.2 Standardize API Route Helpers

**Files to create:** `apps/web/src/lib/api-helpers.ts`

```typescript
export async function requireAuth(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) throw new AuthError("Unauthorized");
  return user;
}

export async function requireRole(request: NextRequest, roles: UserRole[]) {
  const user = await requireAuth(request);
  if (!roles.includes(user.role)) throw new AuthError("Forbidden");
  return user;
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error("API Error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

**Checklist:**

- [ ] Create API helpers module
- [ ] Create `AuthError` class
- [ ] Refactor routes to use helpers
- [ ] Add request logging middleware

---

### 3.3 Lead Stats Aggregation API

**Problem:** Stats calculated from paginated subset
**Files:** Create `apps/web/app/api/leads/stats/route.ts`

```typescript
export async function GET() {
  const { data } = await supabaseAdmin
    .from("leads")
    .select("status, ai_score, created_at, is_archived")
    .eq("is_archived", false);

  return success({
    total: data.length,
    newToday: data.filter((l) => isToday(l.created_at)).length,
    hot: data.filter((l) => (l.ai_score ?? 0) >= 0.8).length,
    byStatus: groupBy(data, "status"),
  });
}
```

**Checklist:**

- [ ] Create stats endpoint
- [ ] Update leads page to fetch stats separately
- [ ] Cache stats with short TTL

---

## Phase 4: DX & Observability (P3)

### 4.1 Typed Environment Variables

**Files to create:** `apps/web/src/lib/env.ts`

```typescript
import { z } from "zod";

const envSchema = z.object({
  // Required
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Optional with defaults
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // AI Services
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

**Checklist:**

- [ ] Create env schema
- [ ] Import at app entry point
- [ ] Update `.env.example` with all vars
- [ ] Add validation error messages

---

### 4.2 Test Credentials Configuration

**Update:** `.env.example`

```bash
# E2E Testing (do not use production credentials)
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=
TEST_BASE_URL=http://localhost:3000
```

**Checklist:**

- [ ] Add test env vars to `.env.example`
- [ ] Update Playwright config to use env vars
- [ ] Update test files to read from env
- [ ] Document in `docs/TESTING.md`

---

## Implementation Order

| Phase | Items                  | Effort | Risk Reduction |
| ----- | ---------------------- | ------ | -------------- |
| 1.1   | API Auth Middleware    | 4h     | Critical       |
| 1.2   | Split Supabase Clients | 2h     | Critical       |
| 1.3   | Secure Credentials     | 3h     | Critical       |
| 1.4   | Role Gates             | 2h     | High           |
| 2.1   | Enum Validation        | 1h     | Medium         |
| 2.2   | CSP Headers            | 1h     | Medium         |
| 2.3   | Search Sanitization    | 1h     | Medium         |
| 2.4   | Phone Normalization    | 2h     | Low            |
| 3.x   | Maintainability        | 4h     | Low            |
| 4.x   | DX Improvements        | 2h     | Low            |

**Total Estimated Effort:** ~22 hours

---

## Success Criteria

- [ ] All API routes require authentication (except whitelist)
- [ ] No service role key in client bundle
- [ ] No hardcoded credentials in codebase
- [ ] User management requires founder role
- [ ] CSP secure in production
- [ ] Search handles special characters
- [ ] All tests pass with env-based credentials

---

## Rollout Plan

1. **Day 1:** Phase 1.1 + 1.2 (Authentication + Supabase split)
2. **Day 2:** Phase 1.3 + 1.4 (Credentials + Role gates)
3. **Day 3:** Phase 2.x (Correctness fixes)
4. **Day 4:** Phase 3.x + 4.x (Maintainability + DX)
5. **Day 5:** Testing + Documentation

---

## References

- Original review: `docs/REVIEW_RECOMMENDATIONS.md`
- Coding principles: `docs/CODING_PRINCIPLES.md`
- Testing guide: `docs/TESTING.md`
