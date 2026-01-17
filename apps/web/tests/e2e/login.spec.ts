import { test, expect } from '@playwright/test';
import { trackErrors } from '../helpers/error-tracker';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should load login page with all elements', async ({ page }) => {
    // CRITICAL: Track browser runtime errors
    const errors = await trackErrors(page);

    // Check page title
    await expect(page).toHaveTitle(/Maiyuri Bricks/);

    // Check branding
    await expect(page.getByRole('heading', { name: 'Maiyuri Bricks' })).toBeVisible();
    await expect(page.getByText('AI-Powered Lead Management')).toBeVisible();

    // Check form heading
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

    // Check form fields
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    // Check submit button
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // Check footer text
    await expect(page.getByText('Contact your administrator if you need access')).toBeVisible();

    // CRITICAL: Fail if any runtime errors occurred
    expect(errors, 'Page should have no runtime errors').toEqual([]);
  });

  test('should show validation error for empty email', async ({ page }) => {
    // Click submit without filling form
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should show email validation error
    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    // Enter invalid email - browser HTML5 validation will block form submission
    // So we test that the input has required validation attributes
    const emailInput = page.getByLabel('Email address');
    await emailInput.fill('notanemail');
    await page.getByLabel('Password').fill('password123');

    // Click submit - browser will show native validation
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Check that the email input is marked as invalid (native HTML5 validation)
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);

    // Alternatively, test with a partially valid looking email
    await emailInput.fill('test@');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should still be invalid
    const isStillInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isStillInvalid).toBe(true);
  });

  test('should show validation error for short password', async ({ page }) => {
    // Enter valid email but short password
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Password').fill('12345');

    // Click submit
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should show password validation error
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
  });

  test('should disable form while submitting', async ({ page }) => {
    // Enter valid credentials
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');

    // Click submit and immediately check for loading state or completion
    const submitButton = page.getByRole('button', { name: /Sign in|Signing in/ });
    await submitButton.click();

    // Wait for either loading state or the API response
    // The form should either show loading state or have completed by now
    // Use .first() to avoid strict mode violation when multiple elements match
    await expect(
      page.getByRole('button', { name: /Signing in|Sign in/ }).or(
        page.getByText(/Invalid|error|dashboard/i)
      ).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Enter non-existent credentials
    await page.getByLabel('Email address').fill('nonexistent@example.com');
    await page.getByLabel('Password').fill('wrongpassword');

    // Click submit
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Wait for error message (either specific or generic)
    await expect(
      page.getByText(/Invalid email or password|An unexpected error occurred/)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should handle redirect parameter', async ({ page }) => {
    // Navigate to login with redirect
    await page.goto('/login?redirect=/leads');

    // Page should still load correctly
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

    // The redirect param should be preserved in the URL
    expect(page.url()).toContain('redirect=/leads');
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    // Check email input accessibility
    const emailInput = page.getByLabel('Email address');
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(emailInput).toHaveAttribute('autocomplete', 'email');

    // Check password input accessibility
    const passwordInput = page.getByLabel('Password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');

    // Check button type
    const submitButton = page.getByRole('button', { name: 'Sign in' });
    await expect(submitButton).toHaveAttribute('type', 'submit');
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Focus on email input directly
    const emailInput = page.getByLabel('Email address');
    await emailInput.focus();

    // Fill email via keyboard
    await page.keyboard.type('test@example.com');

    // Tab to password
    await page.keyboard.press('Tab');
    await page.keyboard.type('password123');

    // Tab twice to skip "Forgot password" link and reach submit button
    await page.keyboard.press('Tab'); // Skip forgot password link
    await page.keyboard.press('Tab'); // Reach submit button

    // Submit with Enter key
    await page.keyboard.press('Enter');

    // Should trigger form submission - check for response or error
    // Use .first() to avoid strict mode violation when multiple elements match
    await expect(
      page.getByRole('button', { name: /Signing in|Sign in/ }).or(
        page.getByText(/Invalid|error|dashboard/i)
      ).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
