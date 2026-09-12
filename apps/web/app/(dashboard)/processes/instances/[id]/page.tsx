"use client";

/**
 * Case page: header (customer / order / process / version / status), the
 * journey strip, the current stage panel and the audit timeline (PRD §28).
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import {
  useCancelProcess,
  useProcessDefinition,
  useProcessHistory,
  useProcessInstance,
} from "@/hooks/useProcess";
import { ProcessJourney } from "@/components/process/ProcessJourney";
import { ProcessStagePanel } from "@/components/process/ProcessStagePanel";
import { ProcessTimeline } from "@/components/process/ProcessTimeline";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  blocked: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  completed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
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
  const definition = useProcessDefinition(view?.definition.process_key ?? null, view?.version.version ?? null);
  const history = useProcessHistory(id);
  const cancel = useCancelProcess();

  if (query.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />;
  }
  if (query.isError || !view) {
    return (
      <div className="space-y-3">
        <Link href="/processes" className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" /> Processes</Link>
        <p role="alert" className="text-sm text-rose-600">
          {query.error instanceof Error ? query.error.message : "Case not found"}
        </p>
      </div>
    );
  }

  const ctx = view.instance.context ?? {};
  const customer = typeof ctx.customer_name === "string" ? ctx.customer_name : null;
  const orderRef = typeof ctx.odoo_order_name === "string" ? ctx.odoo_order_name : null;
  const entityHref = ENTITY_HREF[view.instance.entity_type]?.(view.instance.entity_id) ?? null;
  const status = view.instance.status;
  const canCancel = isPartner && (status === "active" || status === "blocked");

  return (
    <div className="space-y-4">
      <Link href="/processes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Processes
      </Link>

      <header className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Link href={`/processes/${encodeURIComponent(view.definition.process_key)}?version=${encodeURIComponent(view.version.version)}`} className="font-semibold uppercase tracking-wider hover:underline">
            {view.definition.name}
          </Link>
          <span>v{view.version.version}</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[status] ?? ""}`}>
            {status === "blocked" ? "! Blocked" : status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
          {canCancel && (
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                const reason = window.prompt("Why is this case being cancelled?");
                if (reason && reason.trim().length >= 3) {
                  cancel.mutate({ instanceId: view.instance.id, body: { reason: reason.trim() } });
                }
              }}
              className="ml-auto rounded-full border border-rose-200 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300"
            >
              {cancel.isPending ? "Cancelling…" : "Cancel case"}
            </button>
          )}
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
          {customer ?? view.instance.entity_id}
          {orderRef && <span className="font-normal text-slate-400"> — {orderRef}</span>}
        </h1>
        {entityHref && (
          <Link href={entityHref} className="text-sm text-primary hover:underline">
            Open {view.instance.entity_type} record
          </Link>
        )}
        {cancel.isError && (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {cancel.error instanceof Error ? cancel.error.message : "Failed to cancel"}
          </p>
        )}
        <div className="mt-3">
          <ProcessJourney steps={view.journey} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <ProcessStagePanel view={view} stageDefs={definition.data?.stages} />
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400">
            <History className="h-3.5 w-3.5" /> Timeline
          </h2>
          <ProcessTimeline events={history.data ?? []} isLoading={history.isLoading} />
          {history.isError && (
            <p role="alert" className="mt-2 text-xs text-rose-600">
              {history.error instanceof Error ? history.error.message : "Failed to load history"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
