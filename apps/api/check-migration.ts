import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMigration() {
  console.log("Checking lead intelligence columns...");
  console.log("Supabase URL:", supabaseUrl.substring(0, 30) + "...");

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, name, urgency, dominant_objection, best_conversion_lever, lost_reason",
    )
    .limit(1);

  if (error) {
    if (error.message.includes("column") || error.code === "42703") {
      console.log("\n❌ Lead intelligence columns do not exist yet.");
      console.log(
        "\nPlease run this SQL in Supabase Dashboard > SQL Editor:\n",
      );
      console.log(`
-- Lead Intelligence Consolidation Migration
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS urgency TEXT CHECK (urgency IN ('immediate', '1-3_months', '3-6_months', 'unknown'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dominant_objection TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS best_conversion_lever TEXT CHECK (best_conversion_lever IN ('proof', 'price', 'visit', 'relationship', 'timeline'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_urgency ON public.leads(urgency) WHERE urgency = 'immediate';
      `);
    } else {
      console.error("Error:", error.message);
    }
  } else {
    console.log("✅ Lead intelligence columns already exist!");
    if (data && data.length > 0) {
      console.log("Sample lead:", JSON.stringify(data[0], null, 2));
    }
  }
}

checkMigration();
