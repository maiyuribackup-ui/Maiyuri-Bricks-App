import { test, expect } from '@playwright/test';

test.describe('Login with Real Credentials', () => {
  test('should login successfully with valid credentials', async ({ page }) => {
    // Enable ALL console logging
    page.on('console', msg => {
      const text = msg.text();
      // Log everything to help debug
      console.log(`Browser [${msg.type()}]:`, text);
    });
    page.on('pageerror', err => console.log('Page ERROR:', err.message, err.stack));

    // Log network requests
    page.on('request', req => {
      if (req.url().includes('supabase') || req.url().includes('auth')) {
        console.log('Request:', req.method(), req.url());
      }
    });
    page.on('response', res => {
      if (res.url().includes('supabase') || res.url().includes('auth')) {
        console.log('Response:', res.status(), res.url());
      }
    });

    // Go to login page
    await page.goto('/login');

    // Verify we're on the login page
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

    // Fill in credentials slowly to ensure they register
    await page.getByLabel('Email address').click();
    await page.getByLabel('Email address').fill('ram@maiyuri.app');
    await page.getByLabel('Password').click();
    await page.getByLabel('Password').fill('TempPass123!');

    // Take screenshot before clicking
    await page.screenshot({ path: 'test-results/before-submit.png' });

    // Click sign in button and wait for auth request
    const signInButton = page.getByRole('button', { name: 'Sign in' });
    await expect(signInButton).toBeEnabled();

    // Start waiting for the auth request before clicking
    const authRequestPromise = page.waitForRequest(
      (req) => req.url().includes('supabase') && req.method() === 'POST',
      { timeout: 10000 }
    );

    await signInButton.click();

    // Wait for auth request
    try {
      const authRequest = await authRequestPromise;
      console.log('Auth request made:', authRequest.url());
    } catch (e) {
      console.log('No auth request detected within timeout');
    }

    // Wait for loading state
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/during-submit.png' });

    // Check loading state
    const loadingButton = page.getByRole('button', { name: 'Signing in...' });
    const isLoading = await loadingButton.isVisible({ timeout: 2000 }).catch(() => false);
    console.log('Loading state visible:', isLoading);

    // Wait for redirect (wait for URL change or dashboard)
    await page.waitForTimeout(1000);
    console.log('URL after 1 second:', page.url());
    await page.waitForTimeout(2000);
    console.log('URL after 3 seconds:', page.url());
    await page.screenshot({ path: 'test-results/after-submit.png' });

    // Wait for either navigation or error
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20000 });
      console.log('✅ Login successful! Redirected to dashboard.');
      await page.screenshot({ path: 'test-results/login-success.png' });
    } catch (e) {
      // Check for error message on page
      const errorElement = page.locator('.bg-red-50');
      if (await errorElement.isVisible({ timeout: 1000 })) {
        const errorText = await errorElement.textContent();
        console.log('❌ Login failed with error:', errorText);
        await page.screenshot({ path: 'test-results/login-error.png' });
        throw new Error(`Login failed: ${errorText}`);
      }

      // Check if still on login page
      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);
      await page.screenshot({ path: 'test-results/login-state.png' });

      // Check for loading state (maybe it's still processing)
      const isLoading = await page.getByRole('button', { name: 'Signing in...' }).isVisible({ timeout: 500 }).catch(() => false);
      if (isLoading) {
        console.log('Still loading, waiting more...');
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'test-results/still-loading.png' });
      }

      throw new Error(`Login did not redirect. Current URL: ${currentUrl}`);
    }
  });

  test('should show user info after login', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email address').fill('ram@maiyuri.app');
    await page.getByLabel('Password').fill('TempPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Wait for dashboard
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    // Look for user name or avatar
    const userIndicator = page.getByText(/Ram Kumaran|ram@maiyuri/i);

    if (await userIndicator.isVisible({ timeout: 5000 })) {
      console.log('✅ User info visible on dashboard');
    }

    // Take a screenshot of the dashboard
    await page.screenshot({ path: 'test-results/dashboard-after-login.png', fullPage: true });
  });
});
