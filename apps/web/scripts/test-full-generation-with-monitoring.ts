/**
 * Complete Floor Plan Generation Test with Agent Orchestration Monitoring
 * Tests the full flow from survey data input to floor plan generation
 * Monitors API calls, agent responses, and generation pipeline
 */

import { chromium, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const PRODUCTION_URL =
  "https://maiyuri-bricks-app-maiyuris-projects-10ac9ffa.vercel.app";
const SCREENSHOTS_DIR = join(
  __dirname,
  "../playwright-report/production-test/full-generation",
);
const REPORT_FILE = join(
  __dirname,
  "../playwright-report/production-test/generation-report.md",
);

// Survey data from the provided image
const SURVEY_DATA = {
  clientName: "Survey Plot - Production Test",
  projectType: "residential",
  plotDimensions: {
    north: "37.5",
    south: "37.5",
    east: "41.5",
    west: "43",
  },
  setbacks: {
    north: "3",
    south: "3",
    east: "7.5",
    west: "3",
  },
  roadSide: "east",
  roadWidth: "20",
  bedrooms: "3", // Based on requirements: Living, Dining, Kitchen, Double DRD
  facing: "east",
  hasVastu: true,
  hasCourt: false,
  hasPooja: false,
  parking: "2-wheeler",
  floors: "g+1", // Ground + 1 floor (staircase mentioned)
};

interface APICall {
  url: string;
  method: string;
  status: number;
  duration: number;
  timestamp: string;
  requestBody?: any;
  responseBody?: any;
}

interface TestReport {
  timestamp: string;
  testDuration: number;
  steps: {
    step: string;
    status: "success" | "failed" | "warning";
    duration: number;
    details: string;
  }[];
  apiCalls: APICall[];
  errors: string[];
  generationStatus: {
    started: boolean;
    completed: boolean;
    floorPlanGenerated: boolean;
    fileName?: string;
    duration?: number;
  };
  agentOrchestration: {
    planningServiceCalled: boolean;
    geminiApiCalled: boolean;
    pythonBackendCalled: boolean;
    supabaseUpload: boolean;
  };
}

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function monitorNetworkCalls(page: Page): Promise<APICall[]> {
  const apiCalls: APICall[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/api/") ||
      url.includes("supabase") ||
      url.includes("anthropic") ||
      url.includes("googleapis")
    ) {
      const call: Partial<APICall> = {
        url,
        method: request.method(),
        timestamp: new Date().toISOString(),
      };

      // Try to capture request body
      try {
        const postData = request.postData();
        if (postData) {
          call.requestBody = JSON.parse(postData);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("/api/") ||
      url.includes("supabase") ||
      url.includes("anthropic") ||
      url.includes("googleapis")
    ) {
      try {
        const call: APICall = {
          url,
          method: response.request().method(),
          status: response.status(),
          duration: 0, // Placeholder
          timestamp: new Date().toISOString(),
        };

        // Try to capture response body
        try {
          const body = await response.text();
          if (body) {
            call.responseBody = JSON.parse(body);
          }
        } catch (e) {
          // Ignore parsing errors
        }

        apiCalls.push(call);
      } catch (e) {
        console.error("Error capturing response:", e);
      }
    }
  });

  return apiCalls;
}

async function testFullGeneration() {
  console.log("🏗️  COMPLETE FLOOR PLAN GENERATION TEST");
  console.log("=====================================\n");
  console.log("📋 Survey Data:");
  console.log(`   Client: ${SURVEY_DATA.clientName}`);
  console.log(
    `   Dimensions: N=${SURVEY_DATA.plotDimensions.north}' S=${SURVEY_DATA.plotDimensions.south}' E=${SURVEY_DATA.plotDimensions.east}' W=${SURVEY_DATA.plotDimensions.west}'`,
  );
  console.log(
    `   Road: ${SURVEY_DATA.roadSide} facing, ${SURVEY_DATA.roadWidth}' wide`,
  );
  console.log(`   Bedrooms: ${SURVEY_DATA.bedrooms} BHK\n`);

  const report: TestReport = {
    timestamp: new Date().toISOString(),
    testDuration: 0,
    steps: [],
    apiCalls: [],
    errors: [],
    generationStatus: {
      started: false,
      completed: false,
      floorPlanGenerated: false,
    },
    agentOrchestration: {
      planningServiceCalled: false,
      geminiApiCalled: false,
      pythonBackendCalled: false,
      supabaseUpload: false,
    },
  };

  const startTime = Date.now();

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
  });
  const page = await browser.newPage();

  // Monitor network calls
  const apiCallsPromise = monitorNetworkCalls(page);

  try {
    // Step 1: Navigate
    console.log("1️⃣  Navigating to /design...");
    const stepStart = Date.now();
    await page.goto(`${PRODUCTION_URL}/design`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(8000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "01-initial.png"),
      fullPage: true,
    });
    report.steps.push({
      step: "Navigate to /design",
      status: "success",
      duration: Date.now() - stepStart,
      details: "Page loaded successfully",
    });
    console.log("✅ Loaded\n");

    // Step 2: Client Name
    console.log("2️⃣  Entering client name...");
    const step2Start = Date.now();
    const clientNameInput = page.locator('input[name="clientName"]').first();
    await clientNameInput.waitFor({ state: "visible", timeout: 10000 });
    await clientNameInput.fill(SURVEY_DATA.clientName);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "02-client-name.png"),
      fullPage: true,
    });
    report.steps.push({
      step: "Enter client name",
      status: "success",
      duration: Date.now() - step2Start,
      details: `Client name: ${SURVEY_DATA.clientName}`,
    });
    console.log(`✅ Client name: ${SURVEY_DATA.clientName}\n`);

    // Step 3: Project Type
    console.log("3️⃣  Selecting project type...");
    const step3Start = Date.now();
    await page.waitForTimeout(2000);
    const residentialBtn = page
      .locator("button", { hasText: /residential house/i })
      .first();
    if (await residentialBtn.isVisible().catch(() => false)) {
      await residentialBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "03-project-type.png"),
        fullPage: true,
      });
      report.steps.push({
        step: "Select project type",
        status: "success",
        duration: Date.now() - step3Start,
        details: "Residential house selected",
      });
      console.log("✅ Residential house\n");
    } else {
      report.steps.push({
        step: "Select project type",
        status: "warning",
        duration: Date.now() - step3Start,
        details: "Project type options not found",
      });
      console.log("⚠️  Project type options not visible\n");
    }

    // Step 4: Plot Input Method
    console.log("4️⃣  Selecting plot input method...");
    const step4Start = Date.now();
    await page.waitForTimeout(2000);
    const manualBtn = page
      .locator("button", { hasText: /enter.*manual/i })
      .first();
    if (await manualBtn.isVisible().catch(() => false)) {
      await manualBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "04-input-method.png"),
        fullPage: true,
      });
      report.steps.push({
        step: "Select plot input method",
        status: "success",
        duration: Date.now() - step4Start,
        details: "Manual entry selected",
      });
      console.log("✅ Manual entry\n");
    }

    // Step 5: Plot Dimensions
    console.log("5️⃣  Entering plot dimensions...");
    const step5Start = Date.now();
    await page.waitForTimeout(2000);

    const northInput = page.locator('input[name="north"]').first();
    const southInput = page.locator('input[name="south"]').first();
    const eastInput = page.locator('input[name="east"]').first();
    const westInput = page.locator('input[name="west"]').first();

    if (await northInput.isVisible().catch(() => false)) {
      await northInput.fill(SURVEY_DATA.plotDimensions.north);
      await southInput.fill(SURVEY_DATA.plotDimensions.south);
      await eastInput.fill(SURVEY_DATA.plotDimensions.east);
      await westInput.fill(SURVEY_DATA.plotDimensions.west);

      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "05-dimensions.png"),
        fullPage: true,
      });
      report.steps.push({
        step: "Enter plot dimensions",
        status: "success",
        duration: Date.now() - step5Start,
        details: `N=${SURVEY_DATA.plotDimensions.north}' S=${SURVEY_DATA.plotDimensions.south}' E=${SURVEY_DATA.plotDimensions.east}' W=${SURVEY_DATA.plotDimensions.west}'`,
      });
      console.log("✅ Dimensions entered\n");
    }

    // Step 6: Road Side
    console.log("6️⃣  Selecting road side...");
    const step6Start = Date.now();
    await page.waitForTimeout(2000);
    const roadBtn = page
      .locator("button", { hasText: new RegExp(SURVEY_DATA.roadSide, "i") })
      .first();
    if (await roadBtn.isVisible().catch(() => false)) {
      await roadBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "06-road-side.png"),
        fullPage: true,
      });
      report.steps.push({
        step: "Select road side",
        status: "success",
        duration: Date.now() - step6Start,
        details: `Road side: ${SURVEY_DATA.roadSide}`,
      });
      console.log(`✅ Road: ${SURVEY_DATA.roadSide}\n`);
    }

    // Step 7: Road Width
    console.log("7️⃣  Selecting road width...");
    const step7Start = Date.now();
    await page.waitForTimeout(2000);
    const widthBtn = page
      .locator("button", {
        hasText: new RegExp(`${SURVEY_DATA.roadWidth}\\s*feet`, "i"),
      })
      .first();
    if (await widthBtn.isVisible().catch(() => false)) {
      await widthBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "07-road-width.png"),
        fullPage: true,
      });
      report.steps.push({
        step: "Select road width",
        status: "success",
        duration: Date.now() - step7Start,
        details: `Road width: ${SURVEY_DATA.roadWidth} feet`,
      });
      console.log(`✅ Width: ${SURVEY_DATA.roadWidth} feet\n`);
    }

    // Step 8: Bedrooms
    console.log("8️⃣  Selecting bedrooms...");
    const step8Start = Date.now();
    await page.waitForTimeout(2000);
    const bedroomBtn = page
      .locator("button", {
        hasText: new RegExp(`${SURVEY_DATA.bedrooms}\\s*BHK`, "i"),
      })
      .first();
    if (await bedroomBtn.isVisible().catch(() => false)) {
      await bedroomBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, "08-bedrooms.png"),
        fullPage: true,
      });
      report.steps.push({
        step: "Select bedrooms",
        status: "success",
        duration: Date.now() - step8Start,
        details: `${SURVEY_DATA.bedrooms} BHK`,
      });
      console.log(`✅ ${SURVEY_DATA.bedrooms} BHK\n`);
    }

    // Continue through remaining questions automatically
    console.log("9️⃣  Completing remaining questions...");
    const step9Start = Date.now();
    let questionCount = 0;
    const maxQuestions = 15;

    while (questionCount < maxQuestions) {
      await page.waitForTimeout(2000);

      // Look for any visible button options (skip Continue buttons)
      const optionButtons = page
        .locator("button")
        .filter({
          hasNot: page.locator('button[type="submit"]'),
        })
        .filter({
          has: page.locator("div, span"),
        });

      const count = await optionButtons.count();

      if (count > 0) {
        // Click the first visible option (usually recommended)
        try {
          await optionButtons.first().click();
          questionCount++;
          console.log(`   Answered question ${questionCount}`);
          await page.waitForTimeout(1500);
        } catch (e) {
          break;
        }
      } else {
        // No more option buttons, might be at generation
        break;
      }

      // Check if generation started
      const bodyText = await page.locator("body").innerText();
      if (
        bodyText.toLowerCase().includes("generating") ||
        bodyText.toLowerCase().includes("analyzing") ||
        bodyText.toLowerCase().includes("creating floor plan")
      ) {
        console.log("   🎯 Generation started!\n");
        report.generationStatus.started = true;
        break;
      }
    }

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "09-all-questions.png"),
      fullPage: true,
    });
    report.steps.push({
      step: "Complete remaining questions",
      status: "success",
      duration: Date.now() - step9Start,
      details: `Answered ${questionCount} additional questions`,
    });

    // Step 10: Monitor generation
    console.log("🔟 Monitoring floor plan generation...");
    const step10Start = Date.now();
    let generationComplete = false;
    let attempts = 0;
    const maxAttempts = 40; // 200 seconds (5 sec intervals)

    while (!generationComplete && attempts < maxAttempts) {
      await page.waitForTimeout(5000);
      attempts++;

      const bodyText = await page.locator("body").innerText();

      // Check for completion
      if (
        bodyText.toLowerCase().includes("floor plan generated") ||
        bodyText.toLowerCase().includes("here is your floor plan") ||
        (await page.locator('img[alt*="floor plan"]').count()) > 0
      ) {
        generationComplete = true;
        report.generationStatus.completed = true;
        report.generationStatus.floorPlanGenerated = true;
        report.generationStatus.duration = Date.now() - step10Start;

        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "10-generated-success.png"),
          fullPage: true,
        });
        report.steps.push({
          step: "Floor plan generation",
          status: "success",
          duration: Date.now() - step10Start,
          details: `Floor plan generated successfully in ${Math.round((Date.now() - step10Start) / 1000)}s`,
        });
        console.log(
          `✅ ✅ ✅ FLOOR PLAN GENERATED! (${Math.round((Date.now() - step10Start) / 1000)}s)\n`,
        );
        break;
      }

      // Check for errors
      if (
        bodyText.toLowerCase().includes("error") ||
        bodyText.toLowerCase().includes("failed")
      ) {
        report.errors.push("Generation error detected in UI");
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, "10-generation-error.png"),
          fullPage: true,
        });
        report.steps.push({
          step: "Floor plan generation",
          status: "failed",
          duration: Date.now() - step10Start,
          details: "Generation failed with error",
        });
        console.log("❌ Generation failed\n");
        break;
      }

      console.log(`   Waiting... (${attempts * 5}s elapsed)`);
    }

    if (!generationComplete && attempts >= maxAttempts) {
      report.steps.push({
        step: "Floor plan generation",
        status: "failed",
        duration: Date.now() - step10Start,
        details: `Timeout after ${attempts * 5}s`,
      });
      console.log("⏱️  Generation timeout\n");
    }

    // Capture final state
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "11-final-state.png"),
      fullPage: true,
    });

    console.log("Keeping browser open for 20 seconds for inspection...");
    await page.waitForTimeout(20000);
  } catch (error) {
    console.error("❌ Test failed:", error);
    report.errors.push(`Critical error: ${error}`);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, "error.png"),
      fullPage: true,
    });
  } finally {
    report.testDuration = Date.now() - startTime;

    // Analyze API calls for agent orchestration
    const apiCalls = await apiCallsPromise;
    report.apiCalls = apiCalls;

    report.agentOrchestration.planningServiceCalled = apiCalls.some((call) =>
      call.url.includes("/api/planning"),
    );
    report.agentOrchestration.geminiApiCalled = apiCalls.some((call) =>
      call.url.includes("googleapis.com"),
    );
    report.agentOrchestration.supabaseUpload = apiCalls.some(
      (call) => call.url.includes("supabase") && call.method === "POST",
    );

    // Generate report
    generateReport(report);

    await browser.close();
  }
}

function generateReport(report: TestReport) {
  console.log("\n\n");
  console.log("═══════════════════════════════════════");
  console.log("     FLOOR PLAN GENERATION REPORT");
  console.log("═══════════════════════════════════════\n");

  const reportLines: string[] = [
    "# Floor Plan Generation Test Report",
    "",
    `**Test Date:** ${new Date(report.timestamp).toLocaleString()}`,
    `**Total Duration:** ${Math.round(report.testDuration / 1000)}s`,
    "",
    "## Test Results Summary",
    "",
  ];

  const successSteps = report.steps.filter(
    (s) => s.status === "success",
  ).length;
  const totalSteps = report.steps.length;

  reportLines.push(`**Steps Completed:** ${successSteps}/${totalSteps}`);
  reportLines.push(
    `**Generation Status:** ${report.generationStatus.floorPlanGenerated ? "✅ SUCCESS" : "❌ FAILED"}`,
  );
  reportLines.push(`**Errors:** ${report.errors.length}`);
  reportLines.push("");

  console.log(`✅ Steps Completed: ${successSteps}/${totalSteps}`);
  console.log(
    `${report.generationStatus.floorPlanGenerated ? "✅" : "❌"} Generation: ${report.generationStatus.floorPlanGenerated ? "SUCCESS" : "FAILED"}`,
  );
  console.log(`📊 API Calls: ${report.apiCalls.length}`);
  console.log(`⚠️  Errors: ${report.errors.length}\n`);

  // Step details
  reportLines.push("## Step-by-Step Results", "");
  console.log("Step-by-Step Results:");
  console.log("─────────────────────");

  for (const step of report.steps) {
    const icon =
      step.status === "success" ? "✅" : step.status === "failed" ? "❌" : "⚠️";
    const line = `${icon} **${step.step}** (${Math.round(step.duration / 1000)}s) - ${step.details}`;
    reportLines.push(`- ${line}`);
    console.log(`${icon} ${step.step} (${Math.round(step.duration / 1000)}s)`);
  }

  reportLines.push("");
  console.log("");

  // Agent orchestration
  reportLines.push("## Agent Orchestration", "");
  reportLines.push("| Service | Called |");
  reportLines.push("|---------|--------|");
  reportLines.push(
    `| Planning Service | ${report.agentOrchestration.planningServiceCalled ? "✅ Yes" : "❌ No"} |`,
  );
  reportLines.push(
    `| Gemini API | ${report.agentOrchestration.geminiApiCalled ? "✅ Yes" : "❌ No"} |`,
  );
  reportLines.push(
    `| Python Backend | ${report.agentOrchestration.pythonBackendCalled ? "✅ Yes" : "❌ No"} |`,
  );
  reportLines.push(
    `| Supabase Upload | ${report.agentOrchestration.supabaseUpload ? "✅ Yes" : "❌ No"} |`,
  );
  reportLines.push("");

  console.log("Agent Orchestration:");
  console.log("───────────────────");
  console.log(
    `${report.agentOrchestration.planningServiceCalled ? "✅" : "❌"} Planning Service`,
  );
  console.log(
    `${report.agentOrchestration.geminiApiCalled ? "✅" : "❌"} Gemini API`,
  );
  console.log(
    `${report.agentOrchestration.pythonBackendCalled ? "✅" : "❌"} Python Backend`,
  );
  console.log(
    `${report.agentOrchestration.supabaseUpload ? "✅" : "❌"} Supabase Upload\n`,
  );

  // API calls
  reportLines.push(`## API Calls (${report.apiCalls.length} total)`, "");
  for (const call of report.apiCalls.slice(0, 20)) {
    // First 20 calls
    reportLines.push(`- \`${call.method}\` ${call.url} - ${call.status}`);
  }
  reportLines.push("");

  // Errors
  if (report.errors.length > 0) {
    reportLines.push("## Errors", "");
    for (const error of report.errors) {
      reportLines.push(`- ❌ ${error}`);
    }
    reportLines.push("");
  }

  reportLines.push("## Screenshots");
  reportLines.push("");
  reportLines.push(`All screenshots saved to: \`${SCREENSHOTS_DIR}\``);

  // Write report to file
  writeFileSync(REPORT_FILE, reportLines.join("\n"));

  console.log("═══════════════════════════════════════");
  console.log(`📄 Full report saved: ${REPORT_FILE}`);
  console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
  console.log("═══════════════════════════════════════\n");
}

testFullGeneration().catch(console.error);
