# tests - Testing CLAUDE.md

Testing configuration and guidelines for the monorepo.

## Testing Stack
- **Unit/Integration:** Vitest
- **E2E:** Playwright
- **Component:** Testing Library

## Test Categories
- Unit tests: Co-located with source files
- Integration tests: API endpoints + DB operations
- E2E tests: Critical user flows in `tests/e2e/`

## Coverage Requirements
- Unit tests: >80% coverage
- Critical paths: 100% coverage
- All new features must include tests

## Running Tests
```bash
bun test              # All unit tests
bun test:e2e          # E2E tests
bun test:coverage     # With coverage report
bun test <file>       # Single file
```

## Test Patterns
- Arrange-Act-Assert structure
- Mock external APIs (Supabase, Gemini)
- Use test fixtures for consistent data
- Clean up after each test

## E2E Critical Flows
1. Lead creation → notes → AI suggestions
2. Audio upload → transcription → summary
3. Dashboard load → performance metrics
4. Staff assignment → notification
