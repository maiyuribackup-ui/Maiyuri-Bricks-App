import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should load login page with all elements', async ({ page }) => {
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

    // Click submit
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Button should show loading state
    await expect(page.getByRole('button', { name: 'Signing in...' })).toBeVisible();

    // Fields should be disabled
    await expect(page.getByLabel('Email address')).toBeDisabled();
    await expect(page.getByLabel('Password')).toBeDisabled();
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
    // Tab through form
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Email should be focused first form field
    const emailInput = page.getByLabel('Email address');

    // Fill via keyboard
    await emailInput.focus();
    await page.keyboard.type('test@example.com');

    // Tab to password
    await page.keyboard.press('Tab');
    await page.keyboard.type('password123');

    // Tab to submit button
    await page.keyboard.press('Tab');

    // Submit with Enter
    await page.keyboard.press('Enter');

    // Should trigger form submission (loading state)
    await expect(page.getByRole('button', { name: 'Signing in...' })).toBeVisible();
  });
});
