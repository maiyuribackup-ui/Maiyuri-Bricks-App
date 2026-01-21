/**
 * Check recent sessions in database
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function checkSessions() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sessions, error } = await supabase
    .from("floor_plan_sessions")
    .select("id, client_name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("\n📊 Recent Floor Plan Sessions:\n");
  if (!sessions || sessions.length === 0) {
    console.log("No sessions found in database");
    return;
  }

  sessions.forEach((session, i) => {
    console.log(`${i + 1}. Session ID: ${session.id}`);
    console.log(`   Client: ${session.client_name || "NOT SET"}`);
    console.log(`   Status: ${session.status}`);
    console.log(
      `   Created: ${new Date(session.created_at).toLocaleString()}\n`,
    );
  });
}

checkSessions();
