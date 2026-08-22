export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/supabase-server";
import { success, error } from "@/lib/api-utils";
import { isFcmConfigured, sendPushToUser } from "@/lib/push/fcm";

// GET /api/push/test — report the push pipeline status for the logged-in user
// so the app (Settings → Notifications) can show exactly why pushes may not be
// arriving: whether FCM is configured server-side and how many devices this
// user has registered. Used as the fool-proof diagnostic surface.
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return error("Unauthorized", 401);

    const { count } = await supabaseAdmin
      .from("device_tokens")
      .select("token", { count: "exact", head: true })
      .eq("user_id", user.id);

    return success({
      configured: isFcmConfigured(),
      deviceCount: count ?? 0,
    });
  } catch (err) {
    console.error("push status error:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/push/test — send a test push to the logged-in user's devices.
// Used to verify the end-to-end FCM pipeline from a real device.
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return error("Unauthorized", 401);
    if (!isFcmConfigured()) return success({ configured: false });

    const result = await sendPushToUser(user.id, {
      title: "Maiyuri Bricks",
      body: "🔔 Push notifications are working!",
      data: { url: "/dashboard" },
    });
    return success({ configured: true, ...result });
  } catch (err) {
    console.error("push test error:", err);
    return error("Internal server error", 500);
  }
}
