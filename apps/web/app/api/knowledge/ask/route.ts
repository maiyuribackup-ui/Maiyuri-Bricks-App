export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { routes, contracts } from "@maiyuri/api";
import { success, error, handleZodError } from "@/lib/api-utils";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/supabase-server";
import { processContextForQuestion } from "@/lib/process/ai-tools";
import type { AuthenticatedUser } from "@/lib/api-helpers";
import { ZodError } from "zod";

/**
 * Process OS enrichment (PRD §16): when the question is about a live case,
 * prepend the authoritative stage facts so the answer reflects the actual
 * process definition rather than general knowledge. Signed-in users only.
 */
async function processEnrichment(
  request: NextRequest,
  question: string,
): Promise<{ text: string; instance_id: string; label: string } | null> {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) return null;
    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("id, email, role")
      .eq("id", authUser.id)
      .maybeSingle();
    if (!user) return null;
    return await processContextForQuestion(question, {
      id: user.id as string,
      email: (user.email as string) ?? "",
      role: user.role as AuthenticatedUser["role"],
    });
  } catch {
    return null;
  }
}

// Helper to get user's language preference
async function getUserLanguagePreference(
  request: NextRequest,
): Promise<"en" | "ta"> {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) return "en";

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("language_preference")
      .eq("id", authUser.id)
      .single();

    return (user?.language_preference as "en" | "ta") || "en";
  } catch {
    return "en";
  }
}

// POST /api/knowledge/ask - Ask a question using RAG
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with CloudCore contracts
    const parsed = contracts.QuestionAnswerRequestSchema.safeParse(body);
    if (!parsed.success) {
      return handleZodError(parsed.error);
    }

    // Get user's language preference
    const language = await getUserLanguagePreference(request);

    const enrichment = await processEnrichment(request, parsed.data.question);
    const question = enrichment
      ? `${parsed.data.question}\n\n[Process OS facts — authoritative, do not contradict]\n${enrichment.text}`
      : parsed.data.question;

    const result = await routes.knowledge.answerQuestion({
      ...parsed.data,
      question,
      language,
    });

    if (!result.success || !result.data) {
      return error(result.error?.message || "Failed to answer question", 500);
    }

    if (!enrichment) return success(result.data);
    return success({
      ...result.data,
      sources: [
        {
          id: `process:${enrichment.instance_id}`,
          content: enrichment.text,
          score: 1,
          sourceType: "knowledge" as const,
          sourceId: enrichment.instance_id,
          metadata: {
            kind: "process_os",
            label: enrichment.label,
            url: `/processes/instances/${enrichment.instance_id}`,
          },
        },
        ...result.data.sources,
      ],
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return handleZodError(err);
    }
    console.error("Question answering error:", err);
    return error("Failed to answer question", 500);
  }
}
