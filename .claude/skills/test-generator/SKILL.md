---
name: test-generator
description: Generates unit tests, integration tests, and E2E tests using Vitest and Playwright. USE WHEN user says 'write tests', 'add tests', 'test this', OR wants testing coverage.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Test Generator

Generates tests following Maiyuri Bricks testing standards.

## Quick Start

```bash
# Run all tests
bun test

# Run specific test file
bun test path/to/file.test.ts

# Run with coverage
bun test --coverage

# Run E2E tests
bun test:e2e
```

## Test Structure

```
apps/web/src/
  components/
    LeadCard/
      LeadCard.tsx
      LeadCard.test.tsx    # Co-located unit test

tests/
  integration/
    api.test.ts            # API integration tests
  e2e/
    lead-flow.spec.ts      # E2E tests with Playwright
```

## Unit Test Template

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeadCard } from './LeadCard';
import type { Lead } from '@maiyuri/shared';

// Mock data
const mockLead: Lead = {
  id: '123',
  name: 'Test Lead',
  contact: '1234567890',
  source: 'Website',
  lead_type: 'Commercial',
  assigned_staff: 'staff-123',
  status: 'new',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z'
};

describe('LeadCard', () => {
  it('renders lead name and contact', () => {
    render(<LeadCard lead={mockLead} />);

    expect(screen.getByText('Test Lead')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
  });

  it('displays correct status badge', () => {
    render(<LeadCard lead={mockLead} />);

    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('calls onStatusChange when status is updated', async () => {
    const onStatusChange = vi.fn();
    render(<LeadCard lead={mockLead} onStatusChange={onStatusChange} />);

    // Trigger status change
    fireEvent.click(screen.getByRole('button', { name: /change status/i }));

    expect(onStatusChange).toHaveBeenCalledWith('follow_up');
  });
});
```

## Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('Leads API', () => {
  let testLeadId: string;

  beforeAll(async () => {
    // Create test data
    const { data } = await supabase
      .from('leads')
      .insert({
        name: 'Integration Test Lead',
        contact: '1234567890',
        source: 'Test',
        lead_type: 'Test',
        assigned_staff: 'test-staff-id'
      })
      .select()
      .single();

    testLeadId = data?.id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testLeadId) {
      await supabase.from('leads').delete().eq('id', testLeadId);
    }
  });

  it('should create a new lead', async () => {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Test Lead',
        contact: '0987654321',
        source: 'API Test',
        lead_type: 'Commercial',
        assigned_staff: 'staff-id'
      })
    });

    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.data.name).toBe('New Test Lead');
    expect(result.error).toBeNull();
  });

  it('should return 400 for invalid data', async () => {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' })  // Invalid: empty name
    });

    expect(response.status).toBe(400);
  });
});
```

## E2E Test Template (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Lead Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should create a new lead', async ({ page }) => {
    await page.click('text=Add Lead');

    await page.fill('[name="name"]', 'E2E Test Lead');
    await page.fill('[name="contact"]', '1234567890');
    await page.selectOption('[name="source"]', 'Website');
    await page.click('button[type="submit"]');

    // Verify lead was created
    await expect(page.locator('text=E2E Test Lead')).toBeVisible();
  });

  test('should add a note to a lead', async ({ page }) => {
    await page.click('text=E2E Test Lead');
    await page.click('text=Add Note');

    await page.fill('[name="note"]', 'This is a test note');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=This is a test note')).toBeVisible();
  });

  test('should change lead status', async ({ page }) => {
    await page.click('text=E2E Test Lead');
    await page.click('[data-testid="status-dropdown"]');
    await page.click('text=Hot');

    await expect(page.locator('[data-testid="status-badge"]')).toHaveText('hot');
  });
});
```

## Testing Best Practices

- Test behavior, not implementation
- Use descriptive test names
- One assertion per test (when possible)
- Mock external dependencies
- Clean up test data after tests
- Use data-testid for E2E selectors
- Aim for >80% coverage on business logic
- Test error cases and edge cases
