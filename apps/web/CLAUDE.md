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
