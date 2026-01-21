/**
 * Check a specific session in database
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sessionId = process.argv[2] || "313e06ff-6400-422c-8e3d-5e457bcd5f19";

async function checkSession() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n🔍 Checking session: ${sessionId}\n`);

  const { data: session, error } = await supabase
    .from("floor_plan_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error) {
    console.error("Error:", error);
    return;
  }

  if (!session) {
    console.log("Session not found");
    return;
  }

  console.log("📊 Session Details:\n");
  console.log(`ID: ${session.id}`);
  console.log(`User ID: ${session.user_id || "NULL"}`);
  console.log(`Status: ${session.status}`);
  console.log(`Project Type: ${session.project_type}`);
  console.log(`\n📝 Client Information:`);
  console.log(`  client_name: ${session.client_name || "NOT SET ❌"}`);
  console.log(`  client_contact: ${session.client_contact || "NULL"}`);
  console.log(`  client_location: ${session.client_location || "NULL"}`);

  console.log(`\n📥 Collected Inputs:`);
  const inputs = session.collected_inputs as Record<string, any>;
  if (inputs) {
    Object.keys(inputs).forEach((key) => {
      console.log(`  ${key}: ${JSON.stringify(inputs[key]).substring(0, 100)}`);
    });
  }

  console.log(`\n🖼️  Generated Files:`);
  console.log(
    `  Blueprint: ${session.generated_blueprint ? "✅ " + session.generated_blueprint.substring(0, 80) + "..." : "❌ Not generated"}`,
  );
  console.log(
    `  Rendered: ${session.generated_rendered ? "✅ " + session.generated_rendered.substring(0, 80) + "..." : "❌ Not generated"}`,
  );
  console.log(
    `  DXF: ${session.generated_dxf ? "✅ " + session.generated_dxf.substring(0, 80) + "..." : "❌ Not generated"}`,
  );

  console.log(`\n📅 Timestamps:`);
  console.log(`  Created: ${new Date(session.created_at).toLocaleString()}`);
  console.log(`  Updated: ${new Date(session.updated_at).toLocaleString()}`);

  // Check if client name is in collected_inputs
  if (inputs?.clientName) {
    console.log(
      "\n✅ Client name found in collected_inputs:",
      inputs.clientName,
    );
    if (!session.client_name) {
      console.log("⚠️  BUT client_name column is not set!");
      console.log("   This means the auto-sync may not be working.");
    }
  }
}

checkSession();
