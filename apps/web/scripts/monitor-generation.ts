/**
 * Monitor floor plan generation progress
 */

const API_BASE = "http://localhost:3000";
const SESSION_ID = "313e06ff-6400-422c-8e3d-5e457bcd5f19";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function monitorGeneration() {
  console.log("🔍 Monitoring Floor Plan Generation\n");
  console.log(`Session ID: ${SESSION_ID}\n`);
  console.log("=".repeat(60));

  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max (5 second intervals)

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await fetch(
        `${API_BASE}/api/planning/${SESSION_ID}/status`,
      );
      const data = await response.json();

      if (data.error) {
        console.log(`\n❌ Error: ${data.error}`);
        break;
      }

      const status = data.data?.status;
      const progress = data.data?.progress || 0;
      const currentStage = data.data?.currentStage || "Unknown";

      // Clear line and print progress
      process.stdout.write(
        `\r📊 Status: ${status} | Progress: ${progress}% | ${currentStage}`.padEnd(
          100,
        ),
      );

      // Check if complete or failed
      if (status === "complete") {
        console.log("\n\n✅ Generation Complete!");
        console.log("\n📊 Result:");
        console.log(JSON.stringify(data.data, null, 2));
        break;
      }

      if (status === "failed") {
        console.log("\n\n❌ Generation Failed!");
        console.log(`Error: ${data.data?.error}`);
        break;
      }

      if (status === "awaiting_blueprint_confirmation") {
        console.log("\n\n⏸️  Awaiting Blueprint Confirmation");
        console.log("The system is waiting for blueprint approval.");
        console.log(
          "Check the frontend or call the confirm-blueprint endpoint.",
        );
        break;
      }
    } catch (error) {
      console.log(`\n❌ Request error: ${error}`);
    }

    await sleep(5000); // Check every 5 seconds
  }

  if (attempts >= maxAttempts) {
    console.log("\n\n⏱️  Timeout: Generation took longer than 10 minutes");
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n🔎 Final Database Check...\n");

  // Final check in database
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
    .eq("id", SESSION_ID)
    .single();

  if (session) {
    console.log("📊 Database Record:");
    console.log(`   Client Name: ${session.client_name || "NOT SET"}`);
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

      const dxfFilename = session.generated_dxf.split("/").pop()?.split("?")[0];
      console.log(`   Filename: ${dxfFilename}`);

      // Check if it follows client-based naming
      const expectedPattern =
        /^test-floor-plan-generation_\d{8}_\d{6}_floor-plan\.dxf$/;
      if (dxfFilename && expectedPattern.test(dxfFilename)) {
        console.log("   ✅ Filename follows client-based naming pattern!");
      } else {
        console.log("   ⚠️  Filename doesn't match expected pattern");
      }
    }
  }

  console.log("\n✅ Monitoring complete!");
}

monitorGeneration();
