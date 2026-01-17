import { Page } from '@playwright/test';

/**
 * Track browser runtime errors and console errors during E2E tests.
 * This prevents runtime errors from escaping to production by catching them in tests.
 *
 * Usage:
 * ```typescript
 * test('should load without errors', async ({ page }) => {
 *   const errors = await trackErrors(page);
 *   await page.goto('/some-page');
 *   expect(errors).toEqual([]);
 * });
 * ```
 */
export async function trackErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];

  // Capture JavaScript runtime errors (uncaught exceptions)
  page.on('pageerror', (error) => {
    errors.push(`Runtime Error: ${error.message}`);
  });

  // Capture console.error() calls
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });

  // Capture request failures (optional, helps debug API issues)
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure) {
      errors.push(`Request Failed: ${request.url()} - ${failure.errorText}`);
    }
  });

  return errors;
}
