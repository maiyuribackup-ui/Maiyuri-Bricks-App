# Safe Deploy Command

Deploy to production with all safety checks.

## Instructions

When the user runs /deploy, follow this safe deployment workflow:

### Pre-Deploy Checklist (MANDATORY)

1. Run /test-all - All tests must pass
2. Run /pre-commit - No critical issues
3. Check git status - correct branch, all committed

### Deployment Steps

1. Build: bun run build
2. Preview: vercel --prod=false
3. Smoke test preview: BASE_URL=<preview-url> bun run test:smoke
4. Production: vercel --prod
5. Post-deploy smoke test

### Rollback
vercel rollback
