---
name: supabase-helper
description: Creates Supabase queries, migrations, RLS policies, and database operations. USE WHEN user mentions 'database', 'supabase', 'migration', 'query', 'RLS', OR 'table'.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Supabase Helper

Helps with Supabase database operations for Maiyuri Bricks.

## Quick Start

```bash
# Initialize Supabase (if not done)
supabase init

# Create a new migration
supabase migration new migration_name

# Apply migrations
supabase db push
```

## Database Schema

### Leads Table

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  source TEXT NOT NULL,
  lead_type TEXT NOT NULL,
  assigned_staff UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'follow_up', 'hot', 'cold', 'converted', 'lost')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read leads assigned to them
CREATE POLICY "Users can read assigned leads"
  ON leads FOR SELECT
  USING (assigned_staff = auth.uid() OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'founder'
  ));
```

### Notes Table

```sql
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES users(id),
  text TEXT NOT NULL,
  audio_url TEXT,
  transcription_text TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_summary TEXT,
  confidence_score NUMERIC(3, 2),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
```

### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('founder', 'accountant', 'engineer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

## Query Patterns

### TypeScript with Supabase Client

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Lead, Note } from '@maiyuri/shared';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Get all leads for a user
async function getLeads(userId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .or(`assigned_staff.eq.${userId},status.eq.new`)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Get lead with notes
async function getLeadWithNotes(leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      notes (
        id,
        text,
        date,
        ai_summary,
        confidence_score
      )
    `)
    .eq('id', leadId)
    .single();

  if (error) throw error;
  return data;
}

// Create lead with transaction
async function createLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update lead status
async function updateLeadStatus(leadId: string, status: Lead['status']) {
  const { data, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

## RLS Policies

### Founder Access (Full)

```sql
CREATE POLICY "Founders have full access"
  ON leads FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'founder'
  ));
```

### Staff Access (Limited)

```sql
CREATE POLICY "Staff can read assigned leads"
  ON leads FOR SELECT
  USING (assigned_staff = auth.uid());

CREATE POLICY "Staff can update assigned leads"
  ON leads FOR UPDATE
  USING (assigned_staff = auth.uid());
```

## Best Practices

- Always use RLS for security
- Use transactions for multi-table operations
- Index frequently queried columns
- Use TIMESTAMPTZ for dates
- Cascade deletes where appropriate
- Handle errors gracefully
