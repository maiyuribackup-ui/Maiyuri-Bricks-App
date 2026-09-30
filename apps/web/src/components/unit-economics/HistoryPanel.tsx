"use client";

/**
 * History (PRD §7.3): every published standard, read-only, with a diff between
 * any two, and "use as new draft" for management.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ComputedBundle,
  StdCostBundle,
  StdCostDiffRow,
  StdCostVersionSummary,
} from "@maiyuri/shared";
import { DiffTable } from "./DiffTable";
import { SectionCard } from "./primitives";
import { inr } from "./form";

interface VersionResponse {
  version: StdCostBundle;
  computed: ComputedBundle;
  diff: StdCostDiffRow[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data as T;
}

export function HistoryPanel({
  history,
  canRevert,
  onUseAsDraft,
  revertPending,
  revertError,
}: {
  history: StdCostVersionSummary[];
  canRevert: boolean;
  onUseAsDraft: (versionId: string) => void;
  revertPending: boolean;
  revertError: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(history[0]?.id ?? null);
  const [compareId, setCompareId] = useState<string | null>(history[1]?.id ?? null);

  const query = useQuery({
    queryKey: ["unit-economics", "version", selectedId, compareId],
    enabled: !!selectedId,
    queryFn: () =>
      getJson<VersionResponse>(
        `/api/unit-economics/versions/${selectedId}${compareId ? `?compare=${compareId}` : ""}`,
      ),
  });

  if (history.length === 0) {
    return <p className="text-sm text-slate-400">No standard has been published yet.</p>;
  }

  const selected = history.find((version) => version.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <SectionCard title="Published standards" subtitle="Newest first. Published versions are immutable.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1">Valid from</th>
                <th className="py-1">Published</th>
                <th className="py-1">By</th>
                <th className="py-1">Notes</th>
                <th className="py-1 text-right">View</th>
              </tr>
            </thead>
            <tbody>
              {history.map((version, index) => (
                <tr
                  key={version.id}
                  className={`border-t border-slate-100 ${
                    version.id === selectedId ? "bg-orange-50/60" : ""
                  }`}
                >
                  <td className="py-1.5 pr-3 font-medium text-slate-800">
                    {version.valid_from ?? "—"}
                    {index === 0 ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        in force
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-500">
                    {version.published_at ? version.published_at.slice(0, 10) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-500">{version.published_by_name ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-slate-500">{version.notes ?? "—"}</td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(version.id)}
                      className="text-xs font-medium text-orange-600 hover:underline"
                    >
                      open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {selected ? (
        <SectionCard
          title={`Standard from ${selected.valid_from ?? "—"}`}
          subtitle="Read-only. Compare against any other published version."
          actions={
            canRevert ? (
              <button
                type="button"
                onClick={() => onUseAsDraft(selected.id)}
                disabled={revertPending}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                {revertPending ? "Filling draft…" : "Use as new draft"}
              </button>
            ) : null
          }
        >
          {revertError ? <p className="mb-2 text-sm text-red-600">{revertError}</p> : null}

          <label className="mb-3 block text-sm">
            <span className="mr-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Compare with
            </span>
            <select
              value={compareId ?? ""}
              onChange={(e) => setCompareId(e.target.value || null)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              <option value="">— none —</option>
              {history
                .filter((version) => version.id !== selectedId)
                .map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.valid_from ?? version.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>

          {query.isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : query.isError ? (
            <p className="text-sm text-red-600">
              {query.error instanceof Error ? query.error.message : "Failed to load"}
            </p>
          ) : query.data ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-1">Brick type</th>
                      <th className="py-1 text-right">Variable / unit</th>
                      <th className="py-1 text-right">Fixed / unit</th>
                      <th className="py-1 text-right">Total / unit</th>
                      <th className="py-1 text-right">Margin / unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.computed.brick_types.map((bt) => (
                      <tr key={bt.brick_type} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 font-medium text-slate-800">{bt.brick_type}</td>
                        <td className="py-1.5 text-right tabular-nums">{inr(bt.variable_cost_per_unit)}</td>
                        <td className="py-1.5 text-right tabular-nums">{inr(bt.fixed_cost_per_unit)}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">
                          {inr(bt.total_cost_per_unit)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{inr(bt.margin_per_unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {compareId ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-800">What changed</h4>
                  <DiffTable
                    rows={query.data.diff}
                    beforeLabel={
                      history.find((version) => version.id === compareId)?.valid_from ?? "Other"
                    }
                    afterLabel={selected.valid_from ?? "This"}
                    emptyMessage="These two versions are identical."
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
