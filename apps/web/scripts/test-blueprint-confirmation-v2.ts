/**
 * Test Blueprint Confirmation and Isometric Generation (V2 - Better question handling)
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(
  __dirname,
  "../playwright-report/production-test/blueprint-v2",
);

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testBlueprintConfirmation() {
  console.log(
    "🧪 Testing Blueprint Confirmation and Isometric Generation (V2)\n",
  );

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Navigate
    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // Client name
    console.log("2️⃣  Entering client name...");
    const clientInput = page.locator('input[name="clientName"]').first();
    await clientInput.waitFor({ state: "visible", timeout: 10000 });
    await clientInput.fill("Blueprint Test V2 - " + new Date().toISOString());
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);

    // Residential
    console.log("3️⃣  Selecting residential...");
    await page
      .locator("button")
      .filter({ hasText: "Residential House" })
      .first()
      .click();
    await page.waitForTimeout(2000);

    // Manual entry
    console.log("4️⃣  Selecting manual entry...");
    await page
      .locator("button")
      .filter({ hasText: "Enter Manually" })
      .first()
      .click();
    await page.waitForTimeout(2000);

    // Plot dimensions
    console.log("5️⃣  Entering plot dimensions...");
    await page.locator('input[name="north"]').fill("60");
    await page.locator('input[name="south"]').fill("60");
    await page.locator('input[name="east"]').fill("40");
    await page.locator('input[name="west"]').fill("40");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);

    // Road side
    console.log("6️⃣  Selecting road side (East)...");
    await page.locator("button").filter({ hasText: "East" }).first().click();
    await page.waitForTimeout(2000);

    // Setbacks
    console.log("7️⃣  Entering setbacks...");
    await page.locator('input[name="north"]').last().fill("5");
    await page.locator('input[name="south"]').last().fill("5");
    await page.locator('input[name="east"]').last().fill("10");
    await page.locator('input[name="west"]').last().fill("5");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);

    // Answer ALL remaining questions
    console.log("8️⃣  Answering ALL remaining questions...");
    let questionCount = 0;

    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1500);
      const bodyText = await page.locator("body").innerText();

      // Check if generation has started
      if (
        bodyText.includes("Generating") ||
        bodyText.includes("Starting") ||
        bodyText.includes("%") ||
        bodyText.includes("Applying") ||
        bodyText.includes("blueprint")
      ) {
        console.log(
          `   ✅ Generation started after ${questionCount} questions!`,
        );
        break;
      }

      // Look for option buttons
      const optionButtons = page
        .locator("button")
        .filter({ hasText: /^[A-Z0-9]/ });
      const buttonCount = await optionButtons.count();

      if (buttonCount > 0) {
        const firstBtn = optionButtons.first();
        const btnText = await firstBtn.textContent();
        console.log(
          `   Question ${questionCount + 1}: Clicking "${btnText?.substring(0, 30)}..."`,
        );
        await firstBtn.click();
        questionCount++;
        await page.waitForTimeout(1500);
      } else {
        // No more questions visible
        console.log(
          `   No more questions found (answered ${questionCount} total)`,
        );
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "01-no-more-questions.png"),
          fullPage: true,
        });
        await page.waitForTimeout(2000);

        // Check one more time for generation
        const finalText = await page.locator("body").innerText();
        if (
          !finalText.includes("Generating") &&
          !finalText.includes("Starting")
        ) {
          console.log("   ⚠️  No generation detected - checking page state...");
          console.log(
            `   Page contains: ${finalText.substring(finalText.length - 200)}`,
          );
        }
        break;
      }
    }

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "02-after-questions.png"),
      fullPage: true,
    });

    // Wait for generation to start
    console.log("9️⃣  Monitoring for generation/blueprint...");
    let foundBlueprint = false;

    for (let i = 0; i < 80; i++) {
      await page.waitForTimeout(3000);
      const bodyText = await page.locator("body").innerText();

      // Log status every 15 seconds
      if (i % 5 === 0 && i > 0) {
        console.log(`   [${i * 3}s] Still waiting...`);
        if (i % 10 === 0) {
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, `03-status-${i}s.png`),
            fullPage: true,
          });
        }
      }

      // Check for generation progress
      if (bodyText.includes("Starting") || bodyText.includes("%")) {
        console.log(`   ✅ Generation in progress (${i * 3}s)`);
      }

      // Check for blueprint confirmation
      if (
        bodyText.includes("blueprint is ready") ||
        bodyText.includes("Please review") ||
        bodyText.includes("before I generate the 3D") ||
        (bodyText.includes("Confirm") && bodyText.includes("Reject"))
      ) {
        console.log(
          `\n✅ ✅ ✅ BLUEPRINT CONFIRMATION UI FOUND! (${i * 3}s)\n`,
        );
        foundBlueprint = true;

        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "04-blueprint-confirmation.png"),
          fullPage: true,
        });

        // Wait a bit and click Confirm
        await page.waitForTimeout(2000);
        const confirmBtn = page
          .locator("button")
          .filter({ hasText: "Confirm" })
          .first();
        const confirmCount = await confirmBtn.count();

        if (confirmCount > 0) {
          console.log("🔟 Clicking Confirm button...");
          await confirmBtn.click();
          await page.waitForTimeout(3000);
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "05-after-confirm.png"),
            fullPage: true,
          });

          // Wait for isometric reveal
          console.log("1️⃣1️⃣  Waiting for isometric reveal...");
          for (let j = 0; j < 20; j++) {
            await page.waitForTimeout(2000);
            const currentText = await page.locator("body").innerText();

            if (
              currentText.includes("3D Isometric") ||
              currentText.includes("design is complete") ||
              currentText.includes("Isometric View")
            ) {
              console.log(`\n✅ ✅ ✅ ISOMETRIC VIEW REVEALED! (${j * 2}s)\n`);
              await page.screenshot({
                path: join(SCREENSHOTS_DIR, "06-isometric-complete.png"),
                fullPage: true,
              });
              break;
            }
          }
        }
        break;
      }

      // Check for errors
      if (
        bodyText.includes("encountered an issue") ||
        bodyText.includes("error")
      ) {
        console.log(`\n❌ ERROR DETECTED (${i * 3}s)\n`);
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "04-error.png"),
          fullPage: true,
        });
        break;
      }
    }

    if (!foundBlueprint) {
      console.log(
        "\n❌ Blueprint confirmation UI was not found within timeout\n",
      );
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "04-timeout.png"),
        fullPage: true,
      });
    }

    console.log("\n📸 Keeping browser open for inspection (30s)...\n");
    await page.waitForTimeout(30000);
  } catch (error) {
    console.error("❌ Test error:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "error.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

testBlueprintConfirmation().catch(console.error);
