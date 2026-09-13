export const dynamic = "force-dynamic";
export const maxDuration = 60; // publish path embeds into the RAG store

import { NextRequest } from "next/server";
import { z } from "zod";
import { routes } from "@maiyuri/api";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const stepSchema = z.object({
  en: z.string().min(1),
  ta: z.string().optional().default(""),
  icon: z.string().optional(),
});

const sopSchema = z.object({
  id: z.string().uuid().optional(), // present = update
  department: z.enum(["sales", "production", "dispatch", "accounts", "hr", "safety"]),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  title_en: z.string().min(2),
  title_ta: z.string().nullable().optional(),
  purpose_en: z.string().nullable().optional(),
  purpose_ta: z.string().nullable().optional(),
  steps: z.array(stepSchema).min(1).max(10),
  warning_en: z.string().nullable().optional(),
  warning_ta: z.string().nullable().optional(),
  video_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  status: z.enum(["draft", "published"]).default("draft"),
});

/** Flatten an SOP into RAG-ingestible text (EN + TA together). */
function sopToRagContent(sop: {
  title_en: string;
  title_ta?: string | null;
  purpose_en?: string | null;
  department: string;
  steps: { en: string; ta?: string }[];
  warning_en?: string | null;
}): string {
  const lines = [
    `SOP: ${sop.title_en}${sop.title_ta ? ` / ${sop.title_ta}` : ""}`,
    `Department: ${sop.department}`,
    sop.purpose_en ? `Purpose: ${sop.purpose_en}` : "",
    "Steps:",
    ...sop.steps.map(
      (s, i) => `${i + 1}. ${s.en}${s.ta ? ` (${s.ta})` : ""}`,
    ),
    sop.warning_en ? `Important warning: ${sop.warning_en}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

// GET /api/onehub/sops?department=sales — published for everyone; drafts for founder/owner
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const department = searchParams.get("department");

    let includeDrafts = false;
    try {
      const user = await requireAuth(request);
      includeDrafts = user.role === "founder" || user.role === "owner";
    } catch {
      // Machine-auth callers (middleware-bypassed) see published only.
    }

    let query = supabaseAdmin
      .from("onehub_sops")
      .select("*")
      .order("department")
      .order("title_en");
    if (department) query = query.eq("department", department);
    if (!includeDrafts) query = query.eq("status", "published");

    const { data, error: dbError } = await query;
    if (dbError) return error("Failed to load SOPs", 500);
    return success(data ?? []);
  } catch (err) {
    console.error("onehub sops GET failed:", err);
    return error("Failed to load SOPs", 500);
  }
}

// POST /api/onehub/sops — create/update (founder/owner). Publishing ingests into RAG.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "founder" && user.role !== "owner") {
      return error("Only founders can edit SOPs", 403);
    }

    const parsed = await parseBody(request, sopSchema);
    if (parsed.error) return parsed.error;
    const { id, ...fields } = parsed.data;

    const row = {
      ...fields,
      owner_id: user.id,
      ...(id ? {} : {}),
    };

    const result = id
      ? await supabaseAdmin
          .from("onehub_sops")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("*")
          .single()
      : await supabaseAdmin
          .from("onehub_sops")
          .upsert(row, { onConflict: "slug" })
          .select("*")
          .single();

    if (result.error || !result.data) {
      return error(`Failed to save SOP: ${result.error?.message}`, 500);
    }
    const sop = result.data;

    // Publish → embed into the knowledge base so Ask Mayur can cite it.
    if (sop.status === "published") {
      try {
        const ingest = await routes.knowledge.ingestKnowledge({
          content: sopToRagContent(sop),
          title: `SOP: ${sop.title_en}`,
          category: "sop",
          tags: ["sop", sop.department],
          contentType: "manual",
          metadata: { sop_slug: sop.slug, department: sop.department },
        });
        if (ingest.success) {
          await supabaseAdmin
            .from("onehub_sops")
            .update({ rag_synced_at: new Date().toISOString() })
            .eq("id", sop.id);
        }
      } catch (ragErr) {
        console.error("SOP RAG ingest failed (SOP saved):", ragErr);
      }
    }

    return success(sop);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("onehub sops POST failed:", err);
    return error("Failed to save SOP", 500);
  }
}
