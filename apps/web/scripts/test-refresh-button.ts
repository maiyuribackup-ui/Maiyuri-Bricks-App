/**
 * Test refresh button functionality in production
 * Verifies that clicking refresh properly reinitializes the chatbot
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(__dirname, "../playwright-report/production-test");

// Ensure screenshots directory exists
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testRefreshButton() {
  console.log("🔄 Testing Refresh Button in Production\n");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    console.log("✅ Page loaded\n");

    // Wait for chatbot to initialize
    console.log("2️⃣  Waiting for chatbot to initialize (8 seconds)...");
    await page.waitForTimeout(8000);

    // Count initial messages
    const initialMessages = page
      .locator('[class*="flex"][class*="justify-"]')
      .filter({ has: page.locator('div[class*="px-4"][class*="py-3"]') });
    const initialCount = await initialMessages.count();
    console.log(`Initial messages count: ${initialCount}`);

    // Check for input field
    const initialInput = page.locator('input[name="clientName"]');
    const initialInputVisible = await initialInput
      .isVisible()
      .catch(() => false);
    console.log(`Initial input field visible: ${initialInputVisible}`);

    // Take screenshot before refresh
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "before-refresh.png"),
      fullPage: true,
    });
    console.log("📸 Screenshot saved: before-refresh.png\n");

    // Find and click refresh button
    console.log("3️⃣  Looking for refresh button...");

    // The refresh button is in the header with a circular arrow SVG
    const refreshButton = page.locator('button[title="Start new design"]');
    const refreshButtonExists = await refreshButton.count();
    console.log(`Refresh button found: ${refreshButtonExists > 0}`);

    if (refreshButtonExists === 0) {
      console.log(
        "❌ Refresh button not found! Looking for alternative selectors...",
      );

      // Try to find by SVG path (the circular arrow)
      const svgButton = page.locator('button:has(svg path[d*="M4 4v5"])');
      const svgButtonCount = await svgButton.count();
      console.log(`SVG-based button found: ${svgButtonCount > 0}`);

      if (svgButtonCount > 0) {
        console.log("✅ Found refresh button by SVG\n");
        console.log("4️⃣  Clicking refresh button...");
        await svgButton.click();
      } else {
        throw new Error("Could not find refresh button");
      }
    } else {
      console.log("✅ Found refresh button by title\n");
      console.log("4️⃣  Clicking refresh button...");
      await refreshButton.click();
    }

    // Wait for re-initialization
    console.log("Waiting for chatbot to reinitialize (5 seconds)...");
    await page.waitForTimeout(5000);

    // Count messages after refresh
    const afterMessages = page
      .locator('[class*="flex"][class*="justify-"]')
      .filter({ has: page.locator('div[class*="px-4"][class*="py-3"]') });
    const afterCount = await afterMessages.count();
    console.log(`Messages count after refresh: ${afterCount}`);

    // Check for input field after refresh
    const afterInput = page.locator('input[name="clientName"]');
    const afterInputVisible = await afterInput.isVisible().catch(() => false);
    console.log(`Input field visible after refresh: ${afterInputVisible}`);

    // Check for welcome message
    const welcomeMessage = page.locator("text=/Welcome.*Floor Plan Designer/i");
    const welcomeExists = (await welcomeMessage.count()) > 0;
    console.log(`Welcome message exists: ${welcomeExists}`);

    // Check for first question
    const questionText = page.locator("text=/client.*project.*name/i");
    const questionExists = (await questionText.count()) > 0;
    console.log(`First question exists: ${questionExists}\n`);

    // Take screenshot after refresh
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "after-refresh.png"),
      fullPage: true,
    });
    console.log("📸 Screenshot saved: after-refresh.png\n");

    // Verify refresh worked
    console.log("5️⃣  Verification Results:");

    if (afterCount >= 2 && afterInputVisible && questionExists) {
      console.log("✅ REFRESH BUTTON WORKING CORRECTLY!");
      console.log("   - Messages reappeared after refresh");
      console.log("   - Input field is visible");
      console.log("   - First question is displayed\n");
    } else {
      console.log("❌ REFRESH BUTTON NOT WORKING PROPERLY:");
      if (afterCount < 2) console.log("   - Messages did not reappear");
      if (!afterInputVisible) console.log("   - Input field not visible");
      if (!questionExists) console.log("   - First question not displayed\n");
    }

    // Keep browser open for manual inspection
    console.log("Keeping browser open for 15 seconds for manual inspection...");
    await page.waitForTimeout(15000);
  } catch (error) {
    console.error("❌ Test failed:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "refresh-test-error.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

testRefreshButton().catch(console.error);
