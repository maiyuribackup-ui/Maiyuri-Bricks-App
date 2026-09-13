"use client";

/**
 * Case page, journey-first (PRD §7.3 / §28): the progress track and the one
 * next action lead; the checklist and actions follow; the audit timeline
 * sits to the side and folds away on phones.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  History,
  Map as MapIcon,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import {
  useCancelProcess,
  useProcessDefinition,
  useProcessHistory,
  useProcessInstance,
} from "@/hooks/useProcess";
import { useStaff } from "@/hooks/useAdminConsole";
import { ProcessNextAction } from "@/components/process/ProcessNextAction";
import { ProcessProgressTrack } from "@/components/process/ProcessProgressTrack";
import { ProcessStagePanel } from "@/components/process/ProcessStagePanel";
import { ProcessTimeline } from "@/components/process/ProcessTimeline";
import { journeyProgress } from "@/lib/process/next-action";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  blocked: "bg-rose-50 text-rose-700",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-500",
};

const ENTITY_HREF: Record<string, (id: string) => string | null> = {
  lead: (id) => `/leads/${id}`,
  project: (id) => `/projects/${id}`,
};

export default function ProcessCasePage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const user = useAuthStore((s) => s.user);
  const isPartner = ["founder", "owner"].includes(user?.role ?? "");

  const query = useProcessInstance(id);
  const view = query.data;
  const definition = useProcessDefinition(
    view?.definition.process_key ?? null,
    view?.version.version ?? null,
  );
  const history = useProcessHistory(id);
  const staff = useStaff();
  const cancel = useCancelProcess();
  const panelRef = useRef<HTMLDivElement>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-3xl border border-slate-200 bg-white" />
        <div className="h-40 animate-pulse rounded-3xl border border-slate-200 bg-white" />
      </div>
    );
  }
  if (query.isError || !view) {
    return (
      <div className="space-y-3">
        <Link
          href="/processes"
          className="inline-flex items-center gap-1 text-sm text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" /> Processes
        </Link>
        <p role="alert" className="text-sm text-rose-600">
          {query.error instanceof Error
            ? query.error.message
            : "Case not found"}
        </p>
      </div>
    );
  }

  const ctx = view.instance.context ?? {};
  const customer =
    typeof ctx.customer_name === "string" ? ctx.customer_name : null;
  const orderRef =
    typeof ctx.odoo_order_name === "string" ? ctx.odoo_order_name : null;
  const product =
    typeof ctx.product_name === "string" ? ctx.product_name : null;
  const quantity = typeof ctx.quantity === "number" ? ctx.quantity : null;
  const entityHref =
    ENTITY_HREF[view.instance.entity_type]?.(view.instance.entity_id) ?? null;
  const status = view.instance.status;
  const canCancel = isPartner && (status === "active" || status === "blocked");
  const progress = journeyProgress(view);
  const assigneeId = view.current_stage_instance?.assigned_user_id ?? null;
  const assigneeName = assigneeId
    ? ((staff.data?.data ?? []).find((u) => u.id === assigneeId)?.name ?? null)
    : null;
  const mapHref = `/processes/${encodeURIComponent(view.definition.process_key)}?version=${encodeURIComponent(view.version.version)}`;

  const scrollToPanel = () =>
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/processes"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Processes
        </Link>
        <Link
          href={mapHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {view.definition.name} · v{view.version.version}
        </Link>
      </div>

      {/* Identity + progress */}
      <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-balance text-[26px] font-bold leading-tight tracking-[-0.015em] text-slate-900 sm:text-3xl">
              {customer ?? view.instance.entity_id}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              {orderRef && (
                <span className="font-medium text-slate-800">{orderRef}</span>
              )}
              {product && (
                <span>
                  {quantity ? `${quantity.toLocaleString("en-IN")} × ` : ""}
                  {product}
                </span>
              )}
              {entityHref && (
                <Link
                  href={entityHref}
                  className="inline-flex items-center gap-1 font-semibold text-indigo-700 underline-offset-2 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open {view.instance.entity_type}
                </Link>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_TONE[status] ?? ""}`}
            >
              {status}
            </span>
            {canCancel && (
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => {
                  const reason = window.prompt(
                    "Why is this case being cancelled?",
                  );
                  if (reason && reason.trim().length >= 3) {
                    cancel.mutate({
                      instanceId: view.instance.id,
                      body: { reason: reason.trim() },
                    });
                  }
                }}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
              >
                {cancel.isPending ? "Cancelling…" : "Cancel case"}
              </button>
            )}
          </div>
        </div>
        {cancel.isError && (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {cancel.error instanceof Error
              ? cancel.error.message
              : "Failed to cancel"}
          </p>
        )}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-slate-700">
              {progress.done} of {progress.total} stages done
            </span>
            <span className="tabular-nums text-slate-500">
              {progress.percent}%
            </span>
          </div>
          <ProcessProgressTrack steps={view.journey} />
        </div>
      </header>

      <ProcessNextAction
        view={view}
        assigneeName={assigneeName}
        onGo={scrollToPanel}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div ref={panelRef} className="scroll-mt-20">
          <ProcessStagePanel view={view} stageDefs={definition.data?.stages} />
        </div>
        <section className="rounded-3xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            aria-expanded={timelineOpen}
            className="flex w-full items-center justify-between px-4 py-3 text-left lg:pointer-events-none"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <History className="h-3.5 w-3.5" aria-hidden="true" /> What
              happened
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform lg:hidden ${timelineOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          <div
            className={`px-4 pb-4 ${timelineOpen ? "block" : "hidden lg:block"}`}
          >
            <ProcessTimeline
              events={history.data ?? []}
              isLoading={history.isLoading}
            />
            {history.isError && (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {history.error instanceof Error
                  ? history.error.message
                  : "Failed to load history"}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
