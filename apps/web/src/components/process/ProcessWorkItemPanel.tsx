"use client";

/**
 * My Work bridge: a mirrored process work item only carries the
 * stage_instance_id (source_record_id) and, usually, related_lead_id. We
 * resolve the live case through the lead and render the stage panel.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { WorkItem } from "@maiyuri/shared";
import { useProcessDefinition, useProcessForEntity } from "@/hooks/useProcess";
import { onehub } from "@/lib/onehub-theme";
import { ProcessJourney } from "./ProcessJourney";
import { ProcessStagePanel } from "./ProcessStagePanel";

export interface ProcessWorkItemPanelProps {
  item: WorkItem;
}

export function ProcessWorkItemPanel({ item }: ProcessWorkItemPanelProps) {
  const leadId = item.related_lead_id ?? null;
  const query = useProcessForEntity(leadId ? "lead" : null, leadId);
  const view = query.data ?? null;
  const definition = useProcessDefinition(
    view?.definition.process_key ?? null,
    view?.version.version ?? null,
  );

  const staleStage =
    view &&
    item.source_record_id &&
    view.current_stage_instance?.id !== item.source_record_id;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <Link
        href="/onehub/my-work"
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: onehub.textMuted }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Work
      </Link>

      {!leadId && (
        <div
          className="rounded-2xl border p-4 text-sm"
          style={{
            background: onehub.card,
            borderColor: onehub.cardBorder,
            color: onehub.text,
          }}
        >
          This process step is not linked to a lead, so it cannot be opened from
          here.{" "}
          <Link
            href="/processes"
            className="underline"
            style={{ color: onehub.accent }}
          >
            Open Processes
          </Link>
        </div>
      )}

      {leadId && query.isLoading && (
        <div
          className="h-40 animate-pulse rounded-2xl border"
          style={{ background: onehub.card, borderColor: onehub.cardBorder }}
        />
      )}

      {leadId && query.isError && (
        <p role="alert" className="text-sm" style={{ color: onehub.high.fg }}>
          {query.error instanceof Error
            ? query.error.message
            : "Failed to load the case"}
        </p>
      )}

      {leadId && !query.isLoading && !query.isError && !view && (
        <div
          className="rounded-2xl border p-4 text-sm"
          style={{
            background: onehub.card,
            borderColor: onehub.cardBorder,
            color: onehub.text,
          }}
        >
          The process case for this work item no longer exists.
        </div>
      )}

      {view && (
        <>
          {staleStage && (
            <p
              className="rounded-xl px-3 py-2 text-xs"
              style={{ background: onehub.medium.bg, color: onehub.medium.fg }}
            >
              This step has already moved on — showing the case&apos;s current
              stage.
            </p>
          )}
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ background: onehub.card, borderColor: onehub.cardBorder }}
          >
            <ProcessJourney
              steps={view.journey}
              condensed
              className="sm:hidden"
            />
            <ProcessJourney steps={view.journey} className="hidden sm:block" />
          </div>
          <ProcessStagePanel
            view={view}
            stageDefs={definition.data?.stages}
            caseHref={`/processes/instances/${view.instance.id}`}
          />
        </>
      )}
    </div>
  );
}
