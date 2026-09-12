"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card } from "@maiyuri/ui";
import { HelpButton } from "@/components/help";
import type {
  CoachProgressScore,
  CoachTodayPlanItem,
  CoachTarget,
  CoachUser,
} from "@maiyuri/shared";

interface MeBundle {
  coachUser: CoachUser;
  isAdmin: boolean;
  progress: CoachProgressScore;
  todayPlan: CoachTodayPlanItem[];
  targets: CoachTarget[];
}

async function fetchMe(): Promise<MeBundle> {
  const res = await fetch("/api/coaching/me");
  if (!res.ok) throw new Error("Failed to load coaching dashboard");
  return (await res.json()).data;
}

const PATH_LABEL: Record<string, string> = {
  production_supervisor: "Production Supervisor",
  sales_executive: "Sales Executive",
  factory_coordinator: "Factory Coordinator",
  site_engineer: "Site Engineer",
  accounts_assistant: "Accounts Assistant",
  delivery_coordinator: "Delivery Coordinator",
};

const planHref = (item: CoachTodayPlanItem): string => {
  switch (item.kind) {
    case "lesson":
      return `/coaching/learn/${item.refId}`;
    case "quiz":
      return `/coaching/quiz/${item.refId}`;
    case "assignment":
      return `/coaching/assignments`;
    default:
      return `/coaching/targets`;
  }
};

const PLAN_ICON: Record<string, string> = {
  lesson: "📘",
  quiz: "📝",
  assignment: "✍️",
  target: "🎯",
};

function ScoreCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  );
}

const NAV = [
  { href: "/coaching/learn", icon: "📚", title: "Learn", desc: "Modules & lessons" },
  { href: "/coaching/assignments", icon: "✍️", title: "Assignments", desc: "Practice & submit" },
  { href: "/coaching/targets", icon: "🎯", title: "Targets", desc: "Daily & weekly goals" },
  { href: "/coaching/review", icon: "📈", title: "Weekly Review", desc: "Your progress" },
  { href: "/coaching/performance", icon: "🤖", title: "AI Feedback", desc: "Lead-handling coach" },
];

export default function CoachingHubPage() {
  const { data, isLoading } = useQuery({ queryKey: ["coaching", "me"], queryFn: fetchMe });

  if (isLoading || !data) {
    return <Card className="p-8 text-center text-sm text-slate-400">Loading your coaching plan…</Card>;
  }

  const { progress, todayPlan, isAdmin, coachUser } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI Sales Coach</h1>
          <p className="text-sm text-slate-500">
            {PATH_LABEL[coachUser.training_path] ?? coachUser.training_path} · Train, practice, improve every day
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/coaching/admin"
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
            >
              ⚙️ Admin
            </Link>
          )}
          <HelpButton section="coaching" variant="icon" />
        </div>
      </div>

      {/* Progress score */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreCard label="Training complete" value={`${progress.trainingCompletionPct}%`} />
        <ScoreCard label="Quiz average" value={`${progress.quizAveragePct}%`} />
        <ScoreCard
          label="Today's targets"
          value={`${progress.todayTargetsCompleted}/${progress.todayTargetsTotal}`}
        />
        <ScoreCard label="This week" value={`${progress.weekTargetCompletionPct}%`} />
      </div>

      {/* Today's plan */}
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Today's Coaching Plan
        </h2>
        {todayPlan.length === 0 ? (
          <p className="text-sm text-slate-400">
            All caught up 🎉 — explore the learning library to keep improving.
          </p>
        ) : (
          <ul className="space-y-2">
            {todayPlan.map((item, i) => (
              <li key={`${item.kind}-${item.refId}-${i}`}>
                <Link
                  href={planHref(item)}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <span>{PLAN_ICON[item.kind]}</span>
                  <span className={item.done ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"}>
                    {item.title}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">{item.done ? "Done" : "Start →"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Navigation */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href}>
            <Card className="p-4 transition hover:shadow-md">
              <div className="text-xl">{n.icon}</div>
              <div className="mt-1 font-semibold text-slate-900 dark:text-white">{n.title}</div>
              <div className="text-xs text-slate-500">{n.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
