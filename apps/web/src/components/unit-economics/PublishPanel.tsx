"use client";

/**
 * Publish flow (PRD §7.2). Side-by-side diff against the currently published
 * standard, a valid_from date, and a confirmation. Publishing freezes this
 * draft and opens a fresh one copied from it.
 *
 * Blockers refuse the publish; warnings (>15% move) only ask for a second look.
 */
import { useState } from "react";
import type { PublishBlocker, PublishWarning, StdCostDiffRow } from "@maiyuri/shared";
import { DiffTable } from "./DiffTable";
import { SectionCard } from "./primitives";

export function PublishPanel({
  diff,
  blockers,
  warnings,
  publishedValidFrom,
  canPublish,
  dirty,
  isPublishing,
  errorMessage,
  onPublish,
}: {
  diff: StdCostDiffRow[];
  blockers: PublishBlocker[];
  warnings: PublishWarning[];
  publishedValidFrom: string | null;
  canPublish: boolean;
  dirty: boolean;
  isPublishing: boolean;
  errorMessage: string | null;
  onPublish: (validFrom: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [validFrom, setValidFrom] = useState(today);
  const [confirming, setConfirming] = useState(false);

  // The standard must move forward in time, or the contract views would point
  // at the wrong version.
  const dateTooEarly = !!publishedValidFrom && validFrom <= publishedValidFrom;
  const blocked = blockers.length > 0 || dateTooEarly || dirty || !canPublish;

  return (
    <div className="space-y-4">
      {!canPublish ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You can edit the draft, but only management publishes it as the standard.
        </p>
      ) : null}

      {dirty ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Save the draft before publishing — what gets published is what is stored.
        </p>
      ) : null}

      {blockers.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <h3 className="text-sm font-semibold text-red-800">Cannot publish yet</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-700">
            {blockers.map((blocker, i) => (
              <li key={i}>
                {blocker.brick_type ? `${blocker.brick_type} — ` : ""}
                {blocker.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-sm font-semibold text-amber-900">Worth a second look</h3>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
            {warnings.map((warning, i) => (
              <li key={i}>
                {warning.label}: ₹{warning.previous} → ₹{warning.next} ({warning.change_pct > 0 ? "+" : ""}
                {warning.change_pct}%)
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-amber-700">
            A move this size is unusual but allowed — publish if the inputs are right.
          </p>
        </div>
      ) : null}

      <SectionCard
        title="What changes when you publish"
        subtitle={
          publishedValidFrom
            ? `Compared with the standard in force since ${publishedValidFrom}`
            : "Nothing is published yet — this will be the first standard."
        }
      >
        <DiffTable
          rows={diff}
          beforeLabel="Published"
          afterLabel="Draft"
          emptyMessage="The draft matches the published standard exactly — nothing to publish."
        />
      </SectionCard>

      <SectionCard title="Publish" subtitle="The published version is immutable. A fresh draft opens automatically.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Takes effect from</span>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => {
                setValidFrom(e.target.value);
                setConfirming(false);
              }}
              className={`rounded-lg border px-2 py-1.5 text-sm ${
                dateTooEarly ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
              }`}
            />
            {dateTooEarly ? (
              <span className="mt-0.5 block text-xs text-red-600">
                Must be after {publishedValidFrom}
              </span>
            ) : null}
          </label>

          {confirming ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPublish(validFrom)}
                disabled={blocked || isPublishing}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {isPublishing ? "Publishing…" : "Yes, publish as the standard"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm text-slate-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={blocked || diff.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Publish…
            </button>
          )}
        </div>

        {confirming ? (
          <p className="mt-2 text-sm text-slate-600">
            This freezes the draft as the standard from {validFrom}. The Intelligence Layer picks it
            up on its next read, and the numbers can never be edited afterwards.
          </p>
        ) : null}

        {errorMessage ? <p className="mt-2 text-sm text-red-600">{errorMessage}</p> : null}
      </SectionCard>
    </div>
  );
}
