/**
 * Smart Quote Redesign Test - Full Flow
 * Uses "robin avadi" lead for testing
 */

import { chromium } from "playwright";

const LOGIN_EMAIL = "ram@maiyuri.app";
const LOGIN_PASSWORD = "TempPass123!";
const TEST_LEAD_NAME = "robin avadi";

async function testSmartQuoteRedesign() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Auto Login
    console.log("Navigating to login page...");
    await page.goto("https://maiyuri-bricks-app.vercel.app/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    console.log("Filling login credentials...");
    await page.fill('input[type="email"], input[name="email"]', LOGIN_EMAIL);
    await page.fill(
      'input[type="password"], input[name="password"]',
      LOGIN_PASSWORD,
    );

    console.log("Clicking login button...");
    await page.click('button[type="submit"]');

    await page.waitForURL("**/dashboard**", { timeout: 30000 });
    console.log("Login successful!");

    // Step 2: Go to Leads and search for robin avadi
    console.log("\nNavigating to Leads...");
    await page.goto("https://maiyuri-bricks-app.vercel.app/leads");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Search for the test lead
    console.log(`Searching for "${TEST_LEAD_NAME}"...`);
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill(TEST_LEAD_NAME);
      await page.waitForTimeout(2000);
    }

    // Step 3: Find and click the lead (exclude /leads/new)
    console.log("Looking for lead link...");
    const leadLinks = await page.locator('a[href^="/leads/"]').all();

    let leadHref: string | null = null;
    for (const link of leadLinks) {
      const href = await link.getAttribute("href");
      if (href && !href.includes("/new") && href.match(/\/leads\/[a-f0-9-]+/)) {
        leadHref = href;
        console.log("Found lead:", href);
        break;
      }
    }

    if (leadHref) {
      await page.goto(`https://maiyuri-bricks-app.vercel.app${leadHref}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      console.log("On lead detail page:", page.url());
      await page.screenshot({ path: "test-results/lead-detail.png" });

      // Step 4: Look for Smart Quote
      console.log("\nLooking for Smart Quote...");

      let sqUrl: string | null = null;

      // Check for existing link
      const sqLink = page.locator('a[href*="/sq/"]').first();
      if (await sqLink.isVisible()) {
        sqUrl = await sqLink.getAttribute("href");
        console.log("Found Smart Quote link:", sqUrl);
      }

      // Try clicking Smart Quote tab
      if (!sqUrl) {
        const tabs = await page.locator('button, [role="tab"]').all();
        for (const tab of tabs) {
          const text = await tab.textContent();
          if (text && text.toLowerCase().includes("quote")) {
            console.log("Clicking tab:", text);
            await tab.click();
            await page.waitForTimeout(2000);
            break;
          }
        }
      }

      // Try generate button
      if (!sqUrl) {
        const buttons = await page.locator("button").all();
        for (const btn of buttons) {
          const text = await btn.textContent();
          if (text && text.toLowerCase().includes("generate")) {
            console.log("Clicking button:", text);
            await btn.click();
            console.log("Waiting for generation (15s)...");
            await page.waitForTimeout(15000);
            await page.screenshot({ path: "test-results/after-generate.png" });

            // Check for new link
            const newLink = page.locator('a[href*="/sq/"]').first();
            if (await newLink.isVisible()) {
              sqUrl = await newLink.getAttribute("href");
            }
            break;
          }
        }
      }

      // Check for text containing /sq/
      if (!sqUrl) {
        const pageContent = await page.content();
        const sqMatch = pageContent.match(/\/sq\/([a-zA-Z0-9_-]+)/);
        if (sqMatch) {
          sqUrl = sqMatch[0];
          console.log("Found SQ in page content:", sqUrl);
        }
      }

      if (sqUrl) {
        const fullUrl = sqUrl.startsWith("http")
          ? sqUrl
          : `https://maiyuri-bricks-app.vercel.app${sqUrl}`;
        console.log("\n=== TESTING SMART QUOTE ===");
        console.log("URL:", fullUrl);

        const sqPage = await context.newPage();
        await sqPage.goto(fullUrl);
        await sqPage.waitForLoadState("networkidle");
        await sqPage.waitForTimeout(3000);

        console.log("\n=== VERIFYING STEVE JOBS REDESIGN ===\n");

        const sections = [
          { name: "Hero", selector: '[data-section="hero"]' },
          { name: "Made For You", selector: '[data-section="made_for_you"]' },
          {
            name: "Why Chennai Works",
            selector: '[data-section="why_chennai_works"]',
          },
          { name: "Proof Teaser", selector: '[data-section="proof_teaser"]' },
          { name: "Smart Range", selector: '[data-section="smart_range"]' },
          {
            name: "Objection Handling",
            selector: '[data-section="objection_handling"]',
          },
          { name: "Final CTA", selector: '[data-section="final_cta"]' },
        ];

        let passed = 0;
        for (const s of sections) {
          const el = sqPage.locator(s.selector).first();
          const visible = await el.isVisible().catch(() => false);
          if (visible) {
            console.log(`✓ ${s.name}`);
            passed++;
          } else {
            console.log(`✗ ${s.name}`);
          }
        }

        const trustChip = sqPage.locator('text="2–3 minutes"');
        if (await trustChip.isVisible().catch(() => false)) {
          console.log("✓ Trust chips");
          passed++;
        } else {
          console.log("✗ Trust chips");
        }

        console.log(`\n=== ${passed}/8 checks passed ===\n`);

        // Screenshots
        await sqPage.screenshot({ path: "test-results/sq-hero.png" });
        console.log("Screenshot: test-results/sq-hero.png");

        await sqPage.evaluate(() => window.scrollBy(0, 800));
        await sqPage.waitForTimeout(500);
        await sqPage.screenshot({ path: "test-results/sq-middle.png" });

        await sqPage.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await sqPage.waitForTimeout(500);
        await sqPage.screenshot({ path: "test-results/sq-bottom.png" });
        console.log("Screenshots saved to test-results/");
      } else {
        console.log("\n⚠️ No Smart Quote found");
        console.log("Browser stays open - generate manually...");
      }
    } else {
      console.log("No lead found matching search");
    }

    console.log("\n=== BROWSER OPEN 60s ===\n");
    await page.waitForTimeout(60000);
  } catch (error) {
    console.error("Error:", error);
    await page.screenshot({ path: "test-results/error.png" });
  } finally {
    await browser.close();
    console.log("Done!");
  }
}

testSmartQuoteRedesign();
