/**
 * Push notification end-to-end diagnostic.
 *
 * Reproduces exactly what the server does (apps/web/src/lib/push/fcm.ts):
 *   1. validate FCM env
 *   2. mint an OAuth token from the service account
 *   3. read device_tokens from Supabase
 *   4. POST to FCM HTTP v1 and print the EXACT status + response body
 *
 * Run it with production env so it pinpoints why notifications aren't sending
 * (bad key vs. API-not-enabled vs. stale token vs. actually-works-but-not-shown).
 *
 * Usage (from apps/web):
 *   vercel env pull .env.diag           # pull prod env locally
 *   node --env-file=.env.diag scripts/diagnose-push.mjs            # 1 most-recent device
 *   node --env-file=.env.diag scripts/diagnose-push.mjs --all      # every device
 *
 * Needs: FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON,
 *        NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *
 * Safe: read-only except it sends a "🔔 Diagnostic" test push to your devices.
 */
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const sendAll = process.argv.includes("--all");
const fail = (msg) => {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
};

const projectId = process.env.FCM_PROJECT_ID;
const saRaw = process.env.FCM_SERVICE_ACCOUNT_JSON;
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== Push diagnostic ===");
console.log("FCM_PROJECT_ID:", projectId || "(missing)");
console.log("FCM_SERVICE_ACCOUNT_JSON:", saRaw ? "(set)" : "(missing)");
console.log("Supabase URL:", supabaseUrl ? "(set)" : "(missing)");
console.log("SUPABASE_SERVICE_ROLE_KEY:", serviceRole ? "(set)" : "(missing)");

if (!projectId || !saRaw) fail("FCM env not configured.");
if (!supabaseUrl || !serviceRole) fail("Supabase admin env not configured.");

// 1) Parse + validate the service account
let creds;
try {
  creds = JSON.parse(saRaw);
} catch {
  fail("FCM_SERVICE_ACCOUNT_JSON is not valid JSON (likely mangled on paste).");
}
if (!creds.client_email || !creds.private_key)
  fail("Service account JSON missing client_email / private_key.");
if (creds.project_id && creds.project_id !== projectId) {
  console.warn(
    `\n⚠️  project_id MISMATCH: service account is for "${creds.project_id}" but FCM_PROJECT_ID is "${projectId}". This causes 403/SenderId errors.`,
  );
}
console.log("\nService account project_id:", creds.project_id);
console.log("Service account client_email:", creds.client_email);

// 2) Mint OAuth token (same as fcm.ts)
let accessToken;
try {
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const out = await jwt.authorize();
  accessToken = out.access_token;
  if (!accessToken) fail("OAuth returned no access_token.");
  console.log("\n✅ OAuth token minted (service account auth works).");
} catch (e) {
  fail(`OAuth minting FAILED — bad key / clock / disabled SA: ${e?.message || e}`);
}

// 3) Read device tokens
const supabase = createClient(supabaseUrl, serviceRole);
const { data: tokens, error: dbErr } = await supabase
  .from("device_tokens")
  .select("token, platform, user_id, last_seen_at")
  .order("last_seen_at", { ascending: false });
if (dbErr) fail(`device_tokens query failed: ${dbErr.message}`);
if (!tokens?.length) fail("No device_tokens registered.");
console.log(`\nFound ${tokens.length} device token(s).`);

const targets = sendAll ? tokens : tokens.slice(0, 1);

// 4) Send and print the exact FCM response
let ok = 0;
for (const t of targets) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: t.token,
          notification: {
            title: "Maiyuri Bricks",
            body: "🔔 Diagnostic push",
          },
          android: {
            priority: "high",
            notification: { sound: "default", channel_id: "default" },
          },
        },
      }),
    },
  );
  const body = await res.text();
  const tag = `${t.platform}/${(t.token || "").slice(0, 12)}…`;
  if (res.ok) {
    ok++;
    console.log(`✅ ${tag} → 200 OK`);
  } else {
    console.log(`❌ ${tag} → ${res.status}\n   ${body.slice(0, 400)}`);
  }
}

console.log(`\n=== Result: ${ok}/${targets.length} accepted by FCM ===`);
console.log(
  ok > 0
    ? "FCM is sending. If the phone shows nothing, it's a device/display issue (notification permission off, battery optimization, or app force-stopped)."
    : "FCM rejected every send — read the status above: 403=Cloud Messaging API not enabled / wrong project, 404=stale token, 401=bad credentials.",
);
