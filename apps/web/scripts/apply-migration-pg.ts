/**
 * Apply migration using PostgreSQL client
 */
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

// Parse Supabase URL to get connection string
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Extract project ref from URL: https://pailepomvvwjkrhkwdqt.supabase.co
const projectRef = SUPABASE_URL.split("//")[1].split(".")[0];

// Construct PostgreSQL connection string
const connectionString = `postgresql://postgres.${projectRef}:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

console.log("📝 To run this migration, you need the database password.");
console.log("");
console.log("Option 1: Run manually in Supabase SQL Editor");
console.log("─".repeat(60));
console.log(
  "1. Go to: https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/sql",
);
console.log('2. Click "New query"');
console.log("3. Paste and run this SQL:\n");

const migrationPath = path.join(
  __dirname,
  "../../../supabase/migrations/20260111000002_add_client_info.sql",
);
const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

console.log(migrationSQL);
console.log("\n" + "─".repeat(60));
console.log("\nOption 2: Use psql command line");
console.log("─".repeat(60));
console.log(
  `psql "${connectionString}" -f supabase/migrations/20260111000002_add_client_info.sql`,
);
console.log("");
console.log(
  "(Replace [PASSWORD] with your database password from Supabase dashboard)",
);
