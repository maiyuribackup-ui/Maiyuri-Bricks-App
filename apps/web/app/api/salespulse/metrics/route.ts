/**
 * GET /api/salespulse/metrics?window=daily|weekly
 *
 * Token-gated, read-only sales-intelligence gatherer for the SalesPulse digest.
 * Runs server-side with the service-role client (which already lives on Vercel),
 * so callers never need the database key. The only credential a caller holds is
 * the scoped SALESPULSE_TOKEN bearer — its entire blast radius is "read these
 * aggregated sales metrics".
 *
 * This is the TypeScript port of scripts/gather_metrics.py; the emitted JSON
 * shape is kept identical so the digest-composition guidance stays valid.
 *
 * Auth: Authorization: Bearer <SALESPULSE_TOKEN>
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { error, unauthorized } from "@/lib/api-utils";

const FUNNEL_STAGES = [
  "inquiry",
  "quote_sent",
  "factory_visit_pending",
  "factory_visit_completed",
  "negotiation",
  "order_confirmed",
] as const;
const ACTIVE_STATUSES = ["new", "follow_up", "hot", "cold"] as const;

function avg(xs: number[]): number | null {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(request: NextRequest) {
  // ---- Auth ----
  const expected = process.env.SALESPULSE_TOKEN;
  if (!expected) {
    return error("SALESPULSE_TOKEN not configured on server", 500);
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== expected) {
    return unauthorized("Invalid or missing SalesPulse token");
  }

  const windowParam = request.nextUrl.searchParams.get("window") === "weekly" ? "weekly" : "daily";
  const sb = getSupabaseAdmin();

  // ---- Windows ----
  const now = new Date();
  const spanMs = (windowParam === "weekly" ? 7 : 1) * 24 * 60 * 60 * 1000;
  const curStart = new Date(now.getTime() - spanMs);
  const prevStart = new Date(now.getTime() - 2 * spanMs);
  const curS = curStart.toISOString();
  const curE = now.toISOString();
  const prevS = prevStart.toISOString();
  const prevE = curStart.toISOString();
  const today = now.toISOString().slice(0, 10);

  // Small helper: exact count with head request.
  const countRows = async (
    build: (q: ReturnType<typeof sb.from>) => any
  ): Promise<number> => {
    const { count, error: e } = await build(sb.from("leads"));
    if (e) return 0;
    return count ?? 0;
  };

  // ---- Pipeline funnel (active snapshot) ----
  const { data: stageRows } = await sb
    .from("leads")
    .select("stage")
    .eq("is_archived", false);
  const funnelOut: Record<string, number> = {};
  for (const s of FUNNEL_STAGES) funnelOut[s] = 0;
  for (const r of stageRows ?? []) {
    const s = (r as any).stage;
    if (s in funnelOut) funnelOut[s] += 1;
  }

  // ---- Status snapshot (active) ----
  const { data: statusRows } = await sb
    .from("leads")
    .select("status")
    .eq("is_archived", false);
  const statusOut: Record<string, number> = {};
  for (const s of ACTIVE_STATUSES) statusOut[s] = 0;
  for (const r of statusRows ?? []) {
    const s = (r as any).status;
    if (s in statusOut) statusOut[s] += 1;
  }

  // ---- New leads current vs previous ----
  const newCur = await countRows((q) =>
    (q.select("id", { count: "exact", head: true }) as any).gte("created_at", curS).lte("created_at", curE)
  );
  const newPrev = await countRows((q) =>
    (q.select("id", { count: "exact", head: true }) as any).gte("created_at", prevS).lte("created_at", prevE)
  );

  // ---- Conversions (stage->order_confirmed in window) ----
  const convCur = await countRows((q) =>
    (q.select("id", { count: "exact", head: true }) as any)
      .eq("stage", "order_confirmed")
      .gte("stage_updated_at", curS)
      .lte("stage_updated_at", curE)
  );
  const convPrev = await countRows((q) =>
    (q.select("id", { count: "exact", head: true }) as any)
      .eq("stage", "order_confirmed")
      .gte("stage_updated_at", prevS)
      .lte("stage_updated_at", prevE)
  );
  const lostCur = await countRows((q) =>
    (q.select("id", { count: "exact", head: true }) as any)
      .eq("status", "lost")
      .gte("updated_at", curS)
      .lte("updated_at", curE)
  );

  // ---- Pipeline value ----
  const { data: amtRows } = await sb
    .from("leads")
    .select("odoo_quote_amount")
    .eq("is_archived", false);
  const quotedValue = (amtRows ?? []).reduce((acc: number, r: any) => {
    const v = parseFloat(r.odoo_quote_amount);
    return acc + (isFinite(v) ? v : 0);
  }, 0);
  const { data: wonRows } = await sb
    .from("leads")
    .select("odoo_order_amount")
    .eq("stage", "order_confirmed")
    .gte("stage_updated_at", curS)
    .lte("stage_updated_at", curE);
  const wonValue = (wonRows ?? []).reduce((acc: number, r: any) => {
    const v = parseFloat(r.odoo_order_amount);
    return acc + (isFinite(v) ? v : 0);
  }, 0);

  // ---- Stale hot leads ----
  const { data: hot } = await sb
    .from("leads")
    .select("name,last_interaction_at,next_action,assigned_staff")
    .eq("status", "hot")
    .eq("is_archived", false)
    .order("last_interaction_at", { ascending: true, nullsFirst: true })
    .limit(8);

  // ---- Overdue follow-ups ----
  const { data: overdue } = await sb
    .from("leads")
    .select("name,follow_up_date,next_action,assigned_staff")
    .eq("status", "follow_up")
    .eq("is_archived", false)
    .lt("follow_up_date", today)
    .order("follow_up_date", { ascending: true })
    .limit(15);

  // ---- Lead source performance (new leads in window) ----
  const { data: srcRows } = await sb
    .from("leads")
    .select("source")
    .gte("created_at", curS)
    .lte("created_at", curE);
  const sources: Record<string, number> = {};
  for (const r of srcRows ?? []) {
    const key = (r as any).source || "unknown";
    sources[key] = (sources[key] ?? 0) + 1;
  }

  // ---- Objections, competitors, scores (active pipeline) ----
  const { data: objRows } = await sb
    .from("leads")
    .select("dominant_objection,competitors_mentioned,momentum_score,ai_score")
    .eq("is_archived", false);
  const objCounter: Record<string, number> = {};
  const compCounter: Record<string, number> = {};
  const momentumVals: number[] = [];
  const aiVals: number[] = [];
  for (const r of objRows ?? []) {
    const o = (r as any).dominant_objection;
    if (o) objCounter[o] = (objCounter[o] ?? 0) + 1;
    const cm = (r as any).competitors_mentioned;
    if (Array.isArray(cm)) {
      for (const c of cm) if (c) compCounter[c] = (compCounter[c] ?? 0) + 1;
    } else if (typeof cm === "string" && cm) {
      compCounter[cm] = (compCounter[cm] ?? 0) + 1;
    }
    const m = (r as any).momentum_score;
    if (typeof m === "number") momentumVals.push(m);
    const a = (r as any).ai_score;
    if (typeof a === "number") aiVals.push(a);
  }
  const topN = (obj: Record<string, number>, n: number) =>
    Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n));

  // ---- Feedback in window ----
  const { data: fb } = await sb
    .from("lead_feedback")
    .select("rating,concerns,flags,submitted_at")
    .gte("submitted_at", curS)
    .lte("submitted_at", curE);
  const fbRatings: number[] = [];
  const fbConcerns: Record<string, number> = {};
  let fbPriority = 0;
  for (const r of fb ?? []) {
    const rating = (r as any).rating;
    if (typeof rating === "number") fbRatings.push(rating);
    const concerns = (r as any).concerns;
    if (Array.isArray(concerns)) for (const c of concerns) fbConcerns[c] = (fbConcerns[c] ?? 0) + 1;
    const flags = (r as any).flags;
    if (flags && typeof flags === "object" && flags.priority_followup) fbPriority += 1;
  }

  // ---- Resolve assigned_staff UUID -> name ----
  const { data: allUsers } = await sb.from("users").select("id,name");
  const idToName: Record<string, string> = {};
  for (const u of allUsers ?? []) idToName[(u as any).id] = (u as any).name;
  const resolve = (rows: any[] | null | undefined) =>
    (rows ?? []).map((row) => {
      const out = { ...row };
      if (out.assigned_staff) {
        out.assigned_to = idToName[out.assigned_staff] ?? "unassigned";
        delete out.assigned_staff;
      }
      return out;
    });
  const hotOut = resolve(hot);
  const overdueOut = resolve(overdue);

  // ---- Staff performance ----
  const { data: staff } = await sb
    .from("users")
    .select("id,name,role")
    .eq("is_active", true)
    .in("role", ["founder", "engineer", "accountant", "sales", "owner"]);
  const staffOut: any[] = [];
  for (const u of staff ?? []) {
    const uid = (u as any).id;
    const assigned = await countRows((q) =>
      (q.select("id", { count: "exact", head: true }) as any)
        .eq("assigned_staff", uid)
        .gte("created_at", curS)
        .lte("created_at", curE)
    );
    let notesAdded = 0;
    {
      const { count } = await sb
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", uid)
        .gte("created_at", curS)
        .lte("created_at", curE);
      notesAdded = count ?? 0;
    }
    const openLeads = await countRows((q) =>
      (q.select("id", { count: "exact", head: true }) as any)
        .eq("assigned_staff", uid)
        .eq("is_archived", false)
        .in("status", ACTIVE_STATUSES as unknown as string[])
    );
    const converted = await countRows((q) =>
      (q.select("id", { count: "exact", head: true }) as any)
        .eq("assigned_staff", uid)
        .eq("stage", "order_confirmed")
        .gte("stage_updated_at", curS)
        .lte("stage_updated_at", curE)
    );
    staffOut.push({
      name: (u as any).name,
      role: (u as any).role,
      leads_assigned: assigned,
      notes_added: notesAdded,
      open_leads: openLeads,
      converted,
    });
  }

  const payload = {
    generated_at: now.toISOString(),
    window: windowParam,
    window_current: { start: curS, end: curE },
    window_previous: { start: prevS, end: prevE },
    pipeline_funnel: funnelOut,
    status_snapshot: statusOut,
    new_leads: { current: newCur, previous: newPrev },
    conversions: { current: convCur, previous: convPrev, lost_current: lostCur },
    pipeline_value: {
      quoted_total_active: round2(quotedValue),
      won_in_window: round2(wonValue),
      currency_hint: "odoo amounts (verify INR/AED with finance)",
    },
    stale_hot_leads: hotOut,
    overdue_followups: { count: overdueOut.length, sample: overdueOut.slice(0, 10) },
    lead_sources_in_window: sources,
    objections_active: topN(objCounter, 6),
    competitors_mentioned: topN(compCounter, 6),
    scores: { avg_momentum: avg(momentumVals), avg_ai_score: avg(aiVals) },
    feedback_in_window: {
      count: (fb ?? []).length,
      avg_rating: avg(fbRatings),
      top_concerns: topN(fbConcerns, 6),
      priority_followups: fbPriority,
    },
    staff_performance: staffOut,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
