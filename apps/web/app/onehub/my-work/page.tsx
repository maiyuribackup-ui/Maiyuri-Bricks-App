"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Plus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import {
  useApproveWorkItem,
  useMyWorkQueue,
  useReturnWorkItem,
  useReviewQueue,
} from "@/hooks/useMyWork";
import { WorkItemCard } from "@/components/my-work/WorkItemCard";
import { CreateWorkItemDialog } from "@/components/my-work/CreateWorkItemDialog";
import { greetingForHour } from "@/lib/my-work-utils";
import { onehub } from "../theme";
import type { MyWorkFilter, WorkItem } from "@maiyuri/shared";

const FILTERS: { value: MyWorkFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
];

const ADMIN_ROLES = ["founder", "owner", "production_supervisor"];

export default function MyWorkPage() {
  const { user } = useAuthStore();
  const { data, isLoading, isError } = useMyWorkQueue();
  const [filter, setFilter] = useState<MyWorkFilter>("all");
  const [completedOpen, setCompletedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const queue = data?.data;
  const firstName = (user?.name ?? "").split(" ")[0] || "there";
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? "");

  const summaryCards = useMemo(
    () => [
      { label: "Overdue", value: queue?.summary.overdue ?? 0, fg: "#c1453e", bg: "#fbe4df" },
      { label: "Due Today", value: queue?.summary.due_today ?? 0, fg: "#b3781a", bg: "#f8ecd4" },
      { label: "In Progress", value: queue?.summary.in_progress ?? 0, fg: onehub.accent, bg: "#f7e3d8" },
      { label: "Completed", value: queue?.summary.completed_today ?? 0, fg: "#3f7d4d", bg: "#e4f1e3" },
    ],
    [queue],
  );

  const sections: { key: string; title: string; items: WorkItem[]; show: boolean }[] =
    useMemo(() => {
      if (!queue) return [];
      return [
        {
          key: "attention",
          title: "Attention Required",
          items: queue.attention,
          show:
            queue.attention.length > 0 &&
            (filter === "all" || filter === "overdue" || filter === "today"),
        },
        {
          key: "today",
          title: "Today",
          items: queue.today,
          show: filter === "all" || filter === "today",
        },
        {
          key: "upcoming",
          title: "Upcoming",
          items: queue.upcoming,
          show: filter === "all" || filter === "upcoming",
        },
      ];
    }, [queue, filter]);

  const openCount =
    (queue?.attention.length ?? 0) +
    (queue?.today.length ?? 0) +
    (queue?.upcoming.length ?? 0);

  return (
    <div className="mx-auto max-w-3xl pb-24">
      {/* Greeting + admin action */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold" style={{ color: onehub.brand }}>
            {greetingForHour(new Date().getHours())}, {firstName}
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: onehub.textMuted }}>
            Here&apos;s your work for today.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[44px] flex-shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
            style={{ background: onehub.accent }}
          >
            <Plus className="h-4 w-4" />
            Assign Work
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border p-3 text-center"
            style={{ background: onehub.card, borderColor: onehub.cardBorder }}
          >
            {isLoading ? (
              <div className="mx-auto h-7 w-10 animate-pulse rounded" style={{ background: card.bg }} />
            ) : (
              <p className="text-2xl font-bold" style={{ color: card.fg }}>
                {card.value}
              </p>
            )}
            <p className="mt-0.5 text-xs font-medium" style={{ color: onehub.textMuted }}>
              {card.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="min-h-[40px] flex-shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
            style={
              filter === f.value
                ? { background: onehub.brand, color: "#fff", borderColor: onehub.brand }
                : { background: onehub.card, color: onehub.textMuted, borderColor: onehub.cardBorder }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border"
              style={{ background: onehub.card, borderColor: onehub.cardBorder }}
            />
          ))}
        </div>
      ) : isError ? (
        <div
          className="mt-6 rounded-2xl border p-8 text-center"
          style={{ background: onehub.card, borderColor: onehub.cardBorder }}
        >
          <AlertTriangle className="mx-auto h-8 w-8" style={{ color: onehub.high.fg }} />
          <p className="mt-2 text-sm font-medium" style={{ color: onehub.text }}>
            Could not load your work. Please check your connection and try again.
          </p>
        </div>
      ) : (
        <>
          {sections.map(
            (section) =>
              section.show && (
                <section key={section.key} className="mt-6">
                  <h3
                    className="mb-2 text-xs font-bold uppercase tracking-wider"
                    style={{
                      color: section.key === "attention" ? "#c1453e" : onehub.textMuted,
                    }}
                  >
                    {section.title}
                    {section.items.length > 0 && ` (${section.items.length})`}
                  </h3>
                  {section.items.length === 0 ? (
                    <p className="text-sm" style={{ color: onehub.textMuted }}>
                      Nothing here.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {section.items.map((item) => (
                        <WorkItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </section>
              ),
          )}

          {/* All-clear / empty states (PRD §21) */}
          {filter === "all" && openCount === 0 && (
            <div
              className="mt-6 rounded-2xl border p-10 text-center"
              style={{ background: onehub.card, borderColor: onehub.cardBorder }}
            >
              <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: "#3f7d4d" }} />
              <p className="mt-3 font-semibold" style={{ color: onehub.text }}>
                {(queue?.completed_today.length ?? 0) > 0
                  ? "All work for today is complete."
                  : "You have no pending work today."}
              </p>
            </div>
          )}

          {/* Completed (collapsed by default) */}
          {(filter === "all" || filter === "completed") &&
            (queue?.completed_today.length ?? 0) > 0 && (
              <section className="mt-6">
                <button
                  onClick={() => setCompletedOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider"
                  style={{ color: onehub.textMuted }}
                >
                  Completed Today ({queue?.completed_today.length})
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      completedOpen || filter === "completed" ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {(completedOpen || filter === "completed") && (
                  <div className="mt-2 space-y-3">
                    {queue?.completed_today.map((item) => (
                      <WorkItemCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </section>
            )}
        </>
      )}

      {isAdmin && <ReviewQueueSection />}

      {isAdmin && (
        <CreateWorkItemDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}

/** Supervisor-only: submitted items awaiting approval, with approve/return. */
function ReviewQueueSection() {
  const { data, isLoading } = useReviewQueue();
  const approve = useApproveWorkItem();
  const returnItem = useReturnWorkItem();
  const [returningId, setReturningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const items = data?.data ?? [];

  if (isLoading || items.length === 0) return null;

  return (
    <section className="mt-8">
      <h3
        className="mb-2 text-xs font-bold uppercase tracking-wider"
        style={{ color: onehub.accent }}
      >
        📥 Awaiting your review ({items.length})
      </h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border p-4"
            style={{ background: onehub.card, borderColor: onehub.cardBorder }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold" style={{ color: onehub.text }}>
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: onehub.textMuted }}>
                  {item.assigned_user?.name ?? "Team member"} · submitted{" "}
                  {item.submitted_at
                    ? new Date(item.submitted_at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : ""}
                </p>
              </div>
              <a
                href={`/onehub/my-work/${item.id}`}
                className="flex-shrink-0 text-xs font-semibold underline"
                style={{ color: onehub.accent }}
              >
                View details
              </a>
            </div>

            {returningId === item.id ? (
              <div className="mt-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What needs to be corrected?"
                  rows={2}
                  className="w-full rounded-xl border p-2.5 text-sm"
                  style={{ borderColor: onehub.cardBorder, color: onehub.text }}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setReturningId(null);
                      setReason("");
                    }}
                    className="rounded-xl border px-3.5 py-2 text-sm font-medium"
                    style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      reason.trim().length >= 3 &&
                      returnItem.mutate(
                        { id: item.id, reason: reason.trim() },
                        {
                          onSuccess: () => {
                            setReturningId(null);
                            setReason("");
                          },
                        },
                      )
                    }
                    disabled={returnItem.isPending || reason.trim().length < 3}
                    className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "#c1453e" }}
                  >
                    {returnItem.isPending ? "Returning…" : "Return for correction"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => approve.mutate(item.id)}
                  disabled={approve.isPending}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "#3f7d4d" }}
                >
                  {approve.isPending ? "Approving…" : "✓ Approve"}
                </button>
                <button
                  onClick={() => setReturningId(item.id)}
                  className="rounded-xl border px-4 py-2 text-sm font-medium"
                  style={{ borderColor: "#c1453e", color: "#c1453e" }}
                >
                  ↩ Return
                </button>
              </div>
            )}
            {(approve.isError || returnItem.isError) && (
              <p className="mt-2 text-xs" style={{ color: "#c1453e" }}>
                {(approve.error ?? returnItem.error) instanceof Error
                  ? ((approve.error ?? returnItem.error) as Error).message
                  : "Action failed"}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
