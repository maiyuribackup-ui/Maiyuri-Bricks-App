"use client";

/**
 * LeadQuickActions — a bottom-sheet (mobile) / centered modal (desktop) that
 * lets a rep act on a lead WITHOUT opening the detail page: change status,
 * advance the pipeline stage, set temperature, snooze the follow-up, add a
 * quick note, set the next action, or generate a Smart Quote.
 * Dumb component — the page wires the callbacks to mutations.
 */
import { useState } from "react";
import type { Lead, PipelineStage, LeadTemperature, LeadStatus } from "@maiyuri/shared";
import {
  PIPELINE_STAGES,
  LEAD_TEMPERATURES,
  LEAD_STATUSES,
} from "@/lib/lead-taxonomy";

export interface LeadQuickActionsProps {
  lead: Lead;
  busy?: boolean;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  onGenerateQuote: () => void;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  busy,
  onClose,
  onPatch,
  onGenerateQuote,
}: LeadQuickActionsProps) {
  const [showAllStages, setShowAllStages] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [nextActionText, setNextActionText] = useState(lead.next_action ?? "");

  const activeStages = PIPELINE_STAGES.filter(
    (s) => s.value !== "order_won" && s.value !== "closed_lost",
  );
  const stagesToShow = showAllStages ? PIPELINE_STAGES : activeStages;

  const handleSaveNote = () => {
    if (!noteText.trim()) return;
    const timestamp = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const newNote = `[${timestamp}] ${noteText.trim()}`;
    const combined = lead.staff_notes
      ? `${newNote}\n\n${lead.staff_notes}`
      : newNote;
    onPatch({ staff_notes: combined });
    setNoteText("");
  };

  const handleSaveNextAction = () => {
    if (nextActionText.trim() === (lead.next_action ?? "")) return;
    onPatch({ next_action: nextActionText.trim() || null });
  };

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
      <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95">
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

        {/* Status */}
        <Section title="Status">
          <div className="grid grid-cols-2 gap-2">
            {LEAD_STATUSES.map((s) => {
              const isCurrent = s.value === lead.lead_status;
              return (
                <button
                  key={s.value}
                  disabled={busy || isCurrent}
                  onClick={() =>
                    onPatch({ lead_status: s.value as LeadStatus })
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
        </Section>

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

        {/* Follow-up date */}
        <Section title="Follow-up Due Date">
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
          {lead.follow_up_date && (
            <p className="mt-1.5 text-xs text-purple-600 dark:text-purple-400 font-medium">
              Current: {new Date(lead.follow_up_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          )}
        </Section>

        {/* Next Action */}
        <Section title="Next Action">
          <textarea
            rows={2}
            value={nextActionText}
            onChange={(e) => setNextActionText(e.target.value)}
            placeholder="e.g. Share quote, schedule factory visit…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
          <button
            disabled={busy || nextActionText.trim() === (lead.next_action ?? "")}
            onClick={handleSaveNextAction}
            className="mt-2 w-full py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors"
          >
            Save Next Action
          </button>
        </Section>

        {/* Add Note */}
        <Section title="Add Note">
          <textarea
            rows={3}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Quick note about this lead…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            disabled={busy || !noteText.trim()}
            onClick={handleSaveNote}
            className="mt-2 w-full py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
          >
            Add Note
          </button>
          {lead.staff_notes && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              Last note: {lead.staff_notes.slice(0, 80)}
              {lead.staff_notes.length > 80 ? "…" : ""}
            </p>
          )}
        </Section>

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
