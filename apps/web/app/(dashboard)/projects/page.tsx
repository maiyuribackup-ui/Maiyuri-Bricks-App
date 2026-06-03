"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card } from "@maiyuri/ui";
import { HelpButton } from "@/components/help";
import type { Project } from "@maiyuri/shared";

const STATUS_LABEL: Record<string, string> = {
  draft_estimate: "Draft Estimate",
  estimate_under_review: "Estimate Review",
  budget_approved: "Budget Approved",
  not_started: "Not Started",
  in_progress: "In Progress",
  at_risk: "At Risk",
  delayed: "Delayed",
  on_hold: "On Hold",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

const HEALTH_TONE: Record<string, string> = {
  on_track: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  at_risk: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  delayed: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  over_budget: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

const inr = (n: number | null | undefined) =>
  n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN");

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to load projects");
  return (await res.json()).data;
}

export default function ProjectsPage() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            🏗️ Projects
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Estimate, approve, execute and control every project.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HelpButton section="projects" variant="icon" />
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-x-2 rounded-lg bg-amber-500 px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-400"
          >
            + New Project
          </Link>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-slate-400">Loading projects…</Card>
      ) : !projects || projects.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-4xl">🏗️</div>
          <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">No projects yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Create your first project from a won lead or a template to start tracking budget, progress and profitability.
          </p>
          <Link href="/projects/new" className="mt-4 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400">
            + New Project
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="p-5 transition hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{p.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {p.customer_name || "—"}{p.location ? ` · ${p.location}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${HEALTH_TONE[p.health_status] ?? "bg-slate-100 text-slate-600"}`}>
                    {p.health_status.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{STATUS_LABEL[p.status] ?? p.status}</span>
                    <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">{Math.round(p.progress_pct)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, p.progress_pct)}%` }} />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Budget</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{inr(p.approved_budget)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Forecast margin</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{inr(p.forecast_margin)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
