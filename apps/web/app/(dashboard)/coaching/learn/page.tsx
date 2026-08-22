"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card } from "@maiyuri/ui";
import type { CoachLesson, CoachModule } from "@maiyuri/shared";

async function fetchModules(): Promise<CoachModule[]> {
  const res = await fetch("/api/coaching/modules");
  if (!res.ok) throw new Error("Failed to load modules");
  return (await res.json()).data;
}

type LessonWithDone = CoachLesson & { completed: boolean };

function ModuleCard({ module }: { module: CoachModule }) {
  const [open, setOpen] = useState(false);
  const { data: detail } = useQuery({
    queryKey: ["coaching", "module", module.id],
    queryFn: async () => {
      const res = await fetch(`/api/coaching/modules/${module.id}`);
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data as { module: CoachModule; lessons: LessonWithDone[] };
    },
    enabled: open,
  });

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{module.title}</div>
          {module.description && (
            <div className="text-xs text-slate-500">{module.description}</div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize dark:bg-slate-700">
            {module.difficulty}
          </span>
          <span>{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          {!detail ? (
            <div className="p-4 text-sm text-slate-400">Loading lessons…</div>
          ) : detail.lessons.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">No lessons yet.</div>
          ) : (
            <ul>
              {detail.lessons.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/coaching/learn/${l.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span>{l.completed ? "✅" : "📘"}</span>
                    <span className="text-slate-800 dark:text-slate-200">{l.title}</span>
                    <span className="ml-auto text-xs text-slate-400">{l.estimated_minutes} min</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function LearnLibraryPage() {
  const { data: modules, isLoading } = useQuery({
    queryKey: ["coaching", "modules"],
    queryFn: fetchModules,
  });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/coaching" className="text-xs text-slate-400">← Coach</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Learning Library</h1>
        <p className="text-sm text-slate-500">Work through each module, then test yourself.</p>
      </div>
      {isLoading ? (
        <Card className="p-8 text-center text-sm text-slate-400">Loading modules…</Card>
      ) : !modules || modules.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">No modules yet.</Card>
      ) : (
        <div className="space-y-3">
          {modules.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>
      )}
    </div>
  );
}
