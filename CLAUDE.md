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

### Required (MUST)
- TypeScript strict mode
- Tests for all new features
- Run pre-commit hooks
- Functional component pattern in React
- React Hook Form + Zod for forms
- Tailwind + Design Tokens for styling

### Prohibited (MUST NOT)
- `@ts-ignore` or `@ts-expect-error`
- Class components in frontend
- Hard-coded colors
- Direct DB queries without transactions
- Unchecked external API calls
- Committing secrets or `.env` files

### Best Practices (SHOULD)
- Descriptive variable names
- Functions <50 lines
- Extract complex logic into helpers

## Security

- Never commit tokens or API keys
- Client env vars require `NEXT_PUBLIC_` prefix
- Use staging DB for risky operations
- Confirm before `git push --force` or destructive commands

## Git Workflow

- Branch from main: `feature/description`
- Conventional commits required
- PRs need: typecheck, lint, tests passing + 1 approval
- Squash commits before merge

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

## Claude Code Subagents

| Agent | Purpose | Tools |
|-------|---------|-------|
| **TestingAgent** | Run and debug tests | Read, Bash |
| **ReviewAgent** | Code review and quality | Read, Grep |
| **DocsAgent** | Generate documentation | Read, Write |

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
