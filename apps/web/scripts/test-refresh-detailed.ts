/**
 * Detailed refresh button test - checks actual message content
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(__dirname, "../playwright-report/production-test");

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testRefreshDetailed() {
  console.log("🔄 Detailed Refresh Button Test\n");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    await page.waitForTimeout(10000);
    console.log("✅ Page loaded and initialized\n");

    // Get all visible text BEFORE refresh
    console.log("2️⃣  Content BEFORE refresh:");
    const bodyTextBefore = await page.locator("body").innerText();
    console.log("--- Text content (first 800 chars) ---");
    console.log(bodyTextBefore.substring(0, 800));
    console.log("--- End of text content ---\n");

    const hasWelcomeBefore =
      bodyTextBefore.includes("Welcome") ||
      bodyTextBefore.includes("Floor Plan Designer");
    const hasQuestionBefore =
      bodyTextBefore.includes("client") && bodyTextBefore.includes("project");
    const hasInputBefore = await page
      .locator('input[name="clientName"]')
      .isVisible()
      .catch(() => false);

    console.log(`✓ Welcome message: ${hasWelcomeBefore}`);
    console.log(`✓ First question: ${hasQuestionBefore}`);
    console.log(`✓ Input field: ${hasInputBefore}\n`);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "detailed-before-refresh.png"),
      fullPage: true,
    });

    // Click refresh button
    console.log("3️⃣  Clicking refresh button...");
    const refreshButton = page.locator('button[title="Start new design"]');
    await refreshButton.click();
    console.log("✅ Refresh button clicked\n");

    // Wait for re-initialization
    console.log("4️⃣  Waiting for re-initialization (8 seconds)...");
    await page.waitForTimeout(8000);

    // Get all visible text AFTER refresh
    console.log("5️⃣  Content AFTER refresh:");
    const bodyTextAfter = await page.locator("body").innerText();
    console.log("--- Text content (first 800 chars) ---");
    console.log(bodyTextAfter.substring(0, 800));
    console.log("--- End of text content ---\n");

    const hasWelcomeAfter =
      bodyTextAfter.includes("Welcome") ||
      bodyTextAfter.includes("Floor Plan Designer");
    const hasQuestionAfter =
      bodyTextAfter.includes("client") && bodyTextAfter.includes("project");
    const hasInputAfter = await page
      .locator('input[name="clientName"]')
      .isVisible()
      .catch(() => false);

    console.log(`✓ Welcome message: ${hasWelcomeAfter}`);
    console.log(`✓ First question: ${hasQuestionAfter}`);
    console.log(`✓ Input field: ${hasInputAfter}\n`);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "detailed-after-refresh.png"),
      fullPage: true,
    });

    // Final verdict
    console.log("6️⃣  Final Verdict:");

    if (hasWelcomeAfter && hasQuestionAfter && hasInputAfter) {
      console.log("✅ ✅ ✅ REFRESH BUTTON WORKING PERFECTLY!");
      console.log("   All elements reappeared correctly after refresh\n");
    } else {
      console.log("⚠️  REFRESH BUTTON ISSUES:");
      if (!hasWelcomeAfter) console.log("   ❌ Welcome message missing");
      if (!hasQuestionAfter) console.log("   ❌ First question missing");
      if (!hasInputAfter) console.log("   ❌ Input field missing");
      console.log("");
    }

    // Check localStorage to see if session was cleared
    const sessionData = await page.evaluate(() => {
      return {
        chatSession: localStorage.getItem("floor-plan-chat-session"),
        supabaseSession: localStorage.getItem("floor-plan-supabase-session"),
      };
    });
    console.log("📦 LocalStorage after refresh:");
    console.log(
      `   chatSession: ${sessionData.chatSession ? "exists" : "null"}`,
    );
    console.log(
      `   supabaseSession: ${sessionData.supabaseSession ? "exists" : "null"}\n`,
    );

    console.log("Keeping browser open for 15 seconds...");
    await page.waitForTimeout(15000);
  } catch (error) {
    console.error("❌ Test failed:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "detailed-refresh-error.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

testRefreshDetailed().catch(console.error);
