/**
 * Test Setback Question and Halting Behavior
 * Verifies that the setback question appears in flow and halted status is handled correctly
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(
  __dirname,
  "../playwright-report/production-test/setback-test",
);

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testSetbackAndHalting() {
  console.log("🧪 Testing Setback Question and Halting Behavior\n");

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
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "01-loaded.png"),
      fullPage: true,
    });

    // Enter client name
    console.log("2️⃣  Entering client name...");
    const clientStart = Date.now();
    const clientInput = page.locator('input[name="clientName"]').first();
    await clientInput.waitFor({ state: "visible", timeout: 10000 });
    await clientInput.fill("Setback Test - " + new Date().toISOString());
    const continueBtn = page.locator('button[type="submit"]').first();
    await continueBtn.click();
    await page.waitForTimeout(2000);
    results.push({
      step: "Client Name",
      status: "✅",
      time: Date.now() - clientStart,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "02-client-name.png"),
      fullPage: true,
    });

    // Select project type
    console.log("3️⃣  Selecting residential...");
    const projectStart = Date.now();
    await page.waitForTimeout(1000);
    const residentialOption = page
      .locator("button")
      .filter({ hasText: "Residential House" })
      .first();
    await residentialOption.waitFor({ state: "visible", timeout: 10000 });
    await residentialOption.click();
    await page.waitForTimeout(2000);
    results.push({
      step: "Project Type",
      status: "✅",
      time: Date.now() - projectStart,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "03-project-type.png"),
      fullPage: true,
    });

    // Select manual entry
    console.log("4️⃣  Selecting manual entry...");
    const manualStart = Date.now();
    await page.waitForTimeout(1000);
    const manualOption = page
      .locator("button")
      .filter({ hasText: "Enter Manually" })
      .first();
    await manualOption.waitFor({ state: "visible", timeout: 10000 });
    await manualOption.click();
    await page.waitForTimeout(2000);
    results.push({
      step: "Manual Entry",
      status: "✅",
      time: Date.now() - manualStart,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "04-manual-entry.png"),
      fullPage: true,
    });

    // Enter plot dimensions
    console.log("5️⃣  Entering plot dimensions...");
    const plotStart = Date.now();
    await page.waitForTimeout(1000);
    await page.locator('input[name="north"]').fill("60");
    await page.locator('input[name="south"]').fill("60");
    await page.locator('input[name="east"]').fill("40");
    await page.locator('input[name="west"]').fill("40");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    results.push({
      step: "Plot Dimensions",
      status: "✅",
      time: Date.now() - plotStart,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "05-plot-dims.png"),
      fullPage: true,
    });

    // Select road side
    console.log("6️⃣  Selecting road side (East)...");
    const roadStart = Date.now();
    await page.waitForTimeout(1000);
    const eastOption = page
      .locator("button")
      .filter({ hasText: "East" })
      .first();
    await eastOption.waitFor({ state: "visible", timeout: 10000 });
    await eastOption.click();
    await page.waitForTimeout(2000);
    results.push({
      step: "Road Side",
      status: "✅",
      time: Date.now() - roadStart,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "06-road-side.png"),
      fullPage: true,
    });

    // CHECK: Setback question should appear here
    console.log("7️⃣  CHECKING FOR SETBACK QUESTION...");
    await page.waitForTimeout(2000);
    const bodyText = await page.locator("body").innerText();
    const hasSetbackQuestion =
      bodyText.toLowerCase().includes("setback") ||
      bodyText.toLowerCase().includes("boundaries");

    if (hasSetbackQuestion) {
      console.log("✅ ✅ ✅ SETBACK QUESTION FOUND!");
      results.push({ step: "Setback Question", status: "✅ FOUND", time: 0 });

      // Enter setbacks
      console.log("8️⃣  Entering setback distances...");
      const setbackStart = Date.now();
      await page.waitForTimeout(1000);

      // Look for setback input fields
      const northSetback = page.locator('input[name="north"]').last();
      const southSetback = page.locator('input[name="south"]').last();
      const eastSetback = page.locator('input[name="east"]').last();
      const westSetback = page.locator('input[name="west"]').last();

      await northSetback.fill("5");
      await southSetback.fill("5");
      await eastSetback.fill("10"); // Front (road-facing)
      await westSetback.fill("5");

      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(2000);
      results.push({
        step: "Setback Entry",
        status: "✅",
        time: Date.now() - setbackStart,
      });
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "07-setbacks.png"),
        fullPage: true,
      });
    } else {
      console.log("❌ ❌ ❌ SETBACK QUESTION NOT FOUND!");
      results.push({ step: "Setback Question", status: "❌ MISSING", time: 0 });
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "07-no-setback.png"),
        fullPage: true,
      });
    }

    // Continue with remaining questions
    console.log("9️⃣  Answering remaining questions...");
    const questionsStart = Date.now();
    let questionCount = 0;

    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1500);

      // Check if there's a visible button with text (option questions)
      const optionButtons = page
        .locator("button")
        .filter({ hasText: /^[A-Z]/ });
      const buttonCount = await optionButtons.count();

      if (buttonCount > 0) {
        // Find and click the first recommended option or any option
        const recommendedBtn = optionButtons.first();
        await recommendedBtn.click();
        questionCount++;
        console.log(`   Answered question ${questionCount}`);
        await page.waitForTimeout(1500);
      } else {
        // Check if generation has started
        const generatingText = await page.locator("body").innerText();
        if (
          generatingText.includes("Generating") ||
          generatingText.includes("design")
        ) {
          console.log("   Generation started!");
          break;
        }
      }
    }

    results.push({
      step: `Remaining Questions (${questionCount})`,
      status: "✅",
      time: Date.now() - questionsStart,
    });
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "08-before-generation.png"),
      fullPage: true,
    });

    // Monitor for generation and halted status
    console.log("🔟 Monitoring generation status...");
    const monitorStart = Date.now();
    let generationStarted = false;
    let haltedDetected = false;
    let haltedScreenshotTaken = false;

    for (let i = 0; i < 60; i++) {
      // Monitor for up to 3 minutes
      await page.waitForTimeout(3000);
      const currentText = await page.locator("body").innerText();

      if (
        currentText.includes("Starting") ||
        currentText.includes("Generating") ||
        currentText.includes("%")
      ) {
        if (!generationStarted) {
          console.log(`   ✅ Generation started (${i * 3}s)`);
          generationStarted = true;
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "09-generation-started.png"),
            fullPage: true,
          });
        }
      }

      // Check for halted status with open questions
      if (
        currentText.toLowerCase().includes("clarification") ||
        currentText
          .toLowerCase()
          .includes("questions from our design agents") ||
        (currentText.includes("1.") &&
          currentText.includes("2.") &&
          currentText.includes("3."))
      ) {
        if (!haltedDetected) {
          console.log(`   🛑 HALTED STATUS DETECTED! (${i * 3}s)`);
          console.log("   Pipeline paused for human input");
          haltedDetected = true;
          results.push({
            step: "Halted Status",
            status: "✅ DETECTED",
            time: Date.now() - monitorStart,
          });

          // Extract open questions
          const questions = currentText.match(/\d+\.\s+.+/g);
          if (questions) {
            console.log(`   Found ${questions.length} open questions:`);
            questions.slice(0, 5).forEach((q) => console.log(`      ${q}`));
          }
        }

        if (!haltedScreenshotTaken) {
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "10-halted-with-questions.png"),
            fullPage: true,
          });
          haltedScreenshotTaken = true;
        }
      }

      // Check for blueprint or completion
      if (
        currentText.includes("blueprint is ready") ||
        currentText.includes("Review")
      ) {
        console.log(`   ✅ Blueprint ready! (${i * 3}s)`);
        results.push({
          step: "Blueprint Generated",
          status: "✅",
          time: Date.now() - monitorStart,
        });
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "11-blueprint.png"),
          fullPage: true,
        });
        break;
      }

      if (
        currentText.includes("encountered an issue") ||
        currentText.includes("error")
      ) {
        console.log(`   ❌ Error detected (${i * 3}s)`);
        results.push({
          step: "Generation",
          status: "❌ ERROR",
          time: Date.now() - monitorStart,
        });
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "11-error.png"),
          fullPage: true,
        });
        break;
      }

      // Stop monitoring after halted is detected and screenshot taken
      if (haltedDetected && haltedScreenshotTaken && i > 10) {
        console.log("   Stopping monitoring - halted state confirmed");
        break;
      }
    }

    if (!haltedDetected) {
      console.log(
        "   ⚠️  Halted status not detected (may have completed without halting)",
      );
      results.push({
        step: "Halted Status",
        status: "⚠️ NOT DETECTED",
        time: 0,
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
    console.log("\n" + "═".repeat(50));
    console.log("TEST RESULTS SUMMARY");
    console.log("═".repeat(50));
    results.forEach((r) => {
      console.log(
        `${r.status.padEnd(12)} ${r.step.padEnd(30)} ${r.time > 0 ? `(${Math.round(r.time / 1000)}s)` : ""}`,
      );
    });
    console.log("═".repeat(50));
    console.log(`📸 Screenshots saved: ${SCREENSHOTS_DIR}`);
    console.log("═".repeat(50) + "\n");

    await browser.close();
  }
}

testSetbackAndHalting().catch(console.error);
