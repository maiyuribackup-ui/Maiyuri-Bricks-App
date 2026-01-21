/**
 * Check if client_name columns exist in floor_plan_sessions table
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function checkSchema() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("🔍 Checking floor_plan_sessions table schema...\n");

  // Try to select with the new columns
  const { data, error } = await supabase
    .from("floor_plan_sessions")
    .select("id, client_name, client_contact, client_location")
    .limit(1);

  if (error) {
    console.log("❌ Columns do NOT exist yet");
    console.log(`   Error: ${error.message}\n`);
    console.log(
      "📝 Migration needs to be applied. Run this SQL in Supabase dashboard:",
    );
    console.log(
      "   https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/sql\n",
    );
    console.log(`ALTER TABLE floor_plan_sessions
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS client_contact TEXT,
ADD COLUMN IF NOT EXISTS client_location TEXT;

CREATE INDEX IF NOT EXISTS idx_floor_plan_sessions_client_name
  ON floor_plan_sessions(client_name);`);
    return false;
  }

  console.log("✅ Columns already exist!");
  console.log("   - client_name: ✓");
  console.log("   - client_contact: ✓");
  console.log("   - client_location: ✓\n");
  console.log("Migration is already applied. Ready to test!");
  return true;
}

checkSchema();
