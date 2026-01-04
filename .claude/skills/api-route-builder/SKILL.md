---
name: api-route-builder
description: Creates Next.js API routes with validation, error handling, and Supabase integration. USE WHEN user says 'create API', 'add endpoint', 'build route', OR wants backend functionality.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# API Route Builder

Creates Next.js API routes following Maiyuri Bricks standards.

## Quick Start

```bash
# API routes go in apps/web/app/api/
apps/web/app/api/
├── leads/
│   ├── route.ts           # GET all, POST new
│   └── [id]/
│       └── route.ts       # GET one, PUT, DELETE
├── notes/
│   └── route.ts
└── health/
    └── route.ts
```

## Instructions

When creating an API route:

1. **Choose the HTTP methods needed:**
   - GET: Retrieve data
   - POST: Create new resource
   - PUT/PATCH: Update resource
   - DELETE: Remove resource

2. **Add Zod validation for request body**

3. **Use consistent response format:**
   ```typescript
   { data: T | null, error: string | null, meta?: object }
   ```

4. **Handle all error cases**

## Route Template

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schema
const createLeadSchema = z.object({
  name: z.string().min(1),
  contact: z.string().min(10),
  source: z.string(),
  lead_type: z.string(),
  assigned_staff: z.string().uuid()
});

// GET /api/leads
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .range((page - 1) * limit, page * limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      error: null,
      meta: { total: count, page, limit }
    });
  } catch (err) {
    return NextResponse.json(
      { data: null, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/leads
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const result = createLeadSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { data: null, error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('leads')
      .insert(result.data)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data, error: null },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { data: null, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Dynamic Route Template

```typescript
// apps/web/app/api/leads/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: { id: string };
}

// GET /api/leads/:id
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = params;

  const { data, error } = await supabase
    .from('leads')
    .select('*, notes(*)')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json(
      { data: null, error: 'Lead not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ data, error: null });
}

// PUT /api/leads/:id
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = params;
  const body = await request.json();

  const { data, error } = await supabase
    .from('leads')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, error: null });
}

// DELETE /api/leads/:id
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = params;

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { data: { deleted: true }, error: null },
    { status: 200 }
  );
}
```

## Best Practices

- Always validate input with Zod
- Use consistent response format
- Return appropriate HTTP status codes
- Never expose internal errors to client
- Log errors server-side
- Use service role key for admin operations
- Handle pagination for list endpoints
