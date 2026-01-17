# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maiyuri Bricks AI Lead Management - an AI-powered lead management system for a brick manufacturing business.

- **Type:** Monorepo
- **Stack:** Next.js 14, React 18, Tailwind CSS, Supabase, Claude Code, Gemini 2.5 Flash
- **Architecture:** Frontend + API + Shared packages + Services
- **Team Size:** 3

This CLAUDE.md is authoritative. Subdirectory CLAUDE.md files extend these rules.

## Commands

```bash
# Development
bun dev              # Start all dev servers
bun build            # Build packages
bun test             # Run all tests
bun typecheck        # TypeScript validation
bun lint             # ESLint
bun lint:fix         # Auto-fix lint issues

# Quality gate (run before commits)
bun typecheck && bun lint && bun test
```

## Project Structure

```
apps/
  web/               # Next.js frontend (see apps/web/CLAUDE.md)
  api/               # API routes and backend (see apps/api/CLAUDE.md)
packages/
  ui/                # Shared UI component library (see packages/ui/CLAUDE.md)
  shared/            # Shared utilities and types (see packages/shared/CLAUDE.md)
services/
  auth/              # Authentication service (see services/auth/CLAUDE.md)
tests/               # E2E and integration tests (see tests/CLAUDE.md)
```

## Code Standards

> **CRITICAL: Read before coding!**
> - [CODING_PRINCIPLES.md](docs/CODING_PRINCIPLES.md) - Comprehensive coding standards
> - [LEARNINGS.md](docs/LEARNINGS.md) - Bug prevention registry

### Required (MUST)
- TypeScript strict mode
- Tests for all new features
- Run pre-commit hooks (`/pre-commit`)
- Functional component pattern in React
- React Hook Form + Zod for forms
- Tailwind + Design Tokens for styling
- **NULL SAFETY:** Always use `??` for defaults, `?.` for nested access

### Prohibited (MUST NOT)
- `@ts-ignore` or `@ts-expect-error`
- Class components in frontend
- Hard-coded colors
- Direct DB queries without transactions
- Unchecked external API calls
- Committing secrets or `.env` files
- **Method calls on nullable values without defaults** (e.g., `value.toLocaleString()`)

### Best Practices (SHOULD)
- Descriptive variable names
- Functions <50 lines
- Extract complex logic into helpers
- **Check LEARNINGS.md for similar bugs before fixing**

## Security

- Never commit tokens or API keys
- Client env vars require `NEXT_PUBLIC_` prefix
- Use staging DB for risky operations
- Confirm before `git push --force` or destructive commands

## Git Workflow

> **Full documentation:** See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)

### Branch Strategy (GitHub Flow)

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production code | Protected: PR required, 1 approval, CI pass |
| `feature/*` | New features | None |
| `fix/*` | Bug fixes | None |
| `hotfix/*` | Urgent production fixes | Fast-track review |

### Workflow Steps

1. **Create branch from main**
   ```bash
   git checkout main && git pull && git checkout -b feature/name
   ```

2. **Commit with conventional format**
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug"
   ```

3. **Push and create PR**
   ```bash
   git push -u origin feature/name
   ```

4. **After PR approval and CI pass** → Squash merge

### Conventional Commits (REQUIRED)

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat: add lead scoring` |
| `fix` | Bug fix | `fix: resolve login error` |
| `docs` | Documentation | `docs: update API guide` |
| `style` | Formatting | `style: fix indentation` |
| `refactor` | Code restructure | `refactor: simplify auth` |
| `test` | Tests | `test: add unit tests` |
| `chore` | Maintenance | `chore: update deps` |
| `perf` | Performance | `perf: optimize query` |

### Release Process

1. **Ensure CI passes on main**
2. **Update CHANGELOG.md** with version notes
3. **Create version tag**
   ```bash
   git tag -a v0.2.0 -m "Release v0.2.0: Description"
   git push origin v0.2.0
   ```
4. **Automatic:** GitHub Release created + Telegram notification sent

### Version Format (SemVer)

```
MAJOR.MINOR.PATCH (e.g., v0.2.1)
- PATCH: Bug fixes (0.1.0 → 0.1.1)
- MINOR: New features (0.1.1 → 0.2.0)
- MAJOR: Breaking changes (0.2.0 → 1.0.0)
```

### Pre-Commit Checklist

Before every commit, run:
```bash
npm run typecheck && npm run lint && npm run test
```

### PR Requirements

- [ ] CI passes (typecheck, lint, test)
- [ ] 1 approval from team member
- [ ] No merge conflicts
- [ ] Conventional commit message
- [ ] Documentation updated (if needed)

---

## Issue Fixing Workflow

> **Full Guide:** See [docs/ISSUE_WORKFLOW.md](docs/ISSUE_WORKFLOW.md) for complete issue fixing workflow with comprehensive testing strategy.

### When User Says "Fix This Issue"

Follow this mandatory workflow:

#### 1. Setup
```bash
git checkout main && git pull
git checkout -b fix/issue-<number>-description
```

#### 2. Implement with Tests
- Write unit tests FIRST (TDD recommended)
- Implement fix
- Ensure 80%+ test coverage

#### 3. Testing Levels (ALL REQUIRED)

| Test Type | Tool | Coverage | Status |
|-----------|------|----------|--------|
| **Unit** | Vitest | 80%+ | ☐ |
| **Integration** | Vitest | 70%+ | ☐ |
| **E2E Browser** | Playwright | Critical flows | ☐ |
| **Production** | Manual/E2E | All changes | ☐ |

#### 4. Production Testing (MANDATORY)
- [ ] Test on Vercel preview deployment
- [ ] Test with production data (read-only)
- [ ] Test on real mobile device
- [ ] Chrome + Safari (both desktop + mobile)
- [ ] No console errors
- [ ] No network errors

#### 5. PR with Evidence
```bash
git commit -m "fix: description

Testing:
- ✅ Unit: 95% coverage
- ✅ Integration: All passing
- ✅ E2E: Chrome + Safari
- ✅ Production: Preview verified

Fixes #<issue-number>"
```

#### 6. Checklist Template
Copy from: [.github/ISSUE_FIX_CHECKLIST.md](.github/ISSUE_FIX_CHECKLIST.md)

### Testing Requirements

**Unit Tests (Vitest):**
```typescript
// Co-locate with source files
// File: component.test.ts or component.test.tsx
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should handle success case', () => {
    // Test implementation
  });

  it('should handle error case', () => {
    // Test edge cases
  });
});
```

**Integration Tests (Vitest):**
```typescript
// Test API routes, database operations
// File: route.test.ts
describe('POST /api/endpoint - Integration', () => {
  beforeEach(async () => {
    await setupTestDB();
  });

  it('should create resource', async () => {
    // Test with real DB/services
  });
});
```

**E2E Tests (Playwright):**
```typescript
// File: tests/e2e/feature.spec.ts
import { test, expect } from '@playwright/test';

test('user flow end-to-end', async ({ page }) => {
  await page.goto('/feature');
  // Test critical user flows
  await expect(page).toHaveURL(/success/);
});
```

**Production Testing:**
- Test on Vercel preview: `<branch>-<hash>.vercel.app`
- Use production environment (read-only operations)
- Test on real devices, not just DevTools
- Verify no errors in console/network
- Check Sentry for errors after deploy

### Pre-Merge Requirements

**All of these MUST pass:**
```bash
# 1. TypeScript
npm run typecheck ✅

# 2. Linting
npm run lint ✅

# 3. All tests
npm run test ✅

# 4. E2E tests
npm run test:e2e ✅

# 5. Production verification
# Manual testing on preview deployment ✅
```

---

## Testing Strategy

- **Unit tests:** Co-located with source, >80% coverage
- **Integration tests:** API endpoints + DB operations
- **E2E tests:** Critical user flows

## Available Tools

- Bash, rg, git, node, bun
- GitHub CLI (`gh`)
- Supabase CLI
- Turbo (monorepo task runner)

## MCP Servers (Installed)

| Server | Purpose | Command |
|--------|---------|---------|
| **github** | GitHub issues, PRs, repos | `bunx @modelcontextprotocol/server-github` |
| **context7** | Web search & documentation | `bunx context7-mcp` |
| **sequential-thinking** | Complex reasoning | `bunx @modelcontextprotocol/server-sequential-thinking` |
| **postgres** | Supabase/PostgreSQL queries | `bunx @modelcontextprotocol/server-postgres` |
| **memory** | Persistent context storage | `bunx @modelcontextprotocol/server-memory` |
| **filesystem** | File operations | `bunx @modelcontextprotocol/server-filesystem` |
| **brave-search** | Web search (Brave) | `bunx @modelcontextprotocol/server-brave-search` |
| **puppeteer** | Browser automation/E2E | `bunx @anthropic-ai/claude-code-mcp-server-puppeteer` |

### Required Environment Variables for MCP

```bash
# For postgres server
DATABASE_URL=postgresql://...

# For brave-search server
BRAVE_API_KEY=your-key

# For github server
GITHUB_PERSONAL_ACCESS_TOKEN=your-token
```

## Anthropic SDK

The `@anthropic-ai/sdk` is installed for AI agent orchestration:

```typescript
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();
```

## Custom Slash Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/null-check` | Scan for null safety issues | Before commits, after bugs |
| `/pre-commit` | Run all quality gates | Before every commit |
| `/code-review` or `/review` | Review code against principles | Before PRs |
| `/test-all` or `/test` | Run comprehensive tests | Before deploys |
| `/deploy` | Safe production deployment | When releasing |
| `/learning` | Document a bug for prevention | After fixing any bug |

### Quick Workflow

```bash
# Before committing
/pre-commit

# Before PR
/code-review

# After fixing a bug
/learning "Error message here"

# Before deploying
/deploy
```

## Claude Code Subagents

| Agent | Purpose | Tools |
|-------|---------|-------|
| **TestingAgent** | Run and debug tests | Read, Bash |
| **ReviewAgent** | Code review and quality | Read, Grep |
| **DocsAgent** | Generate documentation | Read, Write |
| **NullSafetyAgent** | Scan for null vulnerabilities | Grep, Read |

## AI Agents (Application)

| Agent | Role |
|-------|------|
| LeadManager | CRUD leads, assign tasks |
| NotesAgent | Ingest & manage notes |
| TranscriptionAgent | Audio → text via Gemini |
| KnowledgeAgent | Embeddings, Q&A retrieval |
| SuggestionAgent | Recommend actions |
| SummarizationAgent | Multi-note AI summary |
| ScoringAgent | Lead conversion probability |
| CoachingAgent | Staff performance insights |
| ReportAgent | Generate reports & notifications |
