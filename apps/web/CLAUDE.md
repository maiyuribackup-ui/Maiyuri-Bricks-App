# apps/web - Frontend CLAUDE.md

This extends the root CLAUDE.md with frontend-specific guidance.

## Tech Stack
- Next.js 14 (App Router)
- React 18 with functional components
- Tailwind CSS + Design Tokens
- Zustand for global state
- TanStack Query for data fetching
- React Hook Form + Zod for forms
- Recharts for dashboards

## Directory Structure
```
src/
  components/    # React components (PascalCase)
  hooks/         # Custom React hooks (use* prefix)
  lib/           # Utility functions and helpers
  types/         # TypeScript type definitions
  styles/        # Global styles and Tailwind config
```

## Component Rules
- Functional components only
- Use `use client` directive for client components
- Server components by default
- Co-locate tests with components (`Component.test.tsx`)

## State Management
- Zustand for global state (auth, user, leads cache)
- TanStack Query for server state
- Local useState for component-specific state

## Styling
- Tailwind CSS classes only
- Use design tokens from theme
- No hard-coded colors
- Mobile-first responsive design

## Forms
- React Hook Form for all forms
- Zod schemas for validation
- Error messages in Tamil + English where applicable

## Supabase Client Usage (CRITICAL)

**ALWAYS use centralized clients from `@/lib/supabase`:**

```typescript
// ✅ Server-side (API routes, server components)
import { supabaseAdmin } from "@/lib/supabase";

// ✅ Client-side (browser)
import { supabaseClient } from "@/lib/supabase";

// ❌ NEVER create your own client with non-null assertions
// This causes "supabaseKey is required" errors!
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.URL!, process.env.KEY!);  // BAD!
```

See `docs/LEARNINGS.md` BUG-014 for details.

## Key Library Files
- `src/lib/supabase.ts` - Centralized Supabase clients
- `src/lib/telegram.ts` - Telegram bot utilities
- `src/lib/telegram-webhook.ts` - Webhook helper functions
