export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/supabase-server";
import { success, error } from "@/lib/api-utils";
import {
  parseCsv,
  detectColumn,
  normalizePhone,
  reconcile,
} from "@/lib/reconciliation/superfone";

// POST /api/reconciliation/superfone — diff a Superfone call-log CSV against
// CRM leads and return the callers that never became a lead. Founder/owner only.
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return error("Unauthorized", 401);

    const { data: me } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!me || !["founder", "owner"].includes(me.role)) {
      return error("Forbidden", 403);
    }

    const body = await request.json().catch(() => ({}));
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) return error("Missing CSV content", 400);
    const sinceDays =
      typeof body.sinceDays === "number" && body.sinceDays > 0
        ? Math.floor(body.sinceDays)
        : null;

    const { headers, rows } = parseCsv(csv);
    if (!headers.length || !rows.length) {
      return error("CSV has no data rows", 400);
    }

    // Locate the phone column: caller-supplied override, else auto-detect.
    const phoneIdx =
      typeof body.phoneColumn === "string" && headers.includes(body.phoneColumn)
        ? headers.indexOf(body.phoneColumn)
        : detectColumn(headers, [
            /phone/i,
            /mobile/i,
            /\bnumber\b/i,
            /caller/i,
            /from/i,
            /contact/i,
          ]);

    // Couldn't guess — let the UI present a column picker.
    if (phoneIdx < 0) {
      return success({ needsColumn: true, headers });
    }

    const nameIdx = detectColumn(headers, [/name/i, /caller/i]);
    const dateIdx = detectColumn(headers, [/date|time|timestamp/i]);

    const calls = rows.map((r) => ({
      phone: r[phoneIdx] ?? "",
      name: nameIdx >= 0 ? (r[nameIdx] ?? null) : null,
      at: dateIdx >= 0 ? (r[dateIdx] ?? null) : null,
    }));

    // Build the set of known lead phone numbers (optionally windowed).
    let query = supabaseAdmin.from("leads").select("contact, created_at");
    if (sinceDays) {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      query = query.gte("created_at", since);
    }
    const { data: leads, error: dbErr } = await query;
    if (dbErr) {
      console.error("reconcile leads query error:", dbErr);
      return error("Failed to load leads", 500);
    }

    const leadPhones = new Set(
      (leads ?? [])
        .map((l) => normalizePhone(l.contact as string | null))
        .filter(Boolean),
    );

    const result = reconcile(calls, leadPhones);
    return success({
      ...result,
      leadsConsidered: leadPhones.size,
      phoneColumn: headers[phoneIdx],
      sinceDays,
    });
  } catch (err) {
    console.error("reconcile error:", err);
    return error("Internal server error", 500);
  }
}
