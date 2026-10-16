export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, parseBody } from "@/lib/api-utils";
import { requireAuth, requireAdmin } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRoleDefaults, setRoleDefault } from "@/lib/process/repository";
import { PROCESS_ROLE_MAP } from "@/lib/process/permissions";
import { runProcessRoute } from "@/lib/process/route-utils";
import { setRoleDefaultSchema } from "@maiyuri/shared";

/** GET /api/process/role-defaults — who holds each process role today, plus eligible users. */
export async function GET(request: NextRequest) {
  return runProcessRoute("Failed to load role defaults", async () => {
    await requireAuth(request);
    const [defaults, { data: users }] = await Promise.all([
      getRoleDefaults(),
      supabaseAdmin
        .from("users")
        .select("id, name, role")
        .eq("is_active", true)
        .order("name"),
    ]);
    return success({
      defaults,
      users: users ?? [],
      role_map: PROCESS_ROLE_MAP,
    });
  });
}

/** PUT /api/process/role-defaults — set (or clear with user_id: null) one role. Admin only. */
export async function PUT(request: NextRequest) {
  return runProcessRoute("Failed to save the role default", async () => {
    const user = await requireAdmin(request);
    const parsed = await parseBody(request, setRoleDefaultSchema);
    if (parsed.error) return parsed.error;
    await setRoleDefault(parsed.data.role_key, parsed.data.user_id, user.id);
    return success(await getRoleDefaults());
  });
}
