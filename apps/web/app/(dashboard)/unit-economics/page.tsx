"use client";

/**
 * 🧱 Unit Economics — the standard cost of every brick type.
 *
 * Replaces the "Mb Unit Economics" Google Sheet. Staff maintain ONE draft;
 * management publishes it as an immutable, dated version; the Maiyuri
 * Intelligence Layer reads the published version straight out of Postgres
 * (v_standard_costs_current). Nothing downstream moves until a publish.
 *
 * Every number on this page that could be computed IS computed, live, from the
 * inputs — using the same formulas as the published SQL views.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  computeAllReferenceVariances,
  computeBundle,
  diffBundles,
  publishBlockers,
  publishWarnings,
  type ComputedBundle,
  type PublishBlocker,
  type PublishWarning,
  type StdCostBundle,
  type StdCostDiffRow,
  type StdCostReference,
  type StdCostReferenceVariance,
  type StdCostVersionSummary,
} from "@maiyuri/shared";
import { DraftEditor } from "@/components/unit-economics/DraftEditor";
import { HistoryPanel } from "@/components/unit-economics/HistoryPanel";
import { PublishPanel } from "@/components/unit-economics/PublishPanel";
import { ReconciliationPanel } from "@/components/unit-economics/ReconciliationPanel";
import { toBundle, toForm, toPayload, validateForm, type DraftForm } from "@/components/unit-economics/form";

interface OverviewResponse {
  draft: StdCostBundle | null;
  draft_computed: ComputedBundle | null;
  published: StdCostBundle | null;
  published_computed: ComputedBundle | null;
  diff: StdCostDiffRow[];
  blockers: PublishBlocker[];
  warnings: PublishWarning[];
  history: StdCostVersionSummary[];
  references: StdCostReference[];
  reference_variances: StdCostReferenceVariance[];
  can_publish: boolean;
}

async function getJson<T>(url: string): Promise<T> {
  // no-store: a cached standard cost is a wrong standard cost.
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data as T;
}

async function sendJson(url: string, method: "PUT" | "POST" | "DELETE", payload?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data;
}

type Tab = "draft" | "reconcile" | "publish" | "history";

export default function UnitEconomicsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("draft");
  const [form, setForm] = useState<DraftForm | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["unit-economics"],
    queryFn: () => getJson<OverviewResponse>("/api/unit-economics"),
  });

  // Load the server draft into the form, but never clobber edits in progress.
  const serverDraftKey = data?.draft ? JSON.stringify(data.draft) : "";
  const lastLoadedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!data?.draft) return;
    if (serverDraftKey === lastLoadedKey.current) return;
    if (dirty) return;
    lastLoadedKey.current = serverDraftKey;
    setForm(toForm(data.draft));
  }, [serverDraftKey, data?.draft, dirty]);

  const draftVersion = data?.draft?.version ?? null;

  // Live recompute on every keystroke — this is what makes a stale derived
  // number impossible: there is nowhere for one to be stored.
  const liveBundle = useMemo(
    () => (form && draftVersion ? toBundle(form, draftVersion) : null),
    [form, draftVersion],
  );
  const computed = useMemo(
    () => (liveBundle ? computeBundle(liveBundle) : null),
    [liveBundle],
  );
  const issues = useMemo(() => (form ? validateForm(form) : []), [form]);

  // The publish tab compares SAVED state, since publishing freezes what is
  // stored — but blockers use the live draft so problems surface while typing.
  const liveBlockers = useMemo(
    () => (liveBundle ? publishBlockers(liveBundle) : []),
    [liveBundle],
  );
  const liveWarnings = useMemo(
    () => (liveBundle ? publishWarnings(liveBundle, data?.published ?? null) : []),
    [liveBundle, data?.published],
  );
  const liveDiff = useMemo(
    () => (liveBundle ? diffBundles(data?.published ?? null, liveBundle) : []),
    [liveBundle, data?.published],
  );

  // Reconciliation follows what you are looking at: the live draft while
  // editing, the published standard once the draft matches it. Benchmarks
  // never enter computeBundle() — they are only ever subtracted from it.
  const liveVariances = useMemo(
    () =>
      liveBundle && data?.references
        ? computeAllReferenceVariances(liveBundle, data.references)
        : (data?.reference_variances ?? []),
    [liveBundle, data?.references, data?.reference_variances],
  );

  const save = useMutation({
    mutationFn: () => {
      if (!form || !draftVersion) throw new Error("Nothing to save");
      return sendJson("/api/unit-economics/draft", "PUT", toPayload(form, draftVersion));
    },
    onSuccess: () => {
      setDirty(false);
      lastLoadedKey.current = null;
      void queryClient.invalidateQueries({ queryKey: ["unit-economics"] });
    },
  });

  const publish = useMutation({
    mutationFn: (validFrom: string) => {
      if (!draftVersion) throw new Error("No draft to publish");
      return sendJson("/api/unit-economics/publish", "POST", {
        version_id: draftVersion.id,
        valid_from: validFrom,
        notes: form?.notes || null,
      });
    },
    onSuccess: () => {
      setDirty(false);
      lastLoadedKey.current = null;
      setTab("history");
      void queryClient.invalidateQueries({ queryKey: ["unit-economics"] });
    },
  });

  const revert = useMutation({
    mutationFn: (versionId: string) =>
      sendJson(`/api/unit-economics/versions/${versionId}/use-as-draft`, "POST"),
    onSuccess: () => {
      setDirty(false);
      lastLoadedKey.current = null;
      setTab("draft");
      void queryClient.invalidateQueries({ queryKey: ["unit-economics"] });
    },
  });

  const saveReference = useMutation({
    mutationFn: (reference: StdCostReference) =>
      sendJson("/api/unit-economics/references", "POST", reference),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unit-economics"] }),
  });

  const deactivateReference = useMutation({
    mutationFn: (referenceId: string) =>
      sendJson(`/api/unit-economics/references/${referenceId}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unit-economics"] }),
  });

  const significantVariances = liveVariances.filter((variance) => variance.is_significant).length;

  const onFormChange = (updater: (previous: DraftForm) => DraftForm) => {
    setForm((previous) => (previous ? updater(previous) : previous));
    setDirty(true);
  };

  const message = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">🧱 Unit Economics</h1>
        <p className="text-sm text-slate-500">
          The standard cost of each brick type. Edit the draft freely — nothing changes downstream
          until management publishes it as a dated version.
        </p>
        {data?.published?.version.valid_from ? (
          <p className="mt-1 text-xs text-slate-400">
            Standard in force since {data.published.version.valid_from}
            {data.published_computed
              ? ` · ${data.published_computed.brick_types.length} brick types`
              : ""}
          </p>
        ) : null}
      </header>

      <nav className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["draft", "Standard costs (draft)"],
            ["reconcile", "Reconciliation"],
            ["publish", "Publish"],
            ["history", "History"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {key === "publish" && liveDiff.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 text-xs text-orange-700">
                {liveDiff.length}
              </span>
            ) : null}
            {key === "reconcile" && significantVariances > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">
                ⚠ {significantVariances}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">{message(error, "Failed to load standard costs")}</p>
      ) : !data?.draft || !form || !computed ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No draft exists yet. Run the standard-cost seed migration, then reload.
        </p>
      ) : tab === "draft" ? (
        <>
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
            <p className="text-sm text-slate-500">
              {issues.length > 0 ? (
                <span className="text-red-600">
                  {issues.length} field{issues.length === 1 ? "" : "s"} need fixing
                </span>
              ) : dirty ? (
                "Unsaved changes"
              ) : (
                "All changes saved"
              )}
            </p>
            <div className="flex items-center gap-2">
              {dirty ? (
                <button
                  type="button"
                  onClick={() => {
                    if (data.draft) setForm(toForm(data.draft));
                    setDirty(false);
                  }}
                  className="text-sm text-slate-500 hover:underline"
                >
                  Discard
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={!dirty || issues.length > 0 || save.isPending}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {save.isPending ? "Saving…" : dirty ? "Save draft" : "Saved ✓"}
              </button>
            </div>
          </div>

          {save.isError ? (
            <p className="text-sm text-red-600">{message(save.error, "Save failed")}</p>
          ) : null}

          <DraftEditor form={form} computed={computed} issues={issues} onChange={onFormChange} />
        </>
      ) : tab === "reconcile" ? (
        <ReconciliationPanel
          variances={liveVariances}
          brickTypes={form.brick_types.map((bt) => bt.brick_type)}
          publishedValidFrom={data.published?.version.valid_from ?? null}
          isDraftPreview={dirty || liveDiff.length > 0}
          onSaveReference={(reference) => saveReference.mutate(reference)}
          onDeactivateReference={(referenceId) => deactivateReference.mutate(referenceId)}
          saving={saveReference.isPending}
          deactivating={deactivateReference.isPending}
          errorMessage={
            saveReference.isError ? message(saveReference.error, "Could not save") : null
          }
        />
      ) : tab === "publish" ? (
        <PublishPanel
          diff={liveDiff}
          blockers={liveBlockers}
          warnings={liveWarnings}
          publishedValidFrom={data.published?.version.valid_from ?? null}
          canPublish={data.can_publish}
          dirty={dirty}
          isPublishing={publish.isPending}
          errorMessage={publish.isError ? message(publish.error, "Publish failed") : null}
          onPublish={(validFrom) => publish.mutate(validFrom)}
        />
      ) : (
        <HistoryPanel
          history={data.history}
          canRevert={data.can_publish}
          onUseAsDraft={(versionId) => revert.mutate(versionId)}
          revertPending={revert.isPending}
          revertError={revert.isError ? message(revert.error, "Could not create a draft") : null}
        />
      )}
    </div>
  );
}
