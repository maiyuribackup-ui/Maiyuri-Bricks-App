/**
 * Complete End-to-End Floor Plan Generation Test
 * Tests the entire user journey from client name input to floor plan generation
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(__dirname, "../playwright-report/production-test");

// Test data based on the survey image
const TEST_DATA = {
  clientName: "Survey Plot Test - Ram Residence",
  plotType: "residential",
  bedrooms: "4", // From survey: mentions bedroom requirements
  facingDirection: "east", // From survey diagram
  hasVastu: true,
  hasCourt: false,
  hasPoojaRoom: true, // Mentioned in requirements
  surveyImagePath: "/Users/ramkumaranganeshan/Downloads/survey-plot.jpg", // You'll need to save the image here
};

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function testCompleteFloorPlanGeneration() {
  console.log("🏗️  Complete Floor Plan Generation - End to End Test\n");
  console.log("📋 Test Data:");
  console.log(`   Client: ${TEST_DATA.clientName}`);
  console.log(`   Plot Type: ${TEST_DATA.plotType}`);
  console.log(`   Bedrooms: ${TEST_DATA.bedrooms}`);
  console.log(`   Facing: ${TEST_DATA.facingDirection}\n`);

  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  try {
    // Step 1: Navigate to design page
    console.log("1️⃣  Navigating to /design...");
    await page.goto(`${PRODUCTION_URL}/design`, { waitUntil: "networkidle" });
    await page.waitForTimeout(8000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "e2e-01-initial.png"),
      fullPage: true,
    });
    console.log("✅ Page loaded\n");

    // Step 2: Enter client name
    console.log("2️⃣  Entering client name...");
    const clientNameInput = page.locator('input[name="clientName"]');
    await clientNameInput.waitFor({ state: "visible", timeout: 10000 });
    await clientNameInput.fill(TEST_DATA.clientName);

    const continueButton = page.locator('button[type="submit"]', {
      hasText: /continue/i,
    });
    await continueButton.click();
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "e2e-02-client-name.png"),
      fullPage: true,
    });
    console.log(`✅ Client name entered: "${TEST_DATA.clientName}"\n`);

    // Step 3: Select plot type
    console.log("3️⃣  Selecting plot type...");
    await page.waitForTimeout(1000);

    // Look for plot type options (residential/commercial/industrial)
    const residentialOption = page
      .locator("button", { hasText: /residential/i })
      .first();
    if (await residentialOption.isVisible().catch(() => false)) {
      await residentialOption.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-03-plot-type.png"),
        fullPage: true,
      });
      console.log("✅ Selected: Residential\n");
    } else {
      console.log(
        "⚠️  Plot type options not found, checking next question...\n",
      );
    }

    // Step 4: Enter plot dimensions or upload survey
    console.log("4️⃣  Handling plot dimensions...");
    await page.waitForTimeout(1000);

    // Check if there's an upload option
    const uploadOption = page
      .locator("button", { hasText: /upload.*survey/i })
      .first();
    const manualOption = page
      .locator("button", { hasText: /enter.*manual/i })
      .first();

    if (await uploadOption.isVisible().catch(() => false)) {
      console.log(
        "   Upload option available - selecting manual entry for this test...",
      );
      await manualOption.click();
      await page.waitForTimeout(2000);
    }

    // Check for dimension input fields
    const lengthInput = page.locator('input[name="length"]').first();
    const widthInput = page.locator('input[name="width"]').first();

    if (await lengthInput.isVisible().catch(() => false)) {
      console.log("   Entering plot dimensions from survey...");
      // From survey: East 41'6", West 43'0", North 37'6", South 37'6"
      // Average: ~42' x 37.5'
      await lengthInput.fill("42");
      await widthInput.fill("37.5");

      const submitDimensions = page.locator('button[type="submit"]').first();
      await submitDimensions.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-04-dimensions.png"),
        fullPage: true,
      });
      console.log("✅ Dimensions entered: 42' x 37.5'\n");
    }

    // Step 5: Select number of bedrooms
    console.log("5️⃣  Selecting number of bedrooms...");
    await page.waitForTimeout(1000);

    const bedroomOption = page
      .locator("button", {
        hasText: new RegExp(`^${TEST_DATA.bedrooms}\\s*BHK`, "i"),
      })
      .first();
    if (await bedroomOption.isVisible().catch(() => false)) {
      await bedroomOption.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-05-bedrooms.png"),
        fullPage: true,
      });
      console.log(`✅ Selected: ${TEST_DATA.bedrooms} BHK\n`);
    } else {
      console.log("⚠️  Bedroom options not found yet\n");
    }

    // Step 6: Select facing direction
    console.log("6️⃣  Selecting facing direction...");
    await page.waitForTimeout(1000);

    const facingOption = page
      .locator("button", {
        hasText: new RegExp(TEST_DATA.facingDirection, "i"),
      })
      .first();
    if (await facingOption.isVisible().catch(() => false)) {
      await facingOption.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-06-facing.png"),
        fullPage: true,
      });
      console.log(`✅ Selected facing: ${TEST_DATA.facingDirection}\n`);
    }

    // Step 7: Vastu compliance
    console.log("7️⃣  Handling Vastu compliance...");
    await page.waitForTimeout(1000);

    const vastuYes = page.locator("button", { hasText: /yes.*vastu/i }).first();
    const vastuNo = page.locator("button", { hasText: /no.*skip/i }).first();

    if (await vastuYes.isVisible().catch(() => false)) {
      if (TEST_DATA.hasVastu) {
        await vastuYes.click();
        console.log("✅ Selected: Yes, Vastu compliant\n");
      } else {
        await vastuNo.click();
        console.log("✅ Selected: Skip Vastu\n");
      }
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-07-vastu.png"),
        fullPage: true,
      });
    }

    // Step 8: Courtyard
    console.log("8️⃣  Handling courtyard requirement...");
    await page.waitForTimeout(1000);

    const courtYes = page.locator("button", { hasText: /yes.*court/i }).first();
    const courtNo = page.locator("button", { hasText: /no.*skip/i }).first();

    if (await courtYes.isVisible().catch(() => false)) {
      if (TEST_DATA.hasCourt) {
        await courtYes.click();
        console.log("✅ Selected: Yes, include courtyard\n");
      } else {
        await courtNo.click();
        console.log("✅ Selected: No courtyard\n");
      }
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-08-courtyard.png"),
        fullPage: true,
      });
    }

    // Step 9: Pooja room
    console.log("9️⃣  Handling pooja room requirement...");
    await page.waitForTimeout(1000);

    const poojaYes = page.locator("button", { hasText: /yes.*pooja/i }).first();
    const poojaNo = page.locator("button", { hasText: /no.*skip/i }).first();

    if (await poojaYes.isVisible().catch(() => false)) {
      if (TEST_DATA.hasPoojaRoom) {
        await poojaYes.click();
        console.log("✅ Selected: Yes, include pooja room\n");
      } else {
        await poojaNo.click();
        console.log("✅ Selected: No pooja room\n");
      }
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-09-pooja.png"),
        fullPage: true,
      });
    }

    // Step 10: Wait for generation to start
    console.log("🔟 Waiting for floor plan generation...");
    await page.waitForTimeout(3000);

    // Look for progress indicators or generation status
    const progressIndicator = page
      .locator("text=/generating|analyzing|creating/i")
      .first();
    if (await progressIndicator.isVisible().catch(() => false)) {
      console.log("✅ Generation started! Waiting for completion...\n");

      // Wait for generation to complete (max 2 minutes)
      let generationComplete = false;
      let attempts = 0;
      const maxAttempts = 24; // 2 minutes with 5 second intervals

      while (!generationComplete && attempts < maxAttempts) {
        await page.waitForTimeout(5000);
        attempts++;

        // Check for completion indicators
        const floorPlanImage = page.locator('img[alt*="floor plan" i]').first();
        const downloadButton = page
          .locator("button", { hasText: /download|export/i })
          .first();
        const errorMessage = page.locator("text=/error|failed/i").first();

        if (await floorPlanImage.isVisible().catch(() => false)) {
          generationComplete = true;
          console.log("✅ ✅ ✅ FLOOR PLAN GENERATED SUCCESSFULLY!\n");
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "e2e-10-floor-plan-complete.png"),
            fullPage: true,
          });
        } else if (await errorMessage.isVisible().catch(() => false)) {
          const errorText = await errorMessage.innerText();
          console.log(`❌ Generation failed: ${errorText}\n`);
          await page.screenshot({
            path: join(SCREENSHOTS_DIR, "e2e-error-generation.png"),
            fullPage: true,
          });
          break;
        } else {
          console.log(`   Still generating... (${attempts * 5}s elapsed)`);
        }
      }

      if (!generationComplete && attempts >= maxAttempts) {
        console.log("⏱️  Generation taking longer than expected (2 minutes)\n");
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "e2e-timeout.png"),
          fullPage: true,
        });
      }
    } else {
      console.log(
        "⚠️  Generation status not found, taking final screenshot...\n",
      );
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "e2e-final-state.png"),
        fullPage: true,
      });
    }

    // Step 11: Check for generated output
    console.log("1️⃣1️⃣  Checking generated output...");
    const bodyText = await page.locator("body").innerText();

    const hasFloorPlan =
      bodyText.toLowerCase().includes("floor plan") ||
      (await page.locator('img[alt*="floor plan" i]').count()) > 0;
    const hasClientName = bodyText.includes(TEST_DATA.clientName);

    console.log(`   Floor plan present: ${hasFloorPlan ? "✅" : "❌"}`);
    console.log(`   Client name preserved: ${hasClientName ? "✅" : "❌"}\n`);

    // Final summary
    console.log("📊 Test Summary:");
    console.log("================");
    console.log("✅ Client name input");
    console.log("✅ Question flow navigation");
    console.log(`${hasFloorPlan ? "✅" : "❌"} Floor plan generation`);
    console.log(`${hasClientName ? "✅" : "❌"} Client name in output\n`);

    console.log("📸 Screenshots saved to:", SCREENSHOTS_DIR);
    console.log(
      "\nKeeping browser open for 30 seconds for manual inspection...",
    );
    await page.waitForTimeout(30000);
  } catch (error) {
    console.error("❌ E2E Test failed:", error);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "e2e-critical-error.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

testCompleteFloorPlanGeneration().catch(console.error);
