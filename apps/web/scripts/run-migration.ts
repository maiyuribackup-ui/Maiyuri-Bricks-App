/**
 * Script to run the client_info migration on remote Supabase database
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗");
  console.error(
    "   SUPABASE_SERVICE_ROLE_KEY:",
    SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗",
  );
  process.exit(1);
}

async function runMigration() {
  console.log("🔧 Running client_info migration...\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Read the migration file
  const migrationPath = path.join(
    __dirname,
    "../../../supabase/migrations/20260111000002_add_client_info.sql",
  );
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  console.log("📄 Migration SQL:");
  console.log("─".repeat(60));
  console.log(migrationSQL);
  console.log("─".repeat(60));
  console.log();

  try {
    // Execute the migration using the Supabase REST API
    const { data, error } = await supabase.rpc("exec_sql", {
      sql: migrationSQL,
    });

    if (error) {
      // Try alternative method - direct SQL execution
      console.log("⚠️  RPC method failed, trying direct execution...\n");

      // Split SQL into individual statements
      const statements = migrationSQL
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("--"));

      for (const statement of statements) {
        console.log(`Executing: ${statement.substring(0, 60)}...`);

        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: statement }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Failed to execute statement: ${errorText}`);
        } else {
          console.log("✓ Success");
        }
      }
    } else {
      console.log("✅ Migration executed successfully!\n");
      console.log("Data:", data);
    }

    // Verify the columns were added
    console.log("\n📊 Verifying migration...");
    const { data: columns, error: verifyError } = await supabase
      .from("floor_plan_sessions")
      .select("id, client_name, client_contact, client_location")
      .limit(1);

    if (verifyError) {
      console.error("❌ Verification failed:", verifyError.message);
      console.log(
        "\n💡 The migration SQL needs to be run manually in Supabase dashboard:",
      );
      console.log(
        "   1. Go to: https://pailepomvvwjkrhkwdqt.supabase.co/project/pailepomvvwjkrhkwdqt/editor",
      );
      console.log('   2. Click "SQL Editor"');
      console.log("   3. Paste and run the migration SQL shown above");
    } else {
      console.log("✅ Verification successful! Columns exist.");
      console.log("   - client_name: ✓");
      console.log("   - client_contact: ✓");
      console.log("   - client_location: ✓");
    }
  } catch (err) {
    console.error("❌ Migration failed:", err);
    console.log(
      "\n💡 Please run the migration manually in Supabase dashboard:",
    );
    console.log(
      "   1. Go to: https://pailepomvvwjkrhkwdqt.supabase.co/project/pailepomvvwjkrhkwdqt/editor",
    );
    console.log('   2. Click "SQL Editor"');
    console.log("   3. Run the following SQL:\n");
    console.log(migrationSQL);
    process.exit(1);
  }
}

runMigration();
