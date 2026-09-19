/**
 * Process OS smoke (M4). Same two tiers as smoke.spec.ts and just as
 * READ-ONLY: it never starts, advances or cancels a case.
 *
 *  - Unauthenticated: /processes and its sub-routes redirect to /login and
 *    the API refuses anonymous callers (a missing middleware entry would
 *    otherwise render the library to the whole internet — see LEARNINGS.md).
 *  - Authenticated (E2E_EMAIL + E2E_PASSWORD): the library renders.
 */
import { test, expect, type Page } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;
const hasCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

// ---------------------------------------------------------------- tier 1

test.describe("process os — public surface", () => {
  const PROTECTED = [
    "/processes",
    "/processes/LEAD_TO_DELIVERY",
    "/processes/LEAD_TO_DELIVERY/versions/1.0/edit",
    "/processes/instances/00000000-0000-4000-8000-000000000000",
  ];
  for (const route of PROTECTED) {
    test(`${route} requires login`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/login/, { timeout: 15000 });
      await expect(page.getByLabel("Email address")).toBeVisible();
    });
  }

  const AUTH_WALLED_APIS = [
    "/api/process/definitions",
    "/api/process/work",
    "/api/process/role-defaults",
  ];
  for (const route of AUTH_WALLED_APIS) {
    test(`API ${route} rejects anonymous`, async ({ request }) => {
      const res = await request.get(route);
      expect([401, 403]).toContain(res.status());
    });
  }
});

// ---------------------------------------------------------------- tier 2

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(E2E_EMAIL!);
  await page.getByLabel("Password").fill(E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|leads)/, { timeout: 30000 });
}

test.describe("process os — authenticated", () => {
  test.skip(!hasCreds, "E2E_EMAIL / E2E_PASSWORD not configured");

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("library renders", async ({ page }) => {
    await page.goto("/processes");
    await expect(page.getByRole("heading", { name: /Processes/ })).toBeVisible({
      timeout: 20000,
    });
    // Work strip proves the /api/process/work round-trip; a seeded library
    // shows the reference process, an empty one shows the empty state.
    await expect(page.getByText(/My process work/i)).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText(/Lead to Delivery|No processes yet/i).first(),
    ).toBeVisible({ timeout: 20000 });
  });

  test("process map renders stages when the reference process is seeded", async ({
    page,
  }) => {
    await page.goto("/processes/LEAD_TO_DELIVERY");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 20000 });
    const notSeeded = await page
      .getByText(/Process not found/i)
      .isVisible()
      .catch(() => false);
    test.skip(notSeeded, "LEAD_TO_DELIVERY is not seeded in this environment");
    await expect(page.getByText(/\d+ stages/)).toBeVisible();
  });
});
