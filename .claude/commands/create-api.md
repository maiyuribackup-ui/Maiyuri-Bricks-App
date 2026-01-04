---
description: Create a new API route
argument-hint: [route-path]
allowed-tools: Read, Write, Edit, Glob
---

# Create API Route

Create a new API route at: /api/$ARGUMENTS

## Requirements

1. Create in `apps/web/app/api/$ARGUMENTS/route.ts`
2. Include Zod validation
3. Use consistent response format: `{ data, error, meta }`
4. Handle all HTTP methods needed
5. Include error handling

## Implementation

Follow the api-route-builder skill patterns for proper structure.
