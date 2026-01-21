/**
 * Test Smart Quote Redesign on Production
 *
 * Tests the new Steve Jobs style redesign:
 * - Full-bleed hero with gradient
 * - Trust chips
 * - 7-section layout
 */

import { chromium } from "playwright";

async function testSmartQuoteRedesign() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Login
    console.log("Navigating to production login page...");
    await page.goto("https://maiyuri-bricks-app.vercel.app/login");

    console.log("\n=== MANUAL LOGIN REQUIRED ===");
    console.log(
      "Please log in with your founder account in the browser window.",
    );
    console.log("Waiting for login to complete (will auto-detect)...\n");

    // Wait for redirect to dashboard (login success)
    let waited = 0;
    while (!page.url().includes("/dashboard")) {
      await page.waitForTimeout(5000);
      waited += 5;
      if (waited % 10 === 0) {
        console.log(`Still waiting for login... (${waited}s)`);
      }
      if (waited > 120) {
        console.log("Timeout waiting for login");
        break;
      }
    }

    if (page.url().includes("/dashboard")) {
      console.log("Login detected! URL changed to:", page.url());
      console.log("Continuing with automated testing...\n");
    }

    // Step 2: Navigate to Leads page
    console.log("Navigating to Leads page...");
    await page.goto("https://maiyuri-bricks-app.vercel.app/leads");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Step 3: Try to find existing Smart Quote links anywhere on page
    console.log("Searching for Smart Quote links...");

    // First, let's see what's on the page
    const allLinks = await page.locator("a").all();
    let sqLink: string | null = null;

    for (const link of allLinks) {
      const href = await link.getAttribute("href");
      if (href && href.includes("/sq/")) {
        sqLink = href;
        console.log("Found Smart Quote link:", sqLink);
        break;
      }
    }

    if (!sqLink) {
      // Try clicking on a lead card to see details
      console.log(
        "No Smart Quote link found on leads page. Trying to click a lead...",
      );

      // Look for any clickable lead element
      const leadElements = await page
        .locator('[class*="lead"], [class*="card"], tr')
        .all();
      console.log(`Found ${leadElements.length} potential lead elements`);

      // Click the first visible clickable element that might be a lead
      for (const el of leadElements.slice(0, 5)) {
        if (await el.isVisible()) {
          try {
            await el.click();
            await page.waitForTimeout(2000);

            // Check if we're now on a lead detail page or drawer opened
            const currentUrl = page.url();
            if (currentUrl.includes("/leads/")) {
              console.log("Navigated to lead detail:", currentUrl);
              break;
            }

            // Check for drawer/modal with Smart Quote
            const sqLinkInDrawer = await page
              .locator('a[href*="/sq/"]')
              .first();
            if (await sqLinkInDrawer.isVisible()) {
              sqLink = await sqLinkInDrawer.getAttribute("href");
              console.log("Found Smart Quote link in drawer:", sqLink);
              break;
            }
          } catch {
            // Element not clickable, try next
          }
        }
      }
    }

    if (!sqLink) {
      // Try to find a lead and generate Smart Quote
      console.log("Looking for 'Generate Smart Quote' or 'Create' button...");

      const generateBtn = await page
        .locator(
          'button:has-text("Generate"), button:has-text("Smart Quote"), button:has-text("Create Quote")',
        )
        .first();
      if (await generateBtn.isVisible()) {
        console.log("Found generate button, clicking...");
        await generateBtn.click();
        await page.waitForTimeout(5000);

        // Look for the link again
        const newSqLink = await page.locator('a[href*="/sq/"]').first();
        if (await newSqLink.isVisible()) {
          sqLink = await newSqLink.getAttribute("href");
          console.log("New Smart Quote created:", sqLink);
        }
      }
    }

    if (sqLink) {
      // Navigate to Smart Quote page
      const fullUrl = sqLink.startsWith("http")
        ? sqLink
        : `https://maiyuri-bricks-app.vercel.app${sqLink}`;
      console.log("\n=== NAVIGATING TO SMART QUOTE PAGE ===");
      console.log("URL:", fullUrl);

      await page.goto(fullUrl);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);

      // Verify redesign elements
      console.log("\n=== VERIFYING STEVE JOBS REDESIGN ===\n");

      const checks = [
        { name: "Hero section", selector: '[data-section="hero"]' },
        { name: "Trust chips (2-3 minutes)", selector: 'text="2–3 minutes"' },
        {
          name: "Made For You section",
          selector: '[data-section="made_for_you"]',
        },
        {
          name: "Why Chennai Works section",
          selector: '[data-section="why_chennai_works"]',
        },
        {
          name: "Proof Teaser section",
          selector: '[data-section="proof_teaser"]',
        },
        {
          name: "Smart Range section",
          selector: '[data-section="smart_range"]',
        },
        {
          name: "Objection Handling section",
          selector: '[data-section="objection_handling"]',
        },
        { name: "Final CTA section", selector: '[data-section="final_cta"]' },
      ];

      let passed = 0;
      let failed = 0;

      for (const check of checks) {
        const element = await page.locator(check.selector).first();
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          console.log(`✓ ${check.name}`);
          passed++;
        } else {
          console.log(`✗ ${check.name} NOT FOUND`);
          failed++;
        }
      }

      console.log(
        `\n=== RESULTS: ${passed}/${checks.length} checks passed ===\n`,
      );

      // Screenshots
      await page.screenshot({ path: "test-results/sq-redesign-hero.png" });
      console.log("Screenshot: test-results/sq-redesign-hero.png");

      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(500);
      await page.screenshot({ path: "test-results/sq-redesign-chennai.png" });
      console.log("Screenshot: test-results/sq-redesign-chennai.png");

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await page.screenshot({ path: "test-results/sq-redesign-cta.png" });
      console.log("Screenshot: test-results/sq-redesign-cta.png");
    } else {
      console.log("\n⚠️  Could not find or create a Smart Quote.");
      console.log(
        "Please manually navigate to a lead and generate a Smart Quote.",
      );
      console.log("Then copy the /sq/[slug] URL for testing.\n");
    }

    console.log("\n=== KEEPING BROWSER OPEN FOR 45 SECONDS ===");
    console.log("You can manually navigate and inspect the redesign...\n");
    await page.waitForTimeout(45000);
  } catch (error) {
    console.error("Error during test:", error);
  } finally {
    await browser.close();
    console.log("Browser closed. Test completed!");
  }
}

testSmartQuoteRedesign();
