/**
 * E2E test for production design chatbot
 * Tests the complete user flow in production environment
 */

import puppeteer from "puppeteer";
import { writeFileSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(__dirname, "../playwright-report/production-test");

async function testProductionDesign() {
  console.log("🌐 Testing Production Design Chatbot\n");
  console.log(`URL: ${PRODUCTION_URL}/design\n`);

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    defaultViewport: { width: 1280, height: 720 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    // Enable console logging from browser
    page.on("console", (msg) => console.log("Browser Console:", msg.text()));
    page.on("pageerror", (error) =>
      console.error("Browser Error:", error.message),
    );

    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, {
      waitUntil: "networkidle2",
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

    const chatbotExists = (await page.$(".floor-plan-chatbot")) !== null;
    console.log(`Chatbot container exists: ${chatbotExists}`);

    // Check for input field
    const inputField =
      (await page.$('input[type="text"]')) || (await page.$("textarea"));
    console.log(`Input field exists: ${inputField !== null}`);

    if (inputField) {
      const inputType = await inputField.evaluate((el) => el.tagName);
      const inputPlaceholder = await inputField.evaluate(
        (el) => (el as HTMLInputElement).placeholder,
      );
      console.log(`Input type: ${inputType}`);
      console.log(`Input placeholder: ${inputPlaceholder}`);
    }

    // Check for refresh button
    const refreshButton =
      (await page.$('button:has-text("Refresh")')) ||
      (await page.$('button[aria-label*="refresh"]')) ||
      (await page.$('[role="button"]:has-text("Refresh")'));
    console.log(`Refresh button exists: ${refreshButton !== null}\n`);

    // Get all visible text content
    console.log("3️⃣  Extracting visible content...");
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("Visible text (first 500 chars):");
    console.log(bodyText.substring(0, 500));
    console.log("\n");

    // Check for any error messages
    const errorElements = await page.$$('[role="alert"], .error, .alert-error');
    if (errorElements.length > 0) {
      console.log("⚠️  Error messages found:");
      for (const el of errorElements) {
        const text = await el.evaluate((node) => node.textContent);
        console.log(`- ${text}`);
      }
      console.log("\n");
    }

    // Try to find all buttons
    console.log("4️⃣  Finding all buttons on page...");
    const buttons = await page.$$("button");
    console.log(`Total buttons found: ${buttons.length}`);
    for (let i = 0; i < buttons.length; i++) {
      const btnText = await buttons[i].evaluate((btn) =>
        btn.textContent?.trim(),
      );
      const btnDisabled = await buttons[i].evaluate((btn) => btn.disabled);
      const btnClass = await buttons[i].evaluate((btn) => btn.className);
      console.log(
        `Button ${i + 1}: "${btnText}" (disabled: ${btnDisabled}, class: ${btnClass})`,
      );
    }
    console.log("\n");

    // Check if page requires authentication
    console.log("5️⃣  Checking authentication status...");
    const currentUrl = page.url();
    if (currentUrl.includes("login") || currentUrl.includes("auth")) {
      console.log("❌ Redirected to login page - authentication required");
      console.log(`Current URL: ${currentUrl}\n`);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "02-auth-redirect.png"),
        fullPage: true,
      });
    } else {
      console.log("✅ No auth redirect detected\n");
    }

    // Try to interact with the page
    console.log("6️⃣  Attempting to find interactive elements...");

    // Look for any input elements
    const allInputs = await page.$$("input, textarea, select");
    console.log(`Total input elements found: ${allInputs.length}`);

    for (let i = 0; i < allInputs.length; i++) {
      const input = allInputs[i];
      const tagName = await input.evaluate((el) => el.tagName);
      const type = await input.evaluate((el) => (el as HTMLInputElement).type);
      const name = await input.evaluate((el) => (el as HTMLInputElement).name);
      const visible = await input.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      console.log(
        `Input ${i + 1}: <${tagName} type="${type}" name="${name}" visible="${visible}">`,
      );
    }
    console.log("\n");

    // Check HTML structure
    console.log("7️⃣  Analyzing page structure...");
    const mainContent = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main
        ? main.outerHTML.substring(0, 1000)
        : "No <main> element found";
    });
    console.log("Main content structure (first 1000 chars):");
    console.log(mainContent);
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
    if (refreshButton) {
      console.log("9️⃣  Testing refresh button...");
      await refreshButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "04-after-refresh.png"),
        fullPage: true,
      });
      console.log("📸 Screenshot saved: 04-after-refresh.png\n");
    }

    // Get network requests
    console.log("🔟 Network activity...");
    const requests = await page.evaluate(() => {
      return (performance as any)
        .getEntriesByType("resource")
        .map((r: any) => ({
          name: r.name,
          type: r.initiatorType,
          duration: r.duration,
        }))
        .filter((r: any) => r.name.includes("api"));
    });
    console.log("API requests made:");
    console.log(JSON.stringify(requests, null, 2));
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "error.png"),
      fullPage: true,
    });
  } finally {
    console.log("\n✅ Test complete. Screenshots saved to:", SCREENSHOTS_DIR);
    await browser.close();
  }
}

// Run the test
testProductionDesign().catch(console.error);
