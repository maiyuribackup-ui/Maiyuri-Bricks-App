/**
 * POST /api/feedback/[token]/submit
 *
 * Public, token-gated write endpoint. Visitor (or voice agent via tool call)
 * submits the structured feedback payload; we insert into `lead_feedback` and
 * leave a human-readable `notes` row on the staff timeline.
 *
 * Writes use the service-role client server-side. There is no client-side
 * write policy on `lead_feedback` (see migration 20260528000001), so the
 * route is the only path that can land rows in that table.
 *
 * See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 3a)
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { created, error, notFound, handleZodError } from "@/lib/api-utils";

const TOKEN_RE = /^[A-HJ-NP-Z2-9]{10}$/;

// Strict-but-forward-compatible payload schema.
// Top-level shape is locked; enum values inside arrays are forward-compatible
// (we accept any string, store verbatim, and let the reporting layer aggregate).
const submitSchema = z.object({
  channel: z.enum(["form", "voice"]),
  language: z.enum(["en", "ta"]).default("en"),

  visitor: z.object({
    name: z.string().trim().min(1).max(120),
    mobile: z
      .string()
      .transform((s) => s.replace(/\D/g, ""))
      .pipe(z.string().regex(/^\d{10}$/, "Mobile must be 10 digits")),
    build_type: z.string().max(60).optional().nullable(),
  }),

  visit: z.object({
    rating: z.number().int().min(1).max(5),
    impressed: z.array(z.string().max(60)).max(10).default([]),
    clarity: z
      .enum(["very_clear", "mostly_clear", "need_comparison", "not_clear"])
      .optional()
      .nullable(),
  }),

  product: z.object({
    benefits: z.array(z.string().max(60)).max(10).default([]),
    concerns: z.array(z.string().max(60)).max(15).default([]),
    timeline: z.string().max(60).optional().nullable(),
  }),

  next_step: z.object({
    action: z.string().max(60),
    detail: z.record(z.unknown()).optional().default({}),
    notes: z.string().max(2000).optional().nullable(),
  }),

  flags: z
    .object({
      priority_followup: z.boolean().optional(),
      followup_reason: z.string().max(200).optional(),
    })
    .optional()
    .default({}),

  voice: z
    .object({
      transcript: z.string().max(20000).optional().nullable(),
      duration_sec: z.number().int().min(0).max(36000).optional().nullable(),
    })
    .optional(),
});

type SubmitPayload = z.infer<typeof submitSchema>;

// Routing rule: certain clarity/next-step combinations need priority follow-up.
function derivePriorityFlag(p: SubmitPayload): {
  priority_followup: boolean;
  followup_reason?: string;
} {
  if (p.flags?.priority_followup) {
    return {
      priority_followup: true,
      followup_reason: p.flags.followup_reason,
    };
  }
  if (p.visit.clarity === "not_clear") {
    return { priority_followup: true, followup_reason: "Clarity unclear" };
  }
  if (p.visit.clarity === "need_comparison") {
    return {
      priority_followup: true,
      followup_reason: "Needs detailed comparison",
    };
  }
  if (p.next_step.action === "advisor" || p.next_step.action === "visit_project") {
    return {
      priority_followup: true,
      followup_reason: `Requested ${p.next_step.action}`,
    };
  }
  return { priority_followup: false };
}

// Build a human-readable summary for the `notes` row that staff will read.
function buildNoteText(p: SubmitPayload, leadName: string): string {
  const lines: string[] = [];
  lines.push(`Factory-visit feedback (${p.channel}) from ${leadName}.`);
  lines.push(`Rating: ${p.visit.rating}/5.`);
  if (p.visit.impressed.length) {
    lines.push(`Impressed by: ${p.visit.impressed.join(", ")}.`);
  }
  if (p.product.benefits.length) {
    lines.push(`Benefits matter: ${p.product.benefits.join(", ")}.`);
  }
  if (p.product.concerns.length) {
    lines.push(`Concerns: ${p.product.concerns.join(", ")}.`);
  }
  if (p.product.timeline) {
    lines.push(`Timeline: ${p.product.timeline}.`);
  }
  lines.push(`Requested next: ${p.next_step.action}.`);
  if (p.next_step.notes) {
    lines.push(`Note: ${p.next_step.notes}`);
  }
  return lines.join(" ");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !TOKEN_RE.test(token)) {
    return error("Invalid token format", 400);
  }

  // 1) Resolve token -> lead.
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, name, contact, next_action")
    .eq("feedback_token", token)
    .maybeSingle();

  if (leadErr) return error(leadErr.message, 500);
  if (!lead) return notFound("Feedback link not recognised");

  // 2) Validate payload.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return handleZodError(parsed.error);
  const payload = parsed.data;

  // 3) Derive routing flag.
  const flags = derivePriorityFlag(payload);

  // 4) Insert lead_feedback row.
  const ua = request.headers.get("user-agent")?.slice(0, 120) ?? null;

  const { data: fbRow, error: fbErr } = await supabaseAdmin
    .from("lead_feedback")
    .insert({
      lead_id: lead.id,
      channel: payload.channel,
      language: payload.language,
      rating: payload.visit.rating,
      impressed: payload.visit.impressed,
      clarity: payload.visit.clarity ?? null,
      benefits: payload.product.benefits,
      concerns: payload.product.concerns,
      timeline: payload.product.timeline ?? null,
      next_action: payload.next_step.action,
      next_action_detail: payload.next_step.detail ?? {},
      notes: payload.next_step.notes ?? null,
      voice_transcript: payload.voice?.transcript ?? null,
      voice_duration_sec: payload.voice?.duration_sec ?? null,
      flags,
      raw_payload: payload,
      submitted_from: ua,
    })
    .select("id, submitted_at")
    .single();

  if (fbErr) return error(fbErr.message, 500);

  // 5) Insert a notes row so this lands on the staff timeline.
  //    Best-effort: if this fails we still keep the lead_feedback row.
  const noteText = buildNoteText(payload, lead.name);
  const { error: noteErr } = await supabaseAdmin.from("notes").insert({
    lead_id: lead.id,
    text: noteText,
    ai_summary: noteText.slice(0, 240),
  });

  // 6) If the visitor asked for a concrete next thing, surface it on the
  //    lead's `next_action` field so it shows in the leads list.
  const NEXT_ACTION_LABELS: Record<string, string> = {
    quote: "Send personalised brick quantity + quote",
    floor_plan: "Review floor plan",
    advisor: "Schedule advisor call",
    architect: "Discuss with architect/builder",
    visit_project: "Show a completed project",
    reports: "Send test reports + product details",
    sample: "Arrange sample / Mudhal Sengal",
    later: "Follow up later (see feedback notes)",
    exploring: "Keep informed — visitor exploring",
  };
  const nextLabel = NEXT_ACTION_LABELS[payload.next_step.action];
  if (nextLabel && !lead.next_action) {
    await supabaseAdmin
      .from("leads")
      .update({ next_action: nextLabel })
      .eq("id", lead.id);
  }

  return created({
    id: fbRow!.id,
    submitted_at: fbRow!.submitted_at,
    priority_followup: flags.priority_followup,
    note_saved: !noteErr,
  });
}
