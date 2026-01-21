/**
 * Test question flow progression after client name
 * Verifies that clicking Continue after entering client name shows next question
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(__dirname, "../playwright-report/production-test");

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testQuestionFlow() {
  console.log("🔍 Testing Question Flow Progression\n");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    await page.waitForTimeout(10000);
    console.log("✅ Page loaded\n");

    // Get text content before entering client name
    console.log("2️⃣  Checking initial state...");
    let bodyText = await page.locator("body").innerText();
    console.log(
      `Text includes "client or project name": ${bodyText.includes("client or project name")}`,
    );
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "flow-01-initial.png"),
      fullPage: true,
    });

    // Enter client name
    console.log("\n3️⃣  Entering client name...");
    const clientNameInput = page.locator('input[name="clientName"]').first();
    await clientNameInput.waitFor({ state: "visible", timeout: 10000 });
    await clientNameInput.fill("Test Client - Flow Check");

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "flow-02-before-submit.png"),
      fullPage: true,
    });

    // Click Continue
    console.log("4️⃣  Clicking Continue...");
    const continueButton = page.locator('button[type="submit"]').first();
    await continueButton.click();

    // Wait for next question
    console.log("5️⃣  Waiting for next question (5 seconds)...");
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "flow-03-after-submit.png"),
      fullPage: true,
    });

    // Check what question we got
    console.log("\n6️⃣  Analyzing current state...");
    bodyText = await page.locator("body").innerText();

    const hasClientNameAgain = bodyText
      .toLowerCase()
      .includes("client or project name");
    const hasProjectType =
      bodyText.toLowerCase().includes("what would you like to design") ||
      bodyText.toLowerCase().includes("residential") ||
      bodyText.toLowerCase().includes("compound wall");
    const hasConfirmation = bodyText.includes("Perfect! I'll create files");

    console.log(`\nResults:`);
    console.log(
      `  Confirmation message shown: ${hasConfirmation ? "✅" : "❌"}`,
    );
    console.log(
      `  Client name question again: ${hasClientNameAgain ? "❌ BUG!" : "✅"}`,
    );
    console.log(
      `  Project type question shown: ${hasProjectType ? "✅" : "❌"}`,
    );

    // Count how many times "client" appears in questions
    const clientMatches = bodyText.match(/client or project name/gi);
    const clientCount = clientMatches ? clientMatches.length : 0;
    console.log(`\n  "client or project name" appears ${clientCount} times`);

    if (clientCount > 1) {
      console.log(
        "\n❌ ❌ ❌ BUG CONFIRMED: Client name question asked multiple times!",
      );
    } else if (hasProjectType) {
      console.log(
        "\n✅ ✅ ✅ SUCCESS: Flow progressed to project type question!",
      );
    } else {
      console.log(
        "\n⚠️  UNCLEAR: Neither client name repeated nor project type shown",
      );
    }

    // Get all visible chat messages
    console.log("\n7️⃣  Chat message count:");
    const messages = page.locator('[class*="flex"][class*="justify-"]').filter({
      has: page.locator('div[class*="px-4"][class*="py-3"]'),
    });
    const messageCount = await messages.count();
    console.log(`   Total messages: ${messageCount}`);

    // Print visible text for debugging
    console.log("\n8️⃣  Visible text (first 1200 chars):");
    console.log("-----------------------------------");
    console.log(bodyText.substring(0, 1200));
    console.log("-----------------------------------\n");

    console.log("Keeping browser open for 20 seconds for inspection...");
    await page.waitForTimeout(20000);
  } catch (error) {
    console.error("❌ Test failed:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "flow-error.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

testQuestionFlow().catch(console.error);
