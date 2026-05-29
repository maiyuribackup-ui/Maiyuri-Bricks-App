"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, Badge } from "@maiyuri/ui";
import type { Lead } from "@maiyuri/shared";

interface FeedbackResultsCardProps {
  lead: Lead;
}

interface FeedbackRow {
  id: string;
  channel: "form" | "voice";
  language: "en" | "ta";
  rating: number;
  impressed: string[];
  clarity: string | null;
  benefits: string[];
  concerns: string[];
  timeline: string | null;
  next_action: string;
  next_action_detail: Record<string, unknown> | null;
  notes: string | null;
  voice_transcript: string | null;
  voice_duration_sec: number | null;
  flags: { priority_followup?: boolean; followup_reason?: string } | null;
  submitted_at: string;
}

const NEXT_ACTION_LABELS: Record<string, string> = {
  quote: "Send personalised brick quantity + quote",
  floor_plan: "Review floor plan",
  advisor: "Schedule advisor call",
  architect: "Discuss with architect/builder",
  visit_project: "Show a completed project",
  reports: "Send test reports + product details",
  sample: "Arrange sample / Mudhal Sengal",
  later: "Follow up later",
  exploring: "Keep informed — exploring",
};

const CLARITY_LABELS: Record<string, string> = {
  very_clear: "Very clear",
  mostly_clear: "Mostly clear",
  need_comparison: "Needs comparison",
  not_clear: "Not clear",
};

async function fetchFeedback(leadId: string): Promise<FeedbackRow[]> {
  const res = await fetch(`/api/leads/${leadId}/feedback`);
  if (!res.ok) throw new Error("Failed to load feedback");
  const json = await res.json();
  return (json.data ?? []) as FeedbackRow[];
}

function ratingStars(n: number): string {
  const r = Math.max(0, Math.min(5, n));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ChipRow({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "green" | "amber" | "blue";
}) {
  if (!items.length) return null;
  const toneClass =
    tone === "green"
      ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            className={`px-2 py-0.5 rounded-full text-xs ${toneClass}`}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders the factory-visit feedback a customer submitted, on the lead detail
 * page — right below the QR card a salesperson uses to collect it. Returns null
 * when there is no feedback yet, so the card simply doesn't appear.
 */
export function FeedbackResultsCard({ lead }: FeedbackResultsCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-feedback", lead.id],
    queryFn: () => fetchFeedback(lead.id),
  });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <ChatIcon className="h-4 w-4 text-emerald-500" />
          Visit Feedback
          {data.length > 1 && (
            <span className="text-xs text-slate-400">({data.length})</span>
          )}
        </h3>
      </div>

      <div className="space-y-5">
        {data.map((fb) => {
          const priority = fb.flags?.priority_followup;
          const nextLabel = NEXT_ACTION_LABELS[fb.next_action] ?? fb.next_action;
          return (
            <div
              key={fb.id}
              className="space-y-3 border-b border-slate-100 dark:border-slate-800 last:border-0 pb-4 last:pb-0"
            >
              {/* Header: rating + channel + date */}
              <div className="flex items-center justify-between">
                <span
                  className="text-amber-500 text-lg leading-none"
                  title={`${fb.rating}/5`}
                >
                  {ratingStars(fb.rating)}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs uppercase">
                    {fb.channel}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {formatDate(fb.submitted_at)}
                  </span>
                </div>
              </div>

              {priority && (
                <div className="flex items-center gap-1.5 rounded-md bg-red-50 dark:bg-red-900/30 px-2.5 py-1.5">
                  <span className="text-sm">⚠️</span>
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">
                    Priority follow-up
                    {fb.flags?.followup_reason
                      ? ` — ${fb.flags.followup_reason}`
                      : ""}
                  </span>
                </div>
              )}

              <ChipRow label="Impressed by" items={fb.impressed} tone="green" />
              <ChipRow
                label="Benefits that matter"
                items={fb.benefits}
                tone="blue"
              />
              <ChipRow label="Concerns" items={fb.concerns} tone="amber" />

              {(fb.clarity || fb.timeline) && (
                <div className="flex flex-wrap gap-4">
                  {fb.clarity && (
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Clarity
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {CLARITY_LABELS[fb.clarity] ?? fb.clarity}
                      </p>
                    </div>
                  )}
                  {fb.timeline && (
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Timeline
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {fb.timeline}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Wants next
                </p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {nextLabel}
                </p>
              </div>

              {fb.notes && (
                <div className="rounded-md bg-slate-50 dark:bg-slate-800 p-2.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                    Note
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {fb.notes}
                  </p>
                </div>
              )}

              {fb.voice_transcript && (
                <details className="rounded-md bg-slate-50 dark:bg-slate-800 p-2.5">
                  <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                    Voice transcript
                    {fb.voice_duration_sec
                      ? ` (${Math.round(fb.voice_duration_sec)}s)`
                      : ""}
                  </summary>
                  <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {fb.voice_transcript}
                  </p>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  );
}

export default FeedbackResultsCard;
