/**
 * Complete floor plan generation test with all fixes
 * Tests the entire flow including client-based file naming
 */

const API_BASE = "http://localhost:3000";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testCompleteGeneration() {
  console.log("🏗️  Complete Floor Plan Generation Test\n");
  console.log("=".repeat(60));

  try {
    // Step 1: Start new session
    console.log("\n1️⃣  Starting new session...");
    const startResponse = await fetch(`${API_BASE}/api/planning/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectType: "residential" }),
    });

    const startData = await startResponse.json();
    const sessionId = startData.data.sessionId;
    console.log(`   ✅ Session created: ${sessionId}`);

    // Step 2: Submit client name
    console.log('\n2️⃣  Submitting client name: "Kumar Dream Home"...');
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "clientName",
        answer: { clientName: "Kumar Dream Home" },
      }),
    });
    console.log("   ✅ Client name submitted");

    // Step 3-17: Answer all remaining questions quickly
    const answers = [
      { questionId: "plotInput", answer: "manual" },
      {
        questionId: "plotDimensions",
        answer: { north: 40, south: 40, east: 60, west: 60 },
      },
      { questionId: "roadSide", answer: "east" },
      { questionId: "bedrooms", answer: "3" },
      { questionId: "bathrooms", answer: "2" },
      { questionId: "floors", answer: "g+1" },
      { questionId: "hasMutram", answer: "yes" },
      { questionId: "hasVerandah", answer: "yes" },
      { questionId: "hasPooja", answer: "separate" },
      { questionId: "parking", answer: "covered-1" },
      { questionId: "wallMaterial", answer: "mud-interlock" },
      { questionId: "flooringType", answer: "oxide" },
      { questionId: "roofType", answer: "mangalore" },
      {
        questionId: "ecoFeatures",
        answer: ["rainwater", "solar", "ventilation"],
      },
      { questionId: "budgetRange", answer: "30-50l" },
    ];

    console.log("\n3️⃣  Answering all questions...");
    for (const { questionId, answer } of answers) {
      await fetch(`${API_BASE}/api/planning/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId, answer }),
      });
      process.stdout.write(".");
    }
    console.log("\n   ✅ All questions answered");

    // Step 4: Monitor generation progress
    console.log("\n4️⃣  Monitoring generation progress...\n");
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes
    let complete = false;

    while (attempts < maxAttempts && !complete) {
      attempts++;
      await sleep(5000);

      try {
        const statusResponse = await fetch(
          `${API_BASE}/api/planning/${sessionId}/status`,
        );
        const statusData = await statusResponse.json();

        if (statusData.error) {
          console.log(`\n❌ Error: ${statusData.error}`);
          break;
        }

        const status = statusData.data?.status;
        const progress = statusData.data?.progress || 0;
        const currentStage = statusData.data?.currentStage || "Unknown";

        process.stdout.write(
          `\r   Progress: ${progress}% | ${currentStage}`.padEnd(100),
        );

        if (status === "complete") {
          console.log("\n\n   ✅ Generation complete!");
          complete = true;
          break;
        }

        if (status === "failed") {
          console.log("\n\n   ❌ Generation failed!");
          console.log(`   Error: ${statusData.data?.error}`);
          break;
        }

        if (status === "awaiting_blueprint_confirmation") {
          console.log("\n\n   ⏸️  Blueprint ready - auto-confirming...");

          // Auto-confirm blueprint
          await fetch(`${API_BASE}/api/planning/confirm-blueprint`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, action: "confirm" }),
          });

          console.log("   ✅ Blueprint confirmed - continuing generation...");
        }
      } catch (error) {
        console.log(`\n   ⚠️  Status check error: ${error}`);
      }
    }

    if (attempts >= maxAttempts && !complete) {
      console.log("\n\n   ⏱️  Timeout - generation still running");
    }

    // Step 5: Check database for files
    console.log("\n\n5️⃣  Checking database for generated files...\n");

    const { createClient } = await import("@supabase/supabase-js");
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: session } = await supabase
      .from("floor_plan_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (session) {
      console.log("📊 Final Database Record:");
      console.log(`   Client Name: ${session.client_name || "NOT SET ❌"}`);
      console.log(`   Status: ${session.status}`);
      console.log(
        `   Blueprint: ${session.generated_blueprint ? "✅ Generated" : "❌ Not generated"}`,
      );
      console.log(
        `   Rendered: ${session.generated_rendered ? "✅ Generated" : "❌ Not generated"}`,
      );
      console.log(
        `   DXF: ${session.generated_dxf ? "✅ Generated" : "❌ Not generated"}`,
      );

      if (session.generated_dxf) {
        console.log("\n📁 Generated File URLs:");
        console.log(`   DXF: ${session.generated_dxf}`);

        const dxfFilename = session.generated_dxf
          .split("/")
          .pop()
          ?.split("?")[0];
        console.log(`   Filename: ${dxfFilename}`);

        const expectedPattern =
          /^kumar-dream-home_\d{8}_\d{6}_floor-plan\.dxf$/;
        if (dxfFilename && expectedPattern.test(dxfFilename)) {
          console.log("   ✅ CLIENT-BASED FILE NAMING VERIFIED!");
        } else {
          console.log("   ⚠️  Filename doesn't match expected pattern");
          console.log(
            "   Expected: kumar-dream-home_YYYYMMDD_HHMMSS_floor-plan.dxf",
          );
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n✅ COMPLETE GENERATION TEST FINISHED!\n");
  } catch (error) {
    console.error("\n❌ Test Failed:");
    console.error(error);
    process.exit(1);
  }
}

testCompleteGeneration();
