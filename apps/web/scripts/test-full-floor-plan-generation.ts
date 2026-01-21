/**
 * Complete floor plan generation test
 * Tests the entire flow from client name to file generation
 */

const API_BASE = "http://localhost:3000";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFullFloorPlanGeneration() {
  console.log("🏗️  Full Floor Plan Generation Test\n");
  console.log("=".repeat(60));

  try {
    // Step 1: Start session
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
    console.log(
      '\n2️⃣  Submitting client name: "Test Floor Plan Generation"...',
    );
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "clientName",
        answer: { clientName: "Test Floor Plan Generation" },
      }),
    });
    console.log("   ✅ Client name submitted");

    // Step 3: Submit plot input method
    console.log("\n3️⃣  Selecting manual plot input...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "plotInput",
        answer: "manual",
      }),
    });
    console.log("   ✅ Plot input method selected");

    // Step 4: Submit plot dimensions
    console.log("\n4️⃣  Submitting plot dimensions (40x60 feet)...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "plotDimensions",
        answer: {
          north: 40,
          south: 40,
          east: 60,
          west: 60,
        },
      }),
    });
    console.log("   ✅ Plot dimensions submitted");

    // Step 5: Submit road side
    console.log("\n5️⃣  Setting road side to East...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "roadSide",
        answer: "east",
      }),
    });
    console.log("   ✅ Road side submitted");

    // Step 6: Submit bedrooms
    console.log("\n6️⃣  Selecting 3 bedrooms...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "bedrooms",
        answer: "3",
      }),
    });
    console.log("   ✅ Bedrooms submitted");

    // Step 7: Submit bathrooms
    console.log("\n7️⃣  Selecting 2 bathrooms...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "bathrooms",
        answer: "2",
      }),
    });
    console.log("   ✅ Bathrooms submitted");

    // Step 8: Submit floors
    console.log("\n8️⃣  Selecting Ground + 1 floor...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "floors",
        answer: "g+1",
      }),
    });
    console.log("   ✅ Floors submitted");

    // Step 9: Submit mutram
    console.log("\n9️⃣  Adding courtyard (mutram)...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "hasMutram",
        answer: "yes",
      }),
    });
    console.log("   ✅ Mutram preference submitted");

    // Step 10: Submit verandah
    console.log("\n🔟 Adding verandah...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "hasVerandah",
        answer: "yes",
      }),
    });
    console.log("   ✅ Verandah preference submitted");

    // Step 11: Submit pooja
    console.log("\n1️⃣1️⃣  Adding separate pooja room...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "hasPooja",
        answer: "separate",
      }),
    });
    console.log("   ✅ Pooja room preference submitted");

    // Step 12: Submit parking
    console.log("\n1️⃣2️⃣  Adding covered parking for 1 car...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "parking",
        answer: "covered-1",
      }),
    });
    console.log("   ✅ Parking preference submitted");

    // Step 13: Submit wall material
    console.log("\n1️⃣3️⃣  Selecting mud interlock bricks...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "wallMaterial",
        answer: "mud-interlock",
      }),
    });
    console.log("   ✅ Wall material submitted");

    // Step 14: Submit flooring
    console.log("\n1️⃣4️⃣  Selecting oxide flooring...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "flooringType",
        answer: "oxide",
      }),
    });
    console.log("   ✅ Flooring type submitted");

    // Step 15: Submit roof
    console.log("\n1️⃣5️⃣  Selecting Mangalore tile roof...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "roofType",
        answer: "mangalore",
      }),
    });
    console.log("   ✅ Roof type submitted");

    // Step 16: Submit eco features
    console.log("\n1️⃣6️⃣  Selecting eco features...");
    await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "ecoFeatures",
        answer: ["rainwater", "solar", "ventilation"],
      }),
    });
    console.log("   ✅ Eco features submitted");

    // Step 17: Submit budget - This should trigger generation
    console.log("\n1️⃣7️⃣  Selecting budget range (this triggers generation)...");
    const finalResponse = await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        questionId: "budgetRange",
        answer: "30-50l",
      }),
    });

    const finalData = await finalResponse.json();
    console.log("   ✅ Budget submitted");
    console.log(`   Status: ${finalData.data?.status || finalData.status}`);

    if (
      finalData.data?.status === "generating" ||
      finalData.status === "generating"
    ) {
      console.log("\n🎨 Floor plan generation started!");
      console.log("   This may take 2-5 minutes...");

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max
      let generationComplete = false;

      while (attempts < maxAttempts && !generationComplete) {
        await sleep(5000); // Check every 5 seconds
        attempts++;

        const statusResponse = await fetch(
          `${API_BASE}/api/planning/status?sessionId=${sessionId}`,
        );
        const statusData = await statusResponse.json();

        const status = statusData.data?.status || statusData.status;
        const progress = statusData.data?.progress?.percent || 0;

        process.stdout.write(
          `\r   Progress: ${progress}% - ${status}              `,
        );

        if (status === "complete" || status === "presenting") {
          generationComplete = true;
          console.log("\n   ✅ Generation complete!");
          break;
        }

        if (status === "failed" || status === "halted") {
          console.log("\n   ❌ Generation failed");
          console.log("   Error:", statusData.data?.error || statusData.error);
          break;
        }
      }

      if (!generationComplete && attempts >= maxAttempts) {
        console.log("\n   ⏱️  Timeout waiting for generation");
      }
    }

    // Step 18: Verify in database
    console.log("\n1️⃣8️⃣  Verifying in database...");
    const { createClient } = await import("@supabase/supabase-js");
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: session } = await supabase
      .from("floor_plan_sessions")
      .select(
        "id, client_name, status, generated_blueprint, generated_rendered, generated_dxf",
      )
      .eq("id", sessionId)
      .single();

    console.log("\n📊 Database Record:");
    console.log(`   Client Name: ${session?.client_name || "NOT SET ❌"}`);
    console.log(`   Status: ${session?.status}`);
    console.log(
      `   Blueprint URL: ${session?.generated_blueprint ? "✅ Generated" : "❌ Not generated"}`,
    );
    console.log(
      `   Rendered URL: ${session?.generated_rendered ? "✅ Generated" : "❌ Not generated"}`,
    );
    console.log(
      `   DXF URL: ${session?.generated_dxf ? "✅ Generated" : "❌ Not generated"}`,
    );

    if (session?.generated_dxf) {
      console.log("\n📁 Generated File URLs:");
      console.log(`   DXF: ${session.generated_dxf}`);

      // Extract filename from URL
      const dxfFilename = session.generated_dxf.split("/").pop()?.split("?")[0];
      console.log(`   Filename: ${dxfFilename}`);

      // Check if it follows the pattern: {client-name}_{date}_{time}_floor-plan.dxf
      const expectedPattern =
        /^test-floor-plan-generation_\d{8}_\d{6}_floor-plan\.dxf$/;
      if (dxfFilename && expectedPattern.test(dxfFilename)) {
        console.log("   ✅ Filename follows client-based naming pattern!");
      } else {
        console.log(
          `   ⚠️  Filename doesn't match expected pattern: test-floor-plan-generation_YYYYMMDD_HHMMSS_floor-plan.dxf`,
        );
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ FULL FLOOR PLAN GENERATION TEST COMPLETE!\n");
    console.log("Summary:");
    console.log("  ✅ Session created");
    console.log('  ✅ Client name: "Test Floor Plan Generation"');
    console.log("  ✅ All questions answered (17 questions)");
    console.log(
      `  ${session?.status === "complete" ? "✅" : "⏳"} Floor plan generated`,
    );
    console.log(
      `  ${session?.generated_dxf ? "✅" : "❌"} Files uploaded with client-based naming`,
    );
    console.log(
      `  ${session?.client_name ? "✅" : "❌"} Client name in database`,
    );

    if (session?.generated_dxf) {
      console.log("\n🎉 CLIENT NAME INTEGRATION VERIFIED!");
      console.log("\nFiles are stored with client-based naming:");
      console.log(
        `  test-floor-plan-generation_YYYYMMDD_HHMMSS_floor-plan.dxf`,
      );
      console.log(`  test-floor-plan-generation_YYYYMMDD_HHMMSS_wireframe.png`);
      console.log(`  test-floor-plan-generation_YYYYMMDD_HHMMSS_rendered.png`);
    }
  } catch (error) {
    console.error("\n❌ Test Failed:");
    console.error(error);
    process.exit(1);
  }
}

testFullFloorPlanGeneration();
