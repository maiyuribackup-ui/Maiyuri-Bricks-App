export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error } from "@/lib/api-utils";

// POST /api/push/register — store/refresh this device's FCM token for the
// logged-in user. Called by the native app after login.
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return error("Unauthorized", 401);

    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const platform = ["android", "ios", "web"].includes(body.platform)
      ? body.platform
      : "android";
    if (!token) return error("Missing token", 400);

    // Token is globally unique — reassign to the latest user + refresh last_seen.
    const { error: dbErr } = await supabaseAdmin.from("device_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (dbErr) {
      console.error("device token upsert error:", dbErr);
      return error("Failed to register token", 500);
    }
    return success({ registered: true });
  } catch (err) {
    console.error("push register error:", err);
    return error("Internal server error", 500);
  }
}
