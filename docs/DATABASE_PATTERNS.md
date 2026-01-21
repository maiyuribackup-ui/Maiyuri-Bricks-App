# Database Patterns & SQL Safety

**Purpose:** Database best practices and SQL safety standards for Supabase/PostgreSQL. Follow these to prevent SQL injection, performance issues, and data corruption.

**Related Documents:**

- [CODING_PRINCIPLES.md](./CODING_PRINCIPLES.md) - Code quality standards
- [LEARNINGS.md](./LEARNINGS.md) - Bug registry including DB bugs

---

## Table of Contents

1. [Query Safety](#1-query-safety)
2. [Transaction Handling](#2-transaction-handling)
3. [Performance Patterns](#3-performance-patterns)
4. [Supabase Specific](#4-supabase-specific)
5. [Migration Standards](#5-migration-standards)
6. [Common Anti-Patterns](#6-common-anti-patterns)

---

## 1. Query Safety

### DB-001: Always Use Parameterized Queries

**Rule:** NEVER concatenate user input into SQL strings.

```typescript
// ❌ CRITICAL SECURITY VULNERABILITY - SQL Injection
const { data } = await supabase
  .from("leads")
  .select()
  .filter("name", "eq", `'${userInput}'`); // DANGER!

// ❌ WRONG - String concatenation
const query = `SELECT * FROM leads WHERE name = '${userInput}'`;

// ✅ CORRECT - Supabase client uses parameterized queries
const { data } = await supabase.from("leads").select().eq("name", userInput); // Safe - parameterized internally

// ✅ CORRECT - RPC with parameters
const { data } = await supabase.rpc("search_leads", {
  search_name: userInput, // Safe - parameterized
});
```

### DB-002: Validate Input Before Queries

**Rule:** Validate data types and formats before database operations.

```typescript
import { z } from "zod";

const SearchSchema = z.object({
  name: z.string().min(1).max(100),
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().default(0),
});

export async function searchLeads(params: unknown) {
  // Validate first
  const result = SearchSchema.safeParse(params);
  if (!result.success) {
    throw new ValidationError(result.error);
  }

  const { name, limit, offset } = result.data;

  // Safe to query
  return supabase
    .from("leads")
    .select()
    .ilike("name", `%${name}%`)
    .range(offset, offset + limit - 1);
}
```

### DB-003: Select Only Required Columns

**Rule:** Never use `SELECT *` in production code.

```typescript
// ❌ WRONG - Fetches all columns including large text fields
const { data } = await supabase.from("leads").select("*");

// ✅ CORRECT - Only required columns
const { data } = await supabase
  .from("leads")
  .select("id, name, phone, status, created_at");

// ✅ CORRECT - With relationships
const { data } = await supabase.from("leads").select(`
    id,
    name,
    phone,
    notes (
      id,
      content,
      created_at
    )
  `);
```

### DB-004: Always Use LIMIT

**Rule:** Never run unbounded queries.

```typescript
// ❌ WRONG - Could return millions of rows
const { data } = await supabase.from("leads").select();

// ✅ CORRECT - Bounded query
const { data } = await supabase.from("leads").select().limit(100);

// ✅ CORRECT - With pagination
const { data } = await supabase
  .from("leads")
  .select()
  .range(offset, offset + pageSize - 1);
```

### DB-005: Set Query Timeouts

**Rule:** Configure timeouts for long-running queries.

```typescript
// In Supabase client configuration
const supabase = createClient(url, key, {
  db: {
    schema: "public",
  },
  global: {
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
    },
  },
});

// For specific queries that may take longer
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60000); // 60 seconds

try {
  const { data } = await supabase
    .from("large_table")
    .select()
    .abortSignal(controller.signal);
} finally {
  clearTimeout(timeout);
}
```

---

## 2. Transaction Handling

### DB-006: Use Transactions for Multi-Step Operations

**Rule:** Wrap related operations in transactions.

```typescript
// ❌ WRONG - Partial failure possible
async function createLeadWithNotes(leadData: Lead, notes: Note[]) {
  const { data: lead } = await supabase
    .from("leads")
    .insert(leadData)
    .select()
    .single();
  // If this fails, lead is orphaned without notes
  await supabase
    .from("notes")
    .insert(notes.map((n) => ({ ...n, lead_id: lead.id })));
}

// ✅ CORRECT - Transaction via RPC
// First, create database function:
/*
CREATE OR REPLACE FUNCTION create_lead_with_notes(
  lead_data jsonb,
  notes_data jsonb[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  new_lead jsonb;
  note jsonb;
BEGIN
  INSERT INTO leads (name, phone, email)
  SELECT lead_data->>'name', lead_data->>'phone', lead_data->>'email'
  RETURNING to_jsonb(leads.*) INTO new_lead;

  FOREACH note IN ARRAY notes_data LOOP
    INSERT INTO notes (lead_id, content)
    VALUES ((new_lead->>'id')::uuid, note->>'content');
  END LOOP;

  RETURN new_lead;
END;
$$;
*/

// Then call from TypeScript:
const { data: lead, error } = await supabase.rpc("create_lead_with_notes", {
  lead_data: leadData,
  notes_data: notes,
});

if (error) {
  // Entire operation rolled back
  throw new DatabaseError("Failed to create lead with notes", error);
}
```

### DB-007: Handle Transaction Errors

**Rule:** Always handle and log transaction failures.

```typescript
async function transferLead(
  leadId: string,
  fromUserId: string,
  toUserId: string,
) {
  const { error } = await supabase.rpc("transfer_lead", {
    p_lead_id: leadId,
    p_from_user: fromUserId,
    p_to_user: toUserId,
  });

  if (error) {
    console.error("Lead transfer failed:", {
      leadId,
      fromUserId,
      toUserId,
      error: error.message,
      code: error.code,
    });

    // Check for specific error types
    if (error.code === "23503") {
      throw new NotFoundError("Lead or user not found");
    }
    if (error.code === "23514") {
      throw new ValidationError("Transfer violates business rules");
    }

    throw new DatabaseError("Failed to transfer lead");
  }
}
```

### DB-008: Keep Transactions Short

**Rule:** Don't do external API calls inside transactions.

```typescript
// ❌ WRONG - External call inside transaction
async function createLeadAndSync(data: LeadData) {
  await supabase.rpc("begin_transaction");

  const lead = await supabase.from("leads").insert(data).select().single();
  await syncToOdoo(lead.data); // External API - BAD!

  await supabase.rpc("commit_transaction");
}

// ✅ CORRECT - External calls outside transaction
async function createLeadAndSync(data: LeadData) {
  // Step 1: Database transaction
  const { data: lead, error } = await supabase.rpc("create_lead", { data });
  if (error) throw new DatabaseError(error);

  // Step 2: External sync (separate, can be retried)
  try {
    await syncToOdoo(lead);
  } catch (syncError) {
    // Log for retry queue, don't fail the whole operation
    await supabase.from("sync_queue").insert({
      lead_id: lead.id,
      action: "odoo_sync",
      status: "pending",
    });
  }
}
```

---

## 3. Performance Patterns

### DB-009: Prevent N+1 Queries

**Rule:** Use joins or batch fetches instead of loops.

```typescript
// ❌ WRONG - N+1 query pattern
async function getLeadsWithNotes(leadIds: string[]) {
  const leads = [];
  for (const id of leadIds) {
    const { data: lead } = await supabase
      .from("leads")
      .select()
      .eq("id", id)
      .single();
    const { data: notes } = await supabase
      .from("notes")
      .select()
      .eq("lead_id", id);
    leads.push({ ...lead, notes });
  }
  return leads; // N+1 queries!
}

// ✅ CORRECT - Single query with join
async function getLeadsWithNotes(leadIds: string[]) {
  const { data } = await supabase
    .from("leads")
    .select(
      `
      *,
      notes (*)
    `,
    )
    .in("id", leadIds);

  return data; // 1 query!
}

// ✅ CORRECT - Batch fetch if joins not suitable
async function getLeadsWithNotes(leadIds: string[]) {
  const [{ data: leads }, { data: notes }] = await Promise.all([
    supabase.from("leads").select().in("id", leadIds),
    supabase.from("notes").select().in("lead_id", leadIds),
  ]);

  // Combine in memory
  const notesMap = new Map(
    leadIds.map((id) => [id, notes?.filter((n) => n.lead_id === id) ?? []]),
  );

  return leads?.map((lead) => ({
    ...lead,
    notes: notesMap.get(lead.id) ?? [],
  }));
}
```

### DB-010: Use Appropriate Indexes

**Rule:** Index columns used in WHERE, JOIN, and ORDER BY.

```sql
-- Columns frequently filtered
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- Composite index for common query patterns
CREATE INDEX idx_leads_user_status ON leads(assigned_user_id, status);

-- Partial index for specific conditions
CREATE INDEX idx_leads_pending ON leads(created_at)
WHERE status = 'pending';

-- Text search index
CREATE INDEX idx_leads_name_search ON leads USING gin(name gin_trgm_ops);
```

### DB-011: Use Connection Pooling

**Rule:** Never create connections per request.

```typescript
// ❌ WRONG - New client per request
export async function GET() {
  const supabase = createClient(url, key); // New connection!
  const { data } = await supabase.from("leads").select();
  return Response.json(data);
}

// ✅ CORRECT - Shared client
import { supabase } from "@/lib/supabase"; // Singleton

export async function GET() {
  const { data } = await supabase.from("leads").select();
  return Response.json(data);
}

// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

### DB-012: Optimize Aggregations

**Rule:** Use database aggregations instead of fetching all data.

```typescript
// ❌ WRONG - Fetches all rows to count
async function getLeadStats() {
  const { data } = await supabase.from("leads").select();
  return {
    total: data?.length ?? 0,
    new: data?.filter((l) => l.status === "new").length ?? 0,
  };
}

// ✅ CORRECT - Database aggregation
async function getLeadStats() {
  const { data, count } = await supabase
    .from("leads")
    .select("status", { count: "exact", head: true });

  // Or use RPC for complex aggregations
  const { data: stats } = await supabase.rpc("get_lead_statistics");
  return stats;
}

// SQL function for complex stats
/*
CREATE OR REPLACE FUNCTION get_lead_statistics()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'by_status', jsonb_object_agg(status, count),
    'this_month', COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))
  )
  FROM (
    SELECT status, COUNT(*) as count
    FROM leads
    GROUP BY status
  ) stats;
$$;
*/
```

---

## 4. Supabase Specific

### DB-013: Handle NULL from Aggregations

**Rule:** Database aggregations can return NULL.

```typescript
// ❌ WRONG - Assumes sum returns number
const { data } = await supabase.rpc("get_total_value");
const total = data.toLocaleString(); // Crash if NULL!

// ✅ CORRECT - Handle NULL
const { data } = await supabase.rpc("get_total_value");
const total = (data ?? 0).toLocaleString();

// Better: Handle in SQL
/*
CREATE OR REPLACE FUNCTION get_total_value()
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0) FROM orders;
$$;
*/
```

### DB-014: RLS Policy Patterns

**Rule:** Test RLS policies thoroughly.

```sql
-- Basic user-owned data policy
CREATE POLICY "Users can view own leads"
ON leads FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Team-based access
CREATE POLICY "Team members can view team leads"
ON leads FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.team_id = leads.team_id
    AND team_members.user_id = auth.uid()
  )
);

-- Admin bypass
CREATE POLICY "Admins can view all"
ON leads FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);
```

### DB-015: Realtime Subscriptions

**Rule:** Clean up subscriptions properly.

```typescript
// ❌ WRONG - Subscription leak
useEffect(() => {
  supabase
    .channel("leads")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leads" },
      (payload) => setLeads((prev) => [...prev, payload.new]),
    )
    .subscribe();
  // No cleanup!
}, []);

// ✅ CORRECT - Proper cleanup
useEffect(() => {
  const channel = supabase
    .channel("leads")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leads" },
      (payload) => setLeads((prev) => [...prev, payload.new]),
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}, []);
```

---

## 5. Migration Standards

### DB-016: Migration File Naming

```
migrations/
├── 20260117000000_create_leads_table.sql
├── 20260117000001_add_leads_indexes.sql
├── 20260118000000_add_status_column.sql
└── 20260118000001_backfill_status.sql
```

Format: `YYYYMMDDHHMMSS_description.sql`

### DB-017: Safe Migration Practices

```sql
-- Always use IF NOT EXISTS / IF EXISTS
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Add columns with defaults for existing rows
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS stage text DEFAULT 'new';

-- Drop columns safely
ALTER TABLE leads
DROP COLUMN IF EXISTS deprecated_field;

-- Rename carefully (consider downtime)
-- Option 1: Add new, migrate, drop old (zero downtime)
ALTER TABLE leads ADD COLUMN new_name text;
UPDATE leads SET new_name = old_name;
ALTER TABLE leads DROP COLUMN old_name;

-- Option 2: Rename directly (brief lock)
ALTER TABLE leads RENAME COLUMN old_name TO new_name;
```

### DB-018: Data Migration Pattern

```sql
-- Backfill data in batches to avoid locking
DO $$
DECLARE
  batch_size int := 1000;
  affected int := 1;
BEGIN
  WHILE affected > 0 LOOP
    UPDATE leads
    SET status = 'new'
    WHERE status IS NULL
    AND id IN (
      SELECT id FROM leads
      WHERE status IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS affected = ROW_COUNT;
    COMMIT;
  END LOOP;
END $$;
```

---

## 6. Common Anti-Patterns

### Anti-Pattern 1: String Concatenation in Queries

```typescript
// ❌ SQL Injection vulnerability
const query = `SELECT * FROM leads WHERE name LIKE '%${search}%'`;

// ✅ Use parameterized queries
const { data } = await supabase
  .from("leads")
  .select()
  .ilike("name", `%${search}%`);
```

### Anti-Pattern 2: Fetching All to Filter

```typescript
// ❌ Fetches everything, filters in JS
const { data } = await supabase.from("leads").select();
const filtered = data?.filter((l) => l.status === "new" && l.amount > 10000);

// ✅ Filter in database
const { data } = await supabase
  .from("leads")
  .select()
  .eq("status", "new")
  .gt("amount", 10000);
```

### Anti-Pattern 3: No Error Handling

```typescript
// ❌ Ignores errors
const { data } = await supabase.from("leads").select();
return data.map((l) => l.name); // Crash if error!

// ✅ Handle errors
const { data, error } = await supabase.from("leads").select();
if (error) {
  console.error("Failed to fetch leads:", error);
  throw new DatabaseError("Failed to fetch leads");
}
return (data ?? []).map((l) => l.name);
```

### Anti-Pattern 4: Missing Indexes on Filtered Columns

```sql
-- ❌ Slow query without index
SELECT * FROM leads WHERE status = 'pending' ORDER BY created_at DESC;

-- ✅ Add appropriate index
CREATE INDEX idx_leads_status_created ON leads(status, created_at DESC);
```

---

## Quick Reference

### Query Safety Checklist

- [ ] Using Supabase client (parameterized)
- [ ] Input validated before query
- [ ] Only required columns selected
- [ ] LIMIT applied
- [ ] Timeout configured

### Performance Checklist

- [ ] No N+1 queries
- [ ] Indexes on filtered columns
- [ ] Using connection pooling
- [ ] Aggregations done in database

### Transaction Checklist

- [ ] Related operations in single transaction
- [ ] No external API calls inside transaction
- [ ] Error handling with proper rollback
- [ ] Transaction kept short

---

_Last Updated: January 17, 2026_
_Version: 1.0_
