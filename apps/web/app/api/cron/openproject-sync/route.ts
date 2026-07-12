export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyWorkAssigned } from "@/lib/my-work-notify";
import {
  closeWorkPackage,
  commentOnWorkPackage,
  fetchClosedStatusHref,
  fetchOpenAssignedWorkPackages,
  fetchUserEmail,
  isOpenProjectConfigured,
  isUnreachableError,
  type OpWorkPackage,
} from "@/lib/openproject";
import type { WorkItem } from "@maiyuri/shared";

const CRON_SECRET = process.env.CRON_SECRET;
const OP_URL = process.env.OPENPROJECT_URL?.replace(/\/$/, "");

/**
 * POST /api/cron/openproject-sync — the OpenProject ↔ My Work bridge.
 *
 * OpenProject = the founder's planning cockpit (Gantt, dependencies).
 * My Work    = the ONE queue staff see on their phones.
 *
 * Pass A (OP → phones): every open, assigned work package becomes a
 *   work_item for the matching app user (matched by email), with a push
 *   notification. Idempotent via source_module='openproject' +
 *   source_record_id=<wp id>. Title/due changes flow through; packages
 *   closed in OP cancel their local item.
 *
 * Pass B (phones → OP): work_items COMPLETED in the app whose package is
 *   still open in OP get the package closed + a completion comment — the
 *   Gantt updates itself from field reality.
 *
 * The OP host is a PC behind a Cloudflare tunnel and is often OFF. That is
 * a normal state: we return success with skipped=true so the workflow's
 * failure alert only fires on real bugs.
 */

const PRIORITY_MAP: Record<string, string> = {
  low: "low",
  normal: "medium",
  high: "high",
  immediate: "urgent",
};

function dueAtFromOp(dueDate: string | null): string | null {
  // OP due dates are plain days; anchor to 18:00 IST like manual assignments.
  return dueDate ? new Date(`${dueDate}T18:00:00+05:30`).toISOString() : null;
}

function wpUrl(id: number): string {
  return `${OP_URL}/work_packages/${id}`;
}

export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return error("Unauthorized", 401);
    }
  }
  if (!isOpenProjectConfigured()) {
    return success({ skipped: true, reason: "OpenProject not configured" });
  }

  try {
    // ---- Pull the open, assigned packages ----
    let packages: OpWorkPackage[];
    try {
      packages = await fetchOpenAssignedWorkPackages();
    } catch (err) {
      if (isUnreachableError(err)) {
        return success({
          skipped: true,
          reason: "OpenProject unreachable (tunnel host offline?)",
        });
      }
      throw err;
    }

    // ---- Resolve assignee emails (cache per user href) ----
    const emailByHref = new Map<string, string | null>();
    for (const wp of packages) {
      const href = wp._links.assignee?.href;
      if (href && !emailByHref.has(href)) {
        emailByHref.set(href, await fetchUserEmail(href));
      }
    }

    // ---- App users by email ----
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email, role, is_active")
      .eq("is_active", true);
    const userByEmail = new Map(
      (users ?? []).map((u) => [String(u.email).toLowerCase(), u]),
    );
    const assigner =
      (users ?? []).find((u) => u.role === "founder") ??
      (users ?? []).find((u) => u.role === "owner");

    // ---- Existing bridged items ----
    const { data: existingRows } = await supabaseAdmin
      .from("work_items")
      .select(
        "id, source_record_id, status, title, due_at, note, completed_at, assigned_user_id",
      )
      .eq("source_module", "openproject");
    const existingByWp = new Map(
      (existingRows ?? []).map((r) => [String(r.source_record_id), r]),
    );
    const openWpIds = new Set(packages.map((wp) => String(wp.id)));

    let created = 0;
    let updated = 0;
    let unmatchedAssignees = 0;

    // ---- Pass A: OP → work_items ----
    for (const wp of packages) {
      const href = wp._links.assignee?.href;
      const email = href ? emailByHref.get(href) : null;
      const appUser = email ? userByEmail.get(email.toLowerCase()) : undefined;
      if (!appUser) {
        unmatchedAssignees++;
        continue; // assignee has no active app account — planning-only package
      }

      const existing = existingByWp.get(String(wp.id));
      const due_at = dueAtFromOp(wp.dueDate);
      const priority =
        PRIORITY_MAP[(wp._links.priority?.title ?? "").toLowerCase()] ?? "medium";

      if (!existing) {
        const { data: item, error: insErr } = await supabaseAdmin
          .from("work_items")
          .insert({
            title: wp.subject,
            description: [
              wp.description?.raw?.trim() || null,
              `OpenProject: ${wpUrl(wp.id)}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
            activity_type: "simple",
            priority,
            status: "pending",
            assigned_user_id: appUser.id,
            assigned_by_user_id: assigner?.id ?? appUser.id,
            due_at,
            related_label: wp._links.project.title ?? "OpenProject",
            source_module: "openproject",
            source_record_id: String(wp.id),
          })
          .select("*")
          .single();
        if (insErr || !item) {
          console.error("[OPSync] insert failed for wp", wp.id, insErr);
          continue;
        }
        created++;
        try {
          await notifyWorkAssigned(item as WorkItem);
        } catch (nErr) {
          console.error("[OPSync] notify failed:", nErr);
        }
      } else if (
        (existing.status === "pending" || existing.status === "in_progress") &&
        (existing.title !== wp.subject || existing.due_at !== due_at)
      ) {
        const { error: updErr } = await supabaseAdmin
          .from("work_items")
          .update({ title: wp.subject, due_at, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (!updErr) updated++;
      }
    }

    // ---- Pass A2: closed in OP → cancel local open items ----
    let cancelled = 0;
    for (const row of existingRows ?? []) {
      if (
        !openWpIds.has(String(row.source_record_id)) &&
        (row.status === "pending" || row.status === "in_progress")
      ) {
        const { error: cErr } = await supabaseAdmin
          .from("work_items")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (!cErr) cancelled++;
      }
    }

    // ---- Pass B: completed locally → close the OP package ----
    let closedInOp = 0;
    const toClose = (existingRows ?? []).filter(
      (r) => r.status === "completed" && openWpIds.has(String(r.source_record_id)),
    );
    if (toClose.length) {
      const closedHref = await fetchClosedStatusHref();
      if (closedHref) {
        const wpById = new Map(packages.map((wp) => [String(wp.id), wp]));
        for (const row of toClose) {
          const wp = wpById.get(String(row.source_record_id))!;
          try {
            await commentOnWorkPackage(
              wp.id,
              `✅ Completed in Maiyuri app on ${row.completed_at ?? "unknown date"}` +
                (row.note ? ` — note: ${row.note}` : ""),
            );
            await closeWorkPackage(wp.id, wp.lockVersion, closedHref);
            closedInOp++;
          } catch (wErr) {
            // lockVersion races just retry next cycle.
            console.error("[OPSync] close failed for wp", wp.id, wErr);
          }
        }
      }
    }

    return success({
      packages: packages.length,
      created,
      updated,
      cancelled,
      closed_in_op: closedInOp,
      unmatched_assignees: unmatchedAssignees,
    });
  } catch (err) {
    console.error("[OPSync] failed:", err);
    return error(err instanceof Error ? err.message : "OpenProject sync failed", 500);
  }
}
