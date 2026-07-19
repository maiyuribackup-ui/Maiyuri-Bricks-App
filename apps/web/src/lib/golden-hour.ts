/**
 * Golden First Hour (GH1): every new lead gets a first-response task due in
 * 30 MINUTES, assigned to the lead's rep (fallback: first active sales →
 * engineer → founder). The accountability engine takes it from there — task
 * card on the rep's home, 2h nags, founder escalation, evening chaser.
 *
 * Speed-to-lead is the single biggest conversion lever in this market: a
 * callback inside 30 minutes beats next-day by multiples.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyWorkAssigned } from "@/lib/my-work-notify";
import type { WorkItem } from "@maiyuri/shared";

const FIRST_RESPONSE_SLA_MINUTES = 30;

async function resolveAssignee(assignedStaff: string | null): Promise<string | null> {
  if (assignedStaff) return assignedStaff;
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, role")
    .eq("is_active", true)
    .in("role", ["sales", "engineer", "founder", "owner"]);
  const byRole = (r: string) => data?.find((u) => u.role === r)?.id;
  return (
    byRole("sales") ?? byRole("engineer") ?? byRole("founder") ?? byRole("owner") ?? null
  );
}

/**
 * Fire-and-forget from every lead-creation path. Never throws; a failed SLA
 * task must not fail lead creation. One open golden-hour task per lead.
 */
export async function createFirstResponseTask(lead: {
  id: string;
  name: string | null;
  contact?: string | null;
  assigned_staff?: string | null;
  source?: string | null;
}): Promise<void> {
  try {
    // Dedupe — webhook + processor can both fire for the same new lead.
    const { data: existing } = await supabaseAdmin
      .from("work_items")
      .select("id")
      .eq("related_lead_id", lead.id)
      .eq("source_module", "golden_hour")
      .in("status", ["pending", "in_progress", "returned"])
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const assignee = await resolveAssignee(lead.assigned_staff ?? null);
    if (!assignee) return;

    const dueAt = new Date(
      Date.now() + FIRST_RESPONSE_SLA_MINUTES * 60_000,
    ).toISOString();
    const label = lead.name || lead.contact || "New lead";

    const { data: item, error } = await supabaseAdmin
      .from("work_items")
      .insert({
        title: `⚡ First call in 30 min — ${label}`.slice(0, 200),
        description: `New lead${lead.source ? ` from ${lead.source}` : ""}. Call within ${FIRST_RESPONSE_SLA_MINUTES} minutes — speed wins the order. முதல் அழைப்பு 30 நிமிடத்தில்!`,
        activity_type: "simple",
        status: "pending",
        priority: "urgent",
        assigned_user_id: assignee,
        due_at: dueAt,
        related_lead_id: lead.id,
        related_label: label,
        source_module: "golden_hour",
      })
      .select("*")
      .single();

    if (error || !item) {
      console.error("[GoldenHour] SLA task insert failed:", error);
      return;
    }
    await notifyWorkAssigned(item as WorkItem);
  } catch (err) {
    console.error("[GoldenHour] createFirstResponseTask failed (ignored):", err);
  }
}
