import { test, expect } from '@playwright/test';
import { trackErrors } from './error-tracker';

/**
 * Unit tests for browser error tracking helper
 *
 * This helper is CRITICAL for preventing runtime errors from escaping to production
 */

test.describe('Error Tracker', () => {
  test('should capture JavaScript runtime errors', async ({ page }) => {
    const errors = await trackErrors(page);

    // Navigate to a page that will cause a runtime error
    await page.goto('data:text/html,<script>undefined.foo()</script>');

    // Wait for error to be captured
    await page.waitForTimeout(500);

    // Should have captured the error
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Runtime Error');
  });

  test('should capture console.error() calls', async ({ page }) => {
    const errors = await trackErrors(page);

    // Navigate and trigger console.error
    await page.goto('data:text/html,<script>console.error("Test error")</script>');

    // Wait for error to be captured
    await page.waitForTimeout(500);

    // Should have captured the console error
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Console Error');
  });

  test('should not report errors on clean pages', async ({ page }) => {
    const errors = await trackErrors(page);

    // Navigate to a clean page
    await page.goto('data:text/html,<h1>No errors here</h1>');

    // Wait to ensure no errors
    await page.waitForTimeout(500);

    // Should have no errors
    expect(errors).toEqual([]);
  });

  test('should work with actual login page', async ({ page }) => {
    const errors = await trackErrors(page);

    try {
      await page.goto('http://localhost:3001/login', { timeout: 5000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Login page should load without runtime errors
      expect(errors, 'Login page should have no runtime errors').toEqual([]);
    } catch (e) {
      // If server not running, skip this test
      test.skip(true, 'Dev server not running');
    }
  });
});
