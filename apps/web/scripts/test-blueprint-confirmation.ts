/**
 * Test Blueprint Confirmation and Isometric Generation
 * Verifies the two-phase generation: blueprint → confirmation → isometric reveal
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(
  __dirname,
  "../playwright-report/production-test/blueprint-confirmation",
);

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testBlueprintConfirmation() {
  console.log("🧪 Testing Blueprint Confirmation and Isometric Generation\n");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const results: { step: string; status: string; time: number }[] = [];

  try {
    // Navigate to design page
    console.log("1️⃣  Navigating to /design...");
    const navStart = Date.now();
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    results.push({
      step: "Navigate",
      status: "✅",
      time: Date.now() - navStart,
    });

    // Enter client name
    console.log("2️⃣  Entering client name...");
    const clientInput = page.locator('input[name="clientName"]').first();
    await clientInput.waitFor({ state: "visible", timeout: 10000 });
    await clientInput.fill("Blueprint Test - " + new Date().toISOString());
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    results.push({ step: "Client Name", status: "✅", time: 0 });

    // Select residential
    console.log("3️⃣  Selecting residential...");
    const residentialOption = page
      .locator("button")
      .filter({ hasText: "Residential House" })
      .first();
    await residentialOption.waitFor({ state: "visible", timeout: 10000 });
    await residentialOption.click();
    await page.waitForTimeout(2000);
    results.push({ step: "Project Type", status: "✅", time: 0 });

    // Select manual entry
    console.log("4️⃣  Selecting manual entry...");
    const manualOption = page
      .locator("button")
      .filter({ hasText: "Enter Manually" })
      .first();
    await manualOption.waitFor({ state: "visible", timeout: 10000 });
    await manualOption.click();
    await page.waitForTimeout(2000);
    results.push({ step: "Manual Entry", status: "✅", time: 0 });

    // Enter plot dimensions
    console.log("5️⃣  Entering plot dimensions...");
    await page.locator('input[name="north"]').fill("60");
    await page.locator('input[name="south"]').fill("60");
    await page.locator('input[name="east"]').fill("40");
    await page.locator('input[name="west"]').fill("40");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    results.push({ step: "Plot Dimensions", status: "✅", time: 0 });

    // Select road side
    console.log("6️⃣  Selecting road side (East)...");
    const eastOption = page
      .locator("button")
      .filter({ hasText: "East" })
      .first();
    await eastOption.waitFor({ state: "visible", timeout: 10000 });
    await eastOption.click();
    await page.waitForTimeout(2000);
    results.push({ step: "Road Side", status: "✅", time: 0 });

    // Enter setbacks
    console.log("7️⃣  Entering setbacks...");
    const northSetback = page.locator('input[name="north"]').last();
    const southSetback = page.locator('input[name="south"]').last();
    const eastSetback = page.locator('input[name="east"]').last();
    const westSetback = page.locator('input[name="west"]').last();
    await northSetback.fill("5");
    await southSetback.fill("5");
    await eastSetback.fill("10");
    await westSetback.fill("5");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    results.push({ step: "Setbacks", status: "✅", time: 0 });

    // Answer remaining questions quickly
    console.log("8️⃣  Answering remaining questions...");
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1500);
      const optionButtons = page
        .locator("button")
        .filter({ hasText: /^[A-Z]/ });
      const buttonCount = await optionButtons.count();
      if (buttonCount > 0) {
        await optionButtons.first().click();
      } else {
        break;
      }
    }
    results.push({ step: "Remaining Questions", status: "✅", time: 0 });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "01-questions-complete.png"),
      fullPage: true,
    });

    // Wait for blueprint confirmation UI
    console.log("9️⃣  Waiting for blueprint confirmation UI...");
    const confirmStart = Date.now();
    let confirmationFound = false;

    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(3000);
      const bodyText = await page.locator("body").innerText();

      // Check for confirmation message
      if (
        bodyText.includes("blueprint is ready") ||
        bodyText.includes("Please review") ||
        bodyText.includes("before I generate the 3D")
      ) {
        console.log(`   ✅ Blueprint confirmation message found! (${i * 3}s)`);
        confirmationFound = true;

        // Wait for confirmation button
        await page.waitForTimeout(2000);
        const confirmBtn = page
          .locator("button")
          .filter({ hasText: "Confirm" })
          .first();
        const confirmCount = await confirmBtn.count();

        if (confirmCount > 0) {
          console.log("   ✅ Confirm button found!");
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "02-blueprint-confirmation.png"),
            fullPage: true,
          });
          results.push({
            step: "Blueprint Confirmation UI",
            status: "✅ FOUND",
            time: Date.now() - confirmStart,
          });

          // Click confirm button
          console.log("🔟 Clicking confirm button...");
          const clickStart = Date.now();
          await confirmBtn.click();
          await page.waitForTimeout(3000);
          results.push({
            step: "Confirm Click",
            status: "✅",
            time: Date.now() - clickStart,
          });
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "03-after-confirm.png"),
            fullPage: true,
          });

          // Wait for isometric view reveal
          console.log("1️⃣1️⃣  Waiting for isometric view...");
          const isometricStart = Date.now();
          let isometricFound = false;

          for (let j = 0; j < 30; j++) {
            await page.waitForTimeout(2000);
            const currentText = await page.locator("body").innerText();

            if (
              currentText.includes("3D Isometric") ||
              currentText.includes("design is complete") ||
              currentText.includes("Isometric View")
            ) {
              console.log(`   ✅ Isometric view revealed! (${j * 2}s)`);
              isometricFound = true;
              await page.screenshot({
                path: join(SCREENSHOTS_DIR, "04-isometric-revealed.png"),
                fullPage: true,
              });
              results.push({
                step: "Isometric View Revealed",
                status: "✅ FOUND",
                time: Date.now() - isometricStart,
              });
              break;
            }
          }

          if (!isometricFound) {
            console.log("   ⚠️  Isometric view not detected within timeout");
            results.push({
              step: "Isometric View",
              status: "⚠️ NOT DETECTED",
              time: 0,
            });
            await page.screenshot({
              path: join(SCREENSHOTS_DIR, "04-no-isometric.png"),
              fullPage: true,
            });
          }

          break;
        } else {
          console.log("   ⚠️  Confirmation message found but no button");
        }
      }

      // Check if generation is still in progress
      if (bodyText.includes("Generating") || bodyText.includes("%")) {
        if (i % 5 === 0) {
          console.log(`   Still generating... (${i * 3}s)`);
        }
      }
    }

    if (!confirmationFound) {
      console.log("   ❌ Blueprint confirmation UI not found");
      results.push({
        step: "Blueprint Confirmation UI",
        status: "❌ NOT FOUND",
        time: 0,
      });
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "02-no-confirmation.png"),
        fullPage: true,
      });
    }

    console.log("\nKeeping browser open for 30 seconds for inspection...");
    await page.waitForTimeout(30000);
  } catch (error) {
    console.error("❌ Test error:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "error.png"),
      fullPage: true,
    });
  } finally {
    // Print results
    console.log("\n" + "═".repeat(60));
    console.log("TEST RESULTS SUMMARY");
    console.log("═".repeat(60));
    results.forEach((r) => {
      console.log(
        `${r.status.padEnd(15)} ${r.step.padEnd(35)} ${r.time > 0 ? `(${Math.round(r.time / 1000)}s)` : ""}`,
      );
    });
    console.log("═".repeat(60));
    console.log(`📸 Screenshots saved: ${SCREENSHOTS_DIR}`);
    console.log("═".repeat(60) + "\n");

    await browser.close();
  }
}

testBlueprintConfirmation().catch(console.error);
