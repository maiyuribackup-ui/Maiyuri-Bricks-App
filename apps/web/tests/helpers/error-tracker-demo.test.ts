import { test, expect } from '@playwright/test';
import { trackErrors } from './error-tracker';

/**
 * DEMONSTRATION: How error tracking prevents bugs from escaping
 *
 * This test demonstrates how the error-tracker would have caught
 * the OdooSyncCard bug that escaped to production.
 */

test.describe('Error Tracker - Bug Prevention Demo', () => {
  test('DEMO: Would catch the toLocaleString bug that escaped', async ({ page }) => {
    const errors = await trackErrors(page);

    // Simulate the bug that escaped: calling toLocaleString on undefined
    await page.goto(`data:text/html,
      <script>
        // This is the exact error that escaped to production
        const quote = { amount: undefined };
        const formatted = quote.amount.toLocaleString('en-IN'); // ❌ CRASHES
      </script>
    `);

    await page.waitForTimeout(500);

    // CRITICAL: The error tracker WOULD HAVE CAUGHT THIS
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Cannot read properties of undefined (reading 'toLocaleString')");

    console.log('\n🎯 ERROR CAUGHT BY TRACKER:');
    console.log(errors[0]);
    console.log('\n✅ This bug would NOT have escaped to production!');
  });

  test('DEMO: Fixed code passes with error tracking', async ({ page }) => {
    const errors = await trackErrors(page);

    // The FIXED version with null safety
    await page.goto(`data:text/html,
      <script>
        // Fixed with optional chaining and default value
        const quote = { amount: undefined };
        const formatted = (quote.amount || 0).toLocaleString('en-IN'); // ✅ WORKS
        console.log('Formatted amount:', formatted); // ₹0
      </script>
    `);

    await page.waitForTimeout(500);

    // CRITICAL: No errors with the fix
    expect(errors, 'Fixed code should have no runtime errors').toEqual([]);

    console.log('\n✅ Fixed code passes error tracking!');
  });
});
