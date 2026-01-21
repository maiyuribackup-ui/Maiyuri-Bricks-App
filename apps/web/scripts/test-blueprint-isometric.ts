/**
 * Test Blueprint Confirmation and Isometric Generation
 * Tests the complete two-phase generation flow
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL = "https://maiyuri-bricks-app.vercel.app";
const SCREENSHOTS_DIR = join(
  __dirname,
  "../playwright-report/production-test/blueprint-isometric",
);

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testBlueprintAndIsometric() {
  console.log("🧪 Testing Blueprint Confirmation and Isometric Generation\n");
  console.log(`📍 Testing against: ${PRODUCTION_URL}\n`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const results: { step: string; status: string; time: number }[] = [];

  try {
    // Navigate
    console.log("1️⃣  Navigating to /design...");
    const navStart = Date.now();
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    results.push({
      step: "Navigate",
      status: "✅",
      time: Date.now() - navStart,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "01-loaded.png"),
      fullPage: true,
    });

    // Client name
    console.log("2️⃣  Entering client name...");
    const clientInput = page.locator('input[name="clientName"]').first();
    await clientInput.waitFor({ state: "visible", timeout: 10000 });
    await clientInput.fill("Blueprint Test - " + new Date().toISOString());
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    results.push({ step: "Client Name", status: "✅", time: 0 });

    // Residential
    console.log("3️⃣  Selecting residential...");
    await page
      .locator("button")
      .filter({ hasText: "Residential House" })
      .first()
      .click();
    await page.waitForTimeout(2000);
    results.push({ step: "Project Type", status: "✅", time: 0 });

    // Manual entry
    console.log("4️⃣  Selecting manual entry...");
    await page
      .locator("button")
      .filter({ hasText: "Enter Manually" })
      .first()
      .click();
    await page.waitForTimeout(2000);
    results.push({ step: "Manual Entry", status: "✅", time: 0 });

    // Plot dimensions
    console.log("5️⃣  Entering plot dimensions...");
    await page.locator('input[name="north"]').fill("60");
    await page.locator('input[name="south"]').fill("60");
    await page.locator('input[name="east"]').fill("40");
    await page.locator('input[name="west"]').fill("40");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    results.push({ step: "Plot Dimensions", status: "✅", time: 0 });

    // Road side
    console.log("6️⃣  Selecting road side (East)...");
    await page.locator("button").filter({ hasText: "East" }).first().click();
    await page.waitForTimeout(2000);
    results.push({ step: "Road Side", status: "✅", time: 0 });

    // Setbacks
    console.log("7️⃣  Entering setbacks...");
    await page.locator('input[name="north"]').last().fill("5");
    await page.locator('input[name="south"]').last().fill("5");
    await page.locator('input[name="east"]').last().fill("10");
    await page.locator('input[name="west"]').last().fill("5");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    results.push({ step: "Setbacks", status: "✅", time: 0 });

    // Answer remaining questions - FIX: Only click enabled buttons
    console.log("8️⃣  Answering remaining questions...");
    let questionCount = 0;

    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1500);
      const bodyText = await page.locator("body").innerText();

      // Check if generation started
      if (
        bodyText.includes("Generating") ||
        bodyText.includes("Starting") ||
        bodyText.includes("%")
      ) {
        console.log(
          `   ✅ Generation started after ${questionCount} questions!`,
        );
        break;
      }

      // Only click ENABLED buttons (not disabled old questions)
      const enabledButtons = page
        .locator("button:not([disabled])")
        .filter({ hasText: /^[A-Z0-9]/ });
      const buttonCount = await enabledButtons.count();

      if (buttonCount > 0) {
        const firstBtn = enabledButtons.first();
        await firstBtn.click();
        questionCount++;
        console.log(`   Answered question ${questionCount}`);
      } else {
        console.log(`   No more enabled buttons found`);
        break;
      }
    }

    results.push({
      step: `Questions Answered (${questionCount})`,
      status: "✅",
      time: 0,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "02-questions-complete.png"),
      fullPage: true,
    });

    // Wait for blueprint confirmation
    console.log("9️⃣  Waiting for blueprint confirmation...");
    const confirmStart = Date.now();
    let confirmationFound = false;

    for (let i = 0; i < 80; i++) {
      await page.waitForTimeout(3000);
      const bodyText = await page.locator("body").innerText();

      // Log progress every 30s
      if (i % 10 === 0 && i > 0) {
        console.log(`   [${i * 3}s] Still waiting for blueprint...`);
      }

      // Check for blueprint confirmation
      if (
        bodyText.includes("blueprint is ready") ||
        bodyText.includes("Please review") ||
        bodyText.includes("before I generate the 3D")
      ) {
        console.log(
          `\n✅ ✅ ✅ BLUEPRINT CONFIRMATION UI FOUND! (${i * 3}s)\n`,
        );
        confirmationFound = true;
        results.push({
          step: "Blueprint Confirmation",
          status: "✅ FOUND",
          time: Date.now() - confirmStart,
        });

        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "03-blueprint-confirmation.png"),
          fullPage: true,
        });

        // Click Confirm button
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
          results.push({ step: "Confirm Clicked", status: "✅", time: 0 });
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "04-after-confirm.png"),
            fullPage: true,
          });

          // Wait for isometric reveal
          console.log("1️⃣1️⃣  Waiting for isometric view reveal...");
          let isometricFound = false;

          for (let j = 0; j < 30; j++) {
            await page.waitForTimeout(2000);
            const currentText = await page.locator("body").innerText();

            if (
              currentText.includes("3D Isometric") ||
              currentText.includes("design is complete") ||
              currentText.includes("Isometric View")
            ) {
              console.log(`\n✅ ✅ ✅ ISOMETRIC VIEW REVEALED! (${j * 2}s)\n`);
              isometricFound = true;
              results.push({
                step: "Isometric Revealed",
                status: "✅ FOUND",
                time: j * 2000,
              });
              await page.screenshot({
                path: join(SCREENSHOTS_DIR, "05-isometric-complete.png"),
                fullPage: true,
              });
              break;
            }
          }

          if (!isometricFound) {
            console.log("\n⚠️  Isometric view not revealed within timeout\n");
            results.push({
              step: "Isometric Revealed",
              status: "⚠️ NOT FOUND",
              time: 0,
            });
            await page.screenshot({
              path: join(SCREENSHOTS_DIR, "05-no-isometric.png"),
              fullPage: true,
            });
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
        results.push({
          step: "Blueprint Generation",
          status: "❌ ERROR",
          time: Date.now() - confirmStart,
        });
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "03-error.png"),
          fullPage: true,
        });
        break;
      }
    }

    if (!confirmationFound) {
      console.log("\n❌ Blueprint confirmation UI not found within timeout\n");
      results.push({
        step: "Blueprint Confirmation",
        status: "❌ NOT FOUND",
        time: 0,
      });
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "03-timeout.png"),
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
    results.push({ step: "Test Execution", status: "❌ ERROR", time: 0 });
  } finally {
    // Print results
    console.log("\n" + "═".repeat(70));
    console.log("TEST RESULTS SUMMARY");
    console.log("═".repeat(70));
    results.forEach((r) => {
      console.log(
        `${r.status.padEnd(15)} ${r.step.padEnd(40)} ${r.time > 0 ? `(${Math.round(r.time / 1000)}s)` : ""}`,
      );
    });
    console.log("═".repeat(70));
    console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
    console.log("═".repeat(70) + "\n");

    await browser.close();
  }
}

testBlueprintAndIsometric().catch(console.error);
