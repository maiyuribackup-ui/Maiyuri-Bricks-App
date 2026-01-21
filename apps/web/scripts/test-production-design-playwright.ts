/**
 * E2E test for production design chatbot using Playwright
 * Tests the complete user flow in production environment
 */

import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(__dirname, "../playwright-report/production-test");

async function testProductionDesign() {
  console.log("🌐 Testing Production Design Chatbot\n");
  console.log(`URL: ${PRODUCTION_URL}/design\n`);

  const browser = await chromium.launch({
    headless: false, // Show browser for debugging
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // Enable console logging from browser
    page.on("console", (msg) => console.log("Browser Console:", msg.text()));
    page.on("pageerror", (error) =>
      console.error("Browser Error:", error.message),
    );

    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    console.log("✅ Page loaded\n");

    // Take initial screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "01-initial-load.png"),
      fullPage: true,
    });
    console.log("📸 Screenshot saved: 01-initial-load.png\n");

    // Check page title
    const title = await page.title();
    console.log(`Page Title: ${title}\n`);

    // Check for chatbot container
    console.log("2️⃣  Checking for chatbot elements...");

    const chatbotExists =
      (await page.locator(".floor-plan-chatbot").count()) > 0;
    console.log(`Chatbot container exists: ${chatbotExists}`);

    // Check for input field
    const textInput = page.locator('input[type="text"]').first();
    const textareaInput = page.locator("textarea").first();

    const inputFieldCount =
      (await textInput.count()) + (await textareaInput.count());
    console.log(`Input fields found: ${inputFieldCount}`);

    if ((await textInput.count()) > 0) {
      const placeholder = await textInput.getAttribute("placeholder");
      const visible = await textInput.isVisible();
      console.log(
        `Text input - placeholder: "${placeholder}", visible: ${visible}`,
      );
    }

    if ((await textareaInput.count()) > 0) {
      const placeholder = await textareaInput.getAttribute("placeholder");
      const visible = await textareaInput.isVisible();
      console.log(
        `Textarea - placeholder: "${placeholder}", visible: ${visible}`,
      );
    }

    // Check for refresh button
    const refreshButtons = page
      .locator("button")
      .filter({ hasText: "Refresh" });
    const refreshButtonCount = await refreshButtons.count();
    console.log(`Refresh buttons found: ${refreshButtonCount}\n`);

    // Get all visible text content
    console.log("3️⃣  Extracting visible content...");
    const bodyText = await page.locator("body").innerText();
    console.log("Visible text (first 500 chars):");
    console.log(bodyText.substring(0, 500));
    console.log("\n");

    // Check for any error messages
    const errorElements = page.locator('[role="alert"], .error, .alert-error');
    const errorCount = await errorElements.count();
    if (errorCount > 0) {
      console.log("⚠️  Error messages found:");
      for (let i = 0; i < errorCount; i++) {
        const text = await errorElements.nth(i).innerText();
        console.log(`- ${text}`);
      }
      console.log("\n");
    }

    // Try to find all buttons
    console.log("4️⃣  Finding all buttons on page...");
    const buttons = page.locator("button");
    const buttonCount = await buttons.count();
    console.log(`Total buttons found: ${buttonCount}`);
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const btn = buttons.nth(i);
      const btnText = await btn.innerText().catch(() => "");
      const btnDisabled = await btn.isDisabled();
      const btnVisible = await btn.isVisible();
      console.log(
        `Button ${i + 1}: "${btnText}" (disabled: ${btnDisabled}, visible: ${btnVisible})`,
      );
    }
    console.log("\n");

    // Check if page requires authentication
    console.log("5️⃣  Checking authentication status...");
    const currentUrl = page.url();
    if (
      currentUrl.includes("login") ||
      currentUrl.includes("auth") ||
      currentUrl.includes("dashboard")
    ) {
      console.log(
        "❌ Redirected to different page - might require authentication",
      );
      console.log(`Current URL: ${currentUrl}\n`);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "02-redirect.png"),
        fullPage: true,
      });
    } else {
      console.log("✅ Still on design page\n");
    }

    // Try to interact with the page
    console.log("6️⃣  Attempting to find interactive elements...");

    // Look for any input elements
    const allInputs = page.locator("input, textarea, select");
    const inputCount = await allInputs.count();
    console.log(`Total input elements found: ${inputCount}`);

    for (let i = 0; i < Math.min(inputCount, 10); i++) {
      const input = allInputs.nth(i);
      const tagName = await input.evaluate((el) => el.tagName);
      const type = await input.getAttribute("type");
      const name = await input.getAttribute("name");
      const visible = await input.isVisible();
      console.log(
        `Input ${i + 1}: <${tagName} type="${type}" name="${name}" visible="${visible}">`,
      );
    }
    console.log("\n");

    // Check HTML structure
    console.log("7️⃣  Analyzing page structure...");
    const mainContent = await page
      .locator("main")
      .first()
      .innerHTML()
      .catch(() => "No <main> element");
    console.log("Main content structure (first 1000 chars):");
    console.log(mainContent.substring(0, 1000));
    console.log("\n");

    // Wait a bit to see if anything loads dynamically
    console.log("8️⃣  Waiting for dynamic content (5 seconds)...");
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "03-after-wait.png"),
      fullPage: true,
    });
    console.log("📸 Screenshot saved: 03-after-wait.png\n");

    // Try clicking refresh button if it exists
    if (refreshButtonCount > 0) {
      console.log("9️⃣  Testing refresh button...");
      await refreshButtons.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "04-after-refresh.png"),
        fullPage: true,
      });
      console.log("📸 Screenshot saved: 04-after-refresh.png\n");
    }

    // Check for chatbot messages
    console.log("🔟 Checking for chatbot messages...");
    const messages = page.locator("[data-message], .message, .chat-message");
    const messageCount = await messages.count();
    console.log(`Chatbot messages found: ${messageCount}`);
    if (messageCount > 0) {
      for (let i = 0; i < Math.min(messageCount, 5); i++) {
        const text = await messages.nth(i).innerText();
        console.log(`Message ${i + 1}: ${text.substring(0, 100)}...`);
      }
    }
    console.log("\n");
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "error.png"),
      fullPage: true,
    });
  } finally {
    console.log("\n✅ Test complete. Screenshots saved to:", SCREENSHOTS_DIR);
    console.log("\nKeeping browser open for 10 seconds for inspection...");
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

// Run the test
testProductionDesign().catch(console.error);
