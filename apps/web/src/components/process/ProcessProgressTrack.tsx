"use client";

/**
 * Journey-first progress track for a live case: one segment per stage,
 * coloured by the owning lane, filled when done, pulsing on the current
 * stage, rose when blocked. Hover / focus reveals the stage name and due.
 */
import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type {
  ProcessJourneyStep,
  ProcessStageInstanceStatus,
} from "@maiyuri/shared";
import { laneFor } from "@/lib/process/map-layout";
import { describeDue } from "@/lib/process/next-action";

export interface ProcessProgressTrackProps {
  steps: ProcessJourneyStep[];
  /** Compact = glyph row only, for cards and lists. */
  compact?: boolean;
  onSelect?: (step: ProcessJourneyStep) => void;
  className?: string;
}

const LIVE: ProcessStageInstanceStatus[] = ["current", "blocked", "failed"];

export function ProcessProgressTrack({
  steps,
  compact = false,
  onSelect,
  className = "",
}: ProcessProgressTrackProps) {
  const sorted = useMemo(
    () =>
      [...steps]
        .filter(
          (s) =>
            s.stage_type !== "END" ||
            LIVE.includes(s.status) ||
            s.status === "completed",
        )
        .sort((a, b) => a.sequence - b.sequence),
    [steps],
  );
  const currentIndex = sorted.findIndex((s) => LIVE.includes(s.status));

  return (
    <ol
      className={`flex w-full items-end gap-1 ${className}`}
      aria-label="Case progress"
      data-testid="process-progress-track"
    >
      {sorted.map((step, i) => {
        const lane = laneFor(step.owner_role);
        const done = step.status === "completed";
        const live = LIVE.includes(step.status);
        const blocked = step.status === "blocked" || step.status === "failed";
        const skipped =
          step.status === "skipped" || step.status === "cancelled";
        const past = currentIndex === -1 ? done : i < currentIndex;
        const due = live ? describeDue(step.due_at) : null;
        const fill = blocked
          ? "#e11d48"
          : done || past
            ? lane.hue
            : live
              ? lane.hue
              : "#e2e8f0";
        const Wrapper = onSelect ? "button" : "div";
        return (
          <li
            key={step.stage_id}
            className="group relative min-w-0 flex-1"
            aria-current={live ? "step" : undefined}
            data-status={step.status}
          >
            <Wrapper
              {...(onSelect
                ? { type: "button" as const, onClick: () => onSelect(step) }
                : {})}
              className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
              title={`${step.name} · ${lane.label}${due ? ` · ${due.label}` : ""}`}
            >
              {!compact && (
                <span
                  className={`mb-1.5 block truncate text-[11px] leading-tight ${
                    live
                      ? "font-bold text-slate-900"
                      : done || past
                        ? "font-medium text-slate-600"
                        : "text-slate-400"
                  } ${skipped ? "line-through" : ""}`}
                >
                  {step.name}
                </span>
              )}
              <span
                aria-hidden="true"
                className={`relative block overflow-hidden rounded-full transition-all duration-300 ${
                  live ? "h-3" : "h-2"
                }`}
                style={{
                  background: fill,
                  opacity: skipped ? 0.35 : 1,
                  boxShadow: live
                    ? `0 0 0 3px ${blocked ? "#ffe4e6" : lane.wash}`
                    : undefined,
                }}
              >
                {live && !blocked && (
                  <span className="absolute inset-0 animate-[track-sheen_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                )}
              </span>
              <span className="sr-only">
                {step.status}: {step.name}
              </span>
              {!compact && (
                <span className="mt-1.5 flex h-4 items-center gap-1 text-[10.5px]">
                  {done && (
                    <Check
                      className="h-3 w-3"
                      style={{ color: lane.hue }}
                      aria-hidden="true"
                    />
                  )}
                  {blocked && (
                    <AlertTriangle
                      className="h-3 w-3 text-rose-600"
                      aria-hidden="true"
                    />
                  )}
                  {due && (
                    <span
                      className={`truncate font-semibold ${
                        due.overdue ? "text-rose-600" : "text-slate-500"
                      }`}
                    >
                      {due.label}
                    </span>
                  )}
                </span>
              )}
            </Wrapper>
          </li>
        );
      })}
    </ol>
  );
}
