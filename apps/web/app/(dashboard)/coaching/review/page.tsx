"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card } from "@maiyuri/ui";
import type { CoachProgressScore, CoachTarget } from "@maiyuri/shared";

interface MeBundle {
  progress: CoachProgressScore;
  targets: CoachTarget[];
}

export default function WeeklyReviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["coaching", "me"],
    queryFn: async (): Promise<MeBundle> => {
      const res = await fetch("/api/coaching/me");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data;
    },
  });

  if (isLoading || !data) {
    return <Card className="p-8 text-center text-sm text-slate-400">Loading review…</Card>;
  }

  const { progress, targets } = data;
  const weekly = targets.filter((t) => t.frequency === "weekly");
  const weeklyDone = weekly.filter((t) => t.status === "completed").length;
  const missed = targets.filter((t) => t.status === "missed");

  const rows: { label: string; value: string }[] = [
    { label: "Training completion", value: `${progress.trainingCompletionPct}%` },
    { label: "Lessons completed", value: `${progress.lessonsCompleted}/${progress.lessonsTotal}` },
    { label: "Quiz average", value: `${progress.quizAveragePct}%` },
    { label: "Weekly targets done", value: `${weeklyDone}/${weekly.length}` },
    { label: "This week completion", value: `${progress.weekTargetCompletionPct}%` },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/coaching" className="text-xs text-slate-400">← Coach</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Weekly Review</h1>
        <p className="text-sm text-slate-500">Where you stand this week.</p>
      </div>

      <Card className="divide-y divide-slate-100 dark:divide-slate-700">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-slate-500">{r.label}</span>
            <span className="font-semibold text-slate-900 dark:text-white">{r.value}</span>
          </div>
        ))}
      </Card>

      {missed.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-rose-500">Missed</h2>
          <ul className="list-inside list-disc text-sm text-slate-600 dark:text-slate-300">
            {missed.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
