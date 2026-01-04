---
description: Deploy to Vercel
allowed-tools: Bash, Read
---

# Deploy to Vercel

## Pre-deployment Checklist

1. Run quality gate: `bun typecheck && bun lint && bun test`
2. Check for uncommitted changes: `git status`
3. Ensure on main branch or feature branch

## Deployment Steps

1. Build the application: `bun build`
2. Deploy to Vercel: `vercel --prod` (or `vercel` for preview)
3. Verify deployment URL
4. Run smoke tests on deployed version

## Post-deployment

Report the deployment URL and any issues encountered.
