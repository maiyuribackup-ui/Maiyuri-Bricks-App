"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, Button, cn } from "@maiyuri/ui";
import { toast } from "sonner";
import type { CoachTarget } from "@maiyuri/shared";

const STATUS_TONE: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  missed: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  needs_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

function TargetRow({ t, onChange }: { t: CoachTarget; onChange: () => void }) {
  const update = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/coaching/targets/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Target updated");
      onChange();
    },
    onError: () => toast.error("Could not update target"),
  });

  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div>
        <div className="font-medium text-slate-900 dark:text-white">{t.title}</div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="capitalize">{t.frequency}</span>
          {t.due_date && <span>· due {t.due_date}</span>}
          <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_TONE[t.status])}>
            {t.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>
      {t.status !== "completed" ? (
        <Button size="sm" onClick={() => update.mutate("completed")} disabled={update.isPending}>
          {update.isPending ? "…" : "Mark done"}
        </Button>
      ) : (
        <span className="text-sm text-emerald-600">✓</span>
      )}
    </Card>
  );
}

export default function TargetsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["coaching", "targets"],
    queryFn: async (): Promise<CoachTarget[]> => {
      const res = await fetch("/api/coaching/targets");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data;
    },
  });

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["coaching", "targets"] });
    qc.invalidateQueries({ queryKey: ["coaching", "me"] });
  };

  const daily = (data || []).filter((t) => t.frequency === "daily");
  const weekly = (data || []).filter((t) => t.frequency === "weekly");
  const other = (data || []).filter((t) => t.frequency === "once");

  return (
    <div className="space-y-5">
      <div>
        <Link href="/coaching" className="text-xs text-slate-400">← Coach</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Targets</h1>
        <p className="text-sm text-slate-500">Daily and weekly goals assigned by your manager.</p>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-slate-400">Loading…</Card>
      ) : !data || data.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">No targets assigned yet.</Card>
      ) : (
        <>
          {[
            { title: "Today / Daily", rows: daily },
            { title: "This Week", rows: weekly },
            { title: "One-off", rows: other },
          ]
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <div key={g.title} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{g.title}</h2>
                {g.rows.map((t) => (
                  <TargetRow key={t.id} t={t} onChange={refetch} />
                ))}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
