export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { success, error } from "@/lib/api-utils";
import { isFcmConfigured, sendPushToUser } from "@/lib/push/fcm";

// POST /api/push/test — send a test push to the logged-in user's devices.
// Used to verify the end-to-end FCM pipeline.
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
