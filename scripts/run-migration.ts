import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log("Running Lead Intelligence migration...");
  console.log("Supabase URL:", supabaseUrl);

  // Verify columns exist by checking schema
  const { data, error } = await supabase
    .from("leads")
    .select("urgency, dominant_objection, best_conversion_lever, lost_reason")
    .limit(1);

  if (error) {
    if (error.message.includes("column") || error.code === "42703") {
      console.log("\n❌ Columns do not exist yet.");
      console.log(
        "\nPlease run the following SQL in Supabase Dashboard > SQL Editor:\n",
      );
      console.log("---");
      const migrationSql = readFileSync(
        "./supabase/migrations/20260116000001_add_lead_intelligence_fields.sql",
        "utf-8",
      );
      console.log(migrationSql);
      console.log("---");
    } else {
      console.error("Error:", error.message);
    }
  } else {
    console.log(
      "✅ Migration already applied! Lead intelligence columns are available.",
    );
    console.log("Sample data:", data);
  }
}

runMigration();
