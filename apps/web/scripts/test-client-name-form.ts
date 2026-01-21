/**
 * Focused test for client name form in production
 */

import { chromium } from "@playwright/test";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";

async function testClientNameForm() {
  console.log("🧪 Testing Client Name Form in Production\n");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    console.log("✅ Page loaded\n");

    // Wait for chatbot to initialize
    console.log("2️⃣  Waiting for chatbot to initialize (10 seconds)...");
    await page.waitForTimeout(10000);

    // Look for the client name question text
    const questionText = await page
      .locator("text=/client.*project.*name/i")
      .first()
      .textContent();
    console.log(`Question found: "${questionText}"\n`);

    // Look for form elements
    console.log("3️⃣  Looking for form elements...");

    const forms = page.locator("form");
    const formCount = await forms.count();
    console.log(`Forms found: ${formCount}`);

    if (formCount > 0) {
      for (let i = 0; i < formCount; i++) {
        const form = forms.nth(i);
        const formHTML = await form.innerHTML();
        console.log(`\nForm ${i + 1} HTML (first 500 chars):`);
        console.log(formHTML.substring(0, 500));
        console.log("\n");
      }
    }

    // Look specifically for text inputs
    const textInputs = page.locator('input[type="text"]');
    const textInputCount = await textInputs.count();
    console.log(`\nText inputs found: ${textInputCount}`);

    if (textInputCount > 0) {
      for (let i = 0; i < textInputCount; i++) {
        const input = textInputs.nth(i);
        const name = await input.getAttribute("name");
        const placeholder = await input.getAttribute("placeholder");
        const visible = await input.isVisible();
        console.log(
          `Text input ${i + 1}: name="${name}", placeholder="${placeholder}", visible=${visible}`,
        );
      }
    }

    // Look for any inputs regardless of type
    const allInputs = page.locator("input");
    const allInputCount = await allInputs.count();
    console.log(`\nAll inputs found: ${allInputCount}`);

    // Look for submit buttons
    const submitButtons = page.locator('button[type="submit"]');
    const submitButtonCount = await submitButtons.count();
    console.log(`Submit buttons found: ${submitButtonCount}\n`);

    // Try to find the Continue button
    const continueButton = page.locator("text=/continue/i");
    const continueButtonCount = await continueButton.count();
    console.log(`Continue buttons found: ${continueButtonCount}\n`);

    // Check React DevTools info if available
    console.log("4️⃣  Checking component state...");
    const reactRoot = await page.evaluate(() => {
      const rootElement =
        document.querySelector("[data-message]") ||
        document.querySelector(".floor-plan-chatbot");
      if (rootElement) {
        return {
          exists: true,
          innerHTML: rootElement.innerHTML.substring(0, 500),
        };
      }
      return { exists: false };
    });
    console.log("React component check:", reactRoot);

    // Take screenshot
    await page.screenshot({
      path: "/Users/ramkumaranganeshan/Documents/Maiyuri_Bricks_App/apps/web/playwright-report/production-test/client-name-form-test.png",
      fullPage: true,
    });
    console.log("\n📸 Screenshot saved\n");

    // Keep browser open for manual inspection
    console.log("Keeping browser open for 30 seconds for manual inspection...");
    await page.waitForTimeout(30000);
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await browser.close();
  }
}

testClientNameForm().catch(console.error);
