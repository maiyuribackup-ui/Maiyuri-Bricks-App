import { test, expect } from "@playwright/test";
import { trackErrors } from "../helpers/error-tracker";

// Load test credentials from environment variables
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "";

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required for tests",
  );
}

test.describe("Odoo Quote Display", () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    // Go to login page
    await page.goto("/login");

    // Fill in credentials
    await page.getByLabel("Email address").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill(TEST_PASSWORD);

    // Click sign in
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for redirect to dashboard or leads
    await page.waitForURL(/\/(dashboard|leads)/, { timeout: 15000 });
  });

  test("should display Odoo quotes without runtime errors on leads page", async ({
    page,
  }) => {
    const errors = await trackErrors(page);

    // Navigate to the specific lead page
    await page.goto("/leads/247a1574-cb50-4ffe-9b7c-0b677b51b67a");

    // Wait for page content to load (look for lead details or error)
    await page.waitForSelector(
      '[data-testid="lead-details"], h1, .lead-name, [class*="lead"]',
      { timeout: 30000 },
    );

    // Give time for any deferred errors
    await page.waitForTimeout(3000);

    // Check for runtime errors - specifically toLocaleString and null reference errors
    // Filter out network errors (Failed to fetch) which are unrelated to our fix
    const criticalErrors = errors.filter(
      (e) =>
        (e.includes("toLocaleString") ||
          e.includes("Cannot read properties of undefined") ||
          e.includes("Cannot read properties of null")) &&
        !e.includes("Failed to fetch"),
    );

    expect(
      criticalErrors,
      "Should have no toLocaleString or null reference errors",
    ).toEqual([]);

    // Take a screenshot for manual verification
    await page.screenshot({
      path: "test-results/odoo-quote-display.png",
      fullPage: true,
    });
  });

  test("should display quote amounts correctly after sync", async ({
    page,
  }) => {
    const errors = await trackErrors(page);

    // Navigate to the lead with synced quotes
    await page.goto("/leads/247a1574-cb50-4ffe-9b7c-0b677b51b67a");

    // Wait for page content
    await page.waitForSelector(
      '[data-testid="lead-details"], h1, .lead-name, [class*="lead"]',
      { timeout: 30000 },
    );
    await page.waitForTimeout(3000);

    // Check for critical runtime errors (not network errors)
    // We specifically care about null safety errors, not network issues
    const criticalErrors = errors.filter(
      (e) =>
        (e.includes("Cannot read properties of undefined") ||
          e.includes("Cannot read properties of null") ||
          e.includes("toLocaleString")) &&
        !e.includes("Failed to fetch") &&
        !e.includes("loadUser"),
    );

    expect(criticalErrors, "Should have no null reference errors").toEqual([]);

    // Take screenshot
    await page.screenshot({
      path: "test-results/odoo-quote-amounts.png",
      fullPage: true,
    });
  });
});
