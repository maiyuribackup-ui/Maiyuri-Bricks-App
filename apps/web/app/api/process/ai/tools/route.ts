export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, type AuthenticatedUser } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runProcessTool, toolManifest } from "@/lib/process/ai-tools";
import { runProcessRoute } from "@/lib/process/route-utils";

const bodySchema = z.object({
  tool: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  /** Service callers may act on behalf of a user (their queue, their rights). */
  as_user_id: z.string().uuid().optional(),
});

/**
 * Who is calling? A signed-in user, or the Intelligence Layer (MCP / Hermes /
 * n8n) holding PROCESS_AI_TOKEN. Service callers get no user context unless
 * they name one.
 */
async function resolveCaller(
  request: NextRequest,
  asUserId?: string,
): Promise<AuthenticatedUser | null> {
  const token = process.env.PROCESS_AI_TOKEN;
  const header = request.headers.get("x-process-ai-token");
  if (token && header && header === token) {
    if (!asUserId) return null;
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, email, role")
      .eq("id", asUserId)
      .maybeSingle();
    return data
      ? {
          id: data.id as string,
          email: (data.email as string) ?? "",
          role: data.role as AuthenticatedUser["role"],
        }
      : null;
  }
  return requireAuth(request);
}

/** GET /api/process/ai/tools — the tool manifest (names, descriptions, input schemas). */
export async function GET(request: NextRequest) {
  return runProcessRoute("Failed to list tools", async () => {
    await resolveCaller(request);
    return success(toolManifest());
  });
}

/** POST /api/process/ai/tools { tool, input, as_user_id? } — run one tool. */
export async function POST(request: NextRequest) {
  return runProcessRoute("Tool call failed", async () => {
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const actor = await resolveCaller(request, parsed.data.as_user_id);
    if (!actor && !process.env.PROCESS_AI_TOKEN)
      return error("Unauthorized", 401);
    const result = await runProcessTool(
      parsed.data.tool,
      parsed.data.input,
      actor,
    );
    return success({ tool: parsed.data.tool, result });
  });
}
