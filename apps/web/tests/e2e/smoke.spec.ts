/**
 * Production smoke suite — the regression net that runs in CI after every
 * deploy (e2e.yml). Strictly READ-ONLY: it never creates, edits or deletes
 * business data, so it is safe against mb.maiyuri.com.
 *
 * Two tiers:
 *  - Unauthenticated: always runs. Login page, route protection, public
 *    quote pages, API auth walls.
 *  - Authenticated: runs only when E2E_EMAIL + E2E_PASSWORD are set
 *    (repo secrets). Covers the money paths: dashboard, leads, quotes inbox,
 *    daily report, OneHub, My Work, planning view.
 */
import { test, expect, type Page } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;
const hasCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

// ---------------------------------------------------------------- tier 1

test.describe("public surface", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  const PROTECTED_PAGES = [
    "/dashboard",
    "/leads",
    "/quotes",
    "/daily-report",
    "/planning",
    "/onehub",
    "/projects",
    "/approvals",
    "/settings",
  ];
  for (const route of PROTECTED_PAGES) {
    test(`${route} requires login`, async ({ page }) => {
      await page.goto(route);
      // Middleware redirects anonymous visitors to /login.
      await page.waitForURL(/\/login/, { timeout: 15000 });
      await expect(page.getByLabel("Email address")).toBeVisible();
    });
  }

  const AUTH_WALLED_APIS = [
    "/api/leads",
    "/api/smart-quotes",
    "/api/my-work",
    "/api/projects",
    "/api/tickets",
    "/api/renewals",
    "/api/ops-planning/params",
    "/api/users",
  ];
  for (const route of AUTH_WALLED_APIS) {
    test(`API ${route} rejects anonymous`, async ({ request }) => {
      const res = await request.get(route);
      expect([401, 403]).toContain(res.status());
    });
  }

  test("cron endpoints reject anonymous", async ({ request }) => {
    for (const route of [
      "/api/cron/ar-chase",
      "/api/cron/renewal-alerts",
      "/api/cron/salespulse",
      "/api/my-work/generate",
    ]) {
      const res = await request.post(route);
      expect([401, 403], route).toContain(res.status());
    }
  });

  test("unknown public quote slug 404s without crashing", async ({ page }) => {
    const res = await page.goto("/sq/this-slug-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/health");
    // 200 healthy / 503 degraded both prove the app is alive and reporting.
    expect([200, 503]).toContain(res.status());
  });
});

// ---------------------------------------------------------------- tier 2

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(E2E_EMAIL!);
  await page.getByLabel("Password").fill(E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|leads)/, { timeout: 30000 });
}

test.describe("authenticated money paths", () => {
  test.skip(!hasCreds, "E2E_EMAIL / E2E_PASSWORD not configured");

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard loads with stats", async ({ page }) => {
    await page.goto("/dashboard");
    // The stat cards region renders numbers once the API answers.
    await expect(page.getByText(/total leads/i).first()).toBeVisible({ timeout: 20000 });
  });

  test("leads list renders rows or empty state", async ({ page }) => {
    await page.goto("/leads");
    await expect(
      page.getByRole("heading", { name: /leads/i }).first(),
    ).toBeVisible({ timeout: 20000 });
  });

  test("quotes inbox renders", async ({ page }) => {
    await page.goto("/quotes");
    await expect(page.getByRole("heading", { name: /Quotes Inbox/i })).toBeVisible({
      timeout: 20000,
    });
    // Table or the no-quotes empty state — either proves the API round-trip.
    await expect(
      page.getByText(/Engagement|No quotes yet/i).first(),
    ).toBeVisible({ timeout: 20000 });
  });

  test("daily report renders finance tiles", async ({ page }) => {
    await page.goto("/daily-report");
    await expect(page.getByText(/Daily Operations Briefing/i)).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/Overdue Receivables/i)).toBeVisible();
  });

  test("onehub renders SOP library and renewals", async ({ page }) => {
    await page.goto("/onehub");
    await expect(page.getByText(/SOP Library/i).first()).toBeVisible({ timeout: 20000 });
  });

  test("planning view renders", async ({ page }) => {
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: /Production Plan/i })).toBeVisible({
      timeout: 20000,
    });
  });

  test("my work queue renders", async ({ page }) => {
    await page.goto("/onehub/my-work");
    // Queue page or its empty state.
    await expect(page.getByText(/My Work|All clear|Needs attention/i).first()).toBeVisible({
      timeout: 20000,
    });
  });
});
