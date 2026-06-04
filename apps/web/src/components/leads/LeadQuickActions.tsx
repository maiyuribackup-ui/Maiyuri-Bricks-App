"use client";

/**
 * LeadQuickActions — a bottom-sheet (mobile) / centered modal (desktop) that
 * lets a rep act on a lead WITHOUT opening the detail page: advance the
 * pipeline stage, set temperature, snooze the follow-up, reassign, or generate
 * a Smart Quote. Dumb component — the page wires the callbacks to mutations.
 */
import { useState } from "react";
import type { Lead, PipelineStage, LeadTemperature } from "@maiyuri/shared";
import { PIPELINE_STAGES, LEAD_TEMPERATURES } from "@/lib/lead-taxonomy";

interface StaffUser {
  id: string;
  name: string;
  role?: string;
}

export interface LeadQuickActionsProps {
  lead: Lead;
  users: StaffUser[];
  busy?: boolean;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  onGenerateQuote: () => void;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

export function LeadQuickActions({
  lead,
  users,
  busy,
  onClose,
  onPatch,
  onGenerateQuote,
}: LeadQuickActionsProps) {
  const [showAllStages, setShowAllStages] = useState(false);
  const activeStages = PIPELINE_STAGES.filter(
    (s) => s.value !== "order_won" && s.value !== "closed_lost",
  );
  const stagesToShow = showAllStages ? PIPELINE_STAGES : activeStages;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95">
        {/* Grab handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-white truncate">
              {lead.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {lead.contact}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {busy && (
          <div className="h-0.5 bg-blue-500 animate-pulse" aria-hidden />
        )}

        {/* Advance stage */}
        <Section title="Move to stage">
          <div className="grid grid-cols-2 gap-2">
            {stagesToShow.map((s) => {
              const isCurrent = s.value === lead.pipeline_stage;
              return (
                <button
                  key={s.value}
                  disabled={busy || isCurrent}
                  onClick={() =>
                    onPatch({
                      pipeline_stage: s.value as PipelineStage,
                      stage_updated_at: new Date().toISOString(),
                    })
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                    isCurrent
                      ? "ring-2 ring-blue-500 " + s.bg + " " + s.color
                      : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <span>{s.emoji}</span>
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </div>
          {!showAllStages && (
            <button
              onClick={() => setShowAllStages(true)}
              className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-medium"
            >
              Show won / lost…
            </button>
          )}
        </Section>

        {/* Temperature */}
        <Section title="Temperature">
          <div className="flex gap-2">
            {LEAD_TEMPERATURES.map((t) => {
              const isCurrent = t.value === lead.lead_temperature;
              return (
                <button
                  key={t.value}
                  disabled={busy || isCurrent}
                  onClick={() =>
                    onPatch({ lead_temperature: t.value as LeadTemperature })
                  }
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isCurrent
                      ? "ring-2 ring-blue-500 " + t.bg + " " + t.color
                      : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Snooze / schedule follow-up */}
        <Section title="Follow-up">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Today", days: 0 },
              { label: "Tomorrow", days: 1 },
              { label: "+3 days", days: 3 },
              { label: "+1 week", days: 7 },
            ].map((opt) => (
              <button
                key={opt.label}
                disabled={busy}
                onClick={() => onPatch({ follow_up_date: isoDate(opt.days) })}
                className="px-2 py-2.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Reassign */}
        {users.length > 0 && (
          <Section title="Assign to">
            <div className="flex flex-wrap gap-2">
              {users.map((u) => {
                const isCurrent = u.id === lead.assigned_staff;
                return (
                  <button
                    key={u.id}
                    disabled={busy || isCurrent}
                    onClick={() => onPatch({ assigned_staff: u.id })}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isCurrent
                        ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Smart Quote */}
        <Section title="Smart Quote">
          <button
            disabled={busy}
            onClick={onGenerateQuote}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
          >
            📄 Generate &amp; open Smart Quote
          </button>
        </Section>
      </div>
    </div>
  );
}
