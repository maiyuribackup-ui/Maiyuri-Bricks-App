"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  ClipboardList,
  Clock,
  FileText,
  Tag,
} from "lucide-react";
import { onehub } from "@/lib/onehub-theme";
import { WORK_STATUS_LABELS, type WorkItem } from "@maiyuri/shared";
import { isOverdue } from "@/lib/my-work-utils";

const STATUS_TINTS: Record<string, { fg: string; bg: string }> = {
  overdue: { fg: "#c1453e", bg: "#fbe4df" },
  returned: { fg: "#c1453e", bg: "#fbe4df" },
  in_progress: { fg: "#b3781a", bg: "#f8ecd4" },
  pending: { fg: onehub.textMuted, bg: "#f3ece1" },
  submitted: { fg: "#3f7d4d", bg: "#e4f1e3" },
  completed: { fg: "#3f7d4d", bg: "#e4f1e3" },
  cancelled: { fg: onehub.textMuted, bg: "#f3ece1" },
};

function formatDue(dueAt: string | null): string {
  if (!dueAt) return "No due time";
  const due = new Date(dueAt);
  const now = new Date();
  const sameDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  const time = due.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today, ${time}`;
  return `${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

function actionLabel(item: WorkItem): string {
  if (item.status === "in_progress") return "Continue";
  if (item.status === "returned") return "Fix & Resubmit";
  if (item.status === "submitted" || item.status === "completed") return "View";
  if (item.activity_type === "checklist") return "Start Checklist";
  if (item.activity_type === "inspection") return "Start Inspection";
  return "Start";
}

export function WorkItemCard({ item }: { item: WorkItem }) {
  const overdue = isOverdue(item);
  const displayStatus = overdue && item.status !== "returned" ? "overdue" : item.status;
  const tint = STATUS_TINTS[displayStatus] ?? STATUS_TINTS.pending;
  const highlight = overdue || item.status === "returned";

  return (
    <Link
      href={`/onehub/my-work/${item.id}`}
      className="block rounded-2xl border p-4 transition-shadow hover:shadow-md"
      style={{
        background: onehub.card,
        borderColor: highlight ? "#eec3ba" : onehub.cardBorder,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: tint.fg, background: tint.bg }}
            >
              {WORK_STATUS_LABELS[displayStatus as keyof typeof WORK_STATUS_LABELS] ??
                displayStatus}
            </span>
            {(item.priority === "high" || item.priority === "urgent") && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ color: onehub.high.fg, background: onehub.high.bg }}
              >
                {item.priority === "urgent" ? "Urgent" : "High Priority"}
              </span>
            )}
          </div>

          <h3
            className="mt-1.5 truncate text-[15px] font-bold"
            style={{ color: onehub.text }}
          >
            {item.title}
          </h3>

          {item.status === "returned" && item.return_reason && (
            <p className="mt-1 flex items-start gap-1 text-xs" style={{ color: "#c1453e" }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {item.return_reason}
            </p>
          )}

          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            style={{ color: onehub.textMuted }}
          >
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDue(item.due_at)}
            </span>
            {item.related_label && (
              <span className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                {item.related_label}
              </span>
            )}
            {item.checklist_progress && (
              <span className="flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5" />
                {item.checklist_progress.answered}/{item.checklist_progress.total} items
              </span>
            )}
            {item.activity_type === "checklist" && !item.checklist_progress && (
              <span className="flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5" />
                Checklist
              </span>
            )}
            {item.requires_photo && (
              <span className="flex items-center gap-1">
                <Camera className="h-3.5 w-3.5" />
                Photo required
              </span>
            )}
            {item.requires_note && (
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                Note required
              </span>
            )}
          </div>
        </div>

        <span
          className="mt-1 flex-shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold text-white"
          style={{ background: onehub.accent }}
        >
          {actionLabel(item)}
        </span>
      </div>
    </Link>
  );
}
