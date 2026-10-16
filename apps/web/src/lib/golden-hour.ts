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

/**
 * GH4: the customer just OPENED their quote — the single hottest moment in the
 * funnel. Create a 2-hour "call now" task so the rep reaches them while the
 * numbers are on their screen. Deduped with a cooldown so repeated page views
 * don't spawn a task each time.
 */
const QUOTE_OPEN_CALLBACK_HOURS = 2;
const QUOTE_OPEN_COOLDOWN_MS = 6 * 60 * 60 * 1000; // one hot task per 6h of views

export async function createQuoteOpenCallback(smartQuoteId: string): Promise<void> {
  try {
    const { data: quote } = await supabaseAdmin
      .from("smart_quotes")
      .select("lead_id")
      .eq("id", smartQuoteId)
      .maybeSingle();
    if (!quote?.lead_id) return;
    const leadId = quote.lead_id as string;

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("name, contact, assigned_staff")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;

    // Cooldown: skip if an open callback task already exists for this lead, or
    // a very recent one was created (repeat views within the window).
    const { data: recent } = await supabaseAdmin
      .from("work_items")
      .select("id, status, created_at")
      .eq("related_lead_id", leadId)
      .eq("source_module", "quote_open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) {
      const openStates = ["pending", "in_progress", "returned"];
      const isOpen = openStates.includes(recent.status as string);
      const fresh =
        Date.now() - new Date(recent.created_at as string).getTime() <
        QUOTE_OPEN_COOLDOWN_MS;
      if (isOpen || fresh) return;
    }

    const assignee = await resolveAssignee(
      (lead.assigned_staff as string | null) ?? null,
    );
    if (!assignee) return;

    const label = (lead.name as string) || (lead.contact as string) || "Lead";
    const { data: item, error } = await supabaseAdmin
      .from("work_items")
      .insert({
        title: `🔥 Quote OPENED — call ${label} now`.slice(0, 200),
        description: `${label} is looking at their quote right now — call within ${QUOTE_OPEN_CALLBACK_HOURS} hours while it's hot. இப்போது கோட் பார்க்கிறார்கள் — உடனே அழையுங்கள்!`,
        activity_type: "simple",
        status: "pending",
        priority: "urgent",
        assigned_user_id: assignee,
        due_at: new Date(
          Date.now() + QUOTE_OPEN_CALLBACK_HOURS * 3_600_000,
        ).toISOString(),
        related_lead_id: leadId,
        related_label: label,
        source_module: "quote_open",
      })
      .select("*")
      .single();

    if (error || !item) {
      console.error("[GoldenHour] quote-open task insert failed:", error);
      return;
    }
    await notifyWorkAssigned(item as WorkItem);
  } catch (err) {
    console.error("[GoldenHour] createQuoteOpenCallback failed (ignored):", err);
  }
}
