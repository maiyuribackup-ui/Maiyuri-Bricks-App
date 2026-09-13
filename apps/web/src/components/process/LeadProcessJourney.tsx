"use client";

/**
 * Journey strip for the lead detail page (PRD §7.4). Shows the live case,
 * or a "Start Lead-to-Delivery process" button when none exists yet.
 */
import { useState } from "react";
import { Workflow } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useProcessForEntity, useStartProcess } from "@/hooks/useProcess";
import { ProcessJourney } from "./ProcessJourney";

export interface LeadProcessJourneyProps {
  leadId: string;
  leadName: string;
}

const CAN_START = ["sales", "engineer", "founder", "owner"];

export function LeadProcessJourney({
  leadId,
  leadName,
}: LeadProcessJourneyProps) {
  const user = useAuthStore((s) => s.user);
  const query = useProcessForEntity("lead", leadId);
  const start = useStartProcess();
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <div className="h-12 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
    );
  }
  // A failed lookup (e.g. tables not seeded yet) must never break the lead page.
  if (query.isError) return null;

  const view = query.data ?? null;
  const canStart = CAN_START.includes(user?.role ?? "");

  if (!view) {
    if (!canStart) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          No process is running for this lead yet.
        </div>
        <button
          type="button"
          disabled={start.isPending}
          onClick={async () => {
            setError(null);
            try {
              await start.mutateAsync({
                process_key: "LEAD_TO_DELIVERY",
                entity_type: "lead",
                entity_id: leadId,
                context: { customer_name: leadName },
              });
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Failed to start the process",
              );
            }
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <Workflow className="h-4 w-4" />
          {start.isPending ? "Starting…" : "Start Lead-to-Delivery process"}
        </button>
        {error && (
          <p
            role="alert"
            className="w-full text-xs text-rose-600 dark:text-rose-300"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  const stageName = view.current_stage?.name ?? null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider">
          <Workflow className="h-3.5 w-3.5" /> {view.definition.name}
        </span>
        <span>
          {view.instance.status === "blocked"
            ? "Blocked"
            : view.instance.status === "completed"
              ? "Completed"
              : view.instance.status === "cancelled"
                ? "Cancelled"
                : stageName
                  ? `Now: ${stageName}`
                  : "Active"}
        </span>
      </div>
      <ProcessJourney
        steps={view.journey}
        href={`/processes/instances/${view.instance.id}`}
      />
    </div>
  );
}
