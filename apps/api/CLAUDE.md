# apps/api - Backend CLAUDE.md

This extends the root CLAUDE.md with backend-specific guidance.

## Tech Stack
- Next.js API Routes / Supabase Functions
- Supabase PostgreSQL
- Supabase Auth
- Zod for request validation

## Directory Structure
```
src/
  routes/        # API route handlers
  middleware/    # Auth, validation, logging middleware
  models/        # Database models and queries
```

## API Design
- RESTful endpoints
- Consistent response format: `{ data, error, meta }`
- HTTP status codes: 200, 201, 400, 401, 403, 404, 500
- Validate all inputs with Zod

## Database Rules
- All queries use transactions
- Parameterized queries only (no string concatenation)
- Use Supabase RLS (Row Level Security)
- Index frequently queried columns

## Security
- Validate auth token on protected routes
- Never expose internal errors to client
- Rate limiting on sensitive endpoints
- Audit logging for data changes

## Error Handling
- Catch all async errors
- Log errors with context
- Return user-friendly messages
- Never leak stack traces
