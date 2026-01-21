import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../web/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAiScore() {
  // Get a lead with ai_score
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, ai_score")
    .not("ai_score", "is", null)
    .limit(5);

  console.log("Leads with ai_score:", data);
  if (error) console.error("Error:", error);

  // Try to set ai_score to different values
  const testLeadId = data?.[0]?.id;
  if (testLeadId) {
    console.log("\nTrying ai_score = 0.5 (decimal)...");
    const r1 = await supabase
      .from("leads")
      .update({ ai_score: 0.5 })
      .eq("id", testLeadId);
    console.log("Result:", r1.error ? r1.error.message : "Success");

    console.log("\nTrying ai_score = 50 (integer)...");
    const r2 = await supabase
      .from("leads")
      .update({ ai_score: 50 })
      .eq("id", testLeadId);
    console.log("Result:", r2.error ? r2.error.message : "Success");
  }
}

checkAiScore();
