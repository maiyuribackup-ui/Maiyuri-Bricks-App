"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, Button } from "@maiyuri/ui";
import { toast } from "sonner";
import type { CoachAssignment, CoachAssignmentSubmission } from "@maiyuri/shared";

type AssignmentRow = CoachAssignment & { mySubmission: CoachAssignmentSubmission | null };

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  needs_improvement: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function AssignmentCard({ a, onDone }: { a: AssignmentRow; onDone: () => void }) {
  const [text, setText] = useState("");
  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/coaching/assignments/${a.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_text: text }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Submitted for review");
      setText("");
      onDone();
    },
    onError: () => toast.error("Could not submit"),
  });

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{a.title}</div>
          {a.description && <p className="text-sm text-slate-500">{a.description}</p>}
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500 dark:bg-slate-700">
          {a.due_frequency}
        </span>
      </div>

      {a.mySubmission ? (
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[a.mySubmission.manager_status]}`}>
              {a.mySubmission.manager_status.replace(/_/g, " ")}
            </span>
            <span className="text-xs text-slate-400">Last submission</span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
            {a.mySubmission.submission_text}
          </p>
          {a.mySubmission.manager_comment && (
            <p className="mt-2 text-xs text-slate-500">Manager: {a.mySubmission.manager_comment}</p>
          )}
        </div>
      ) : null}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Write your answer…"
        className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-800"
      />
      <div className="flex justify-end">
        <Button onClick={() => submit.mutate()} disabled={!text || submit.isPending}>
          {submit.isPending ? "Submitting…" : a.mySubmission ? "Resubmit" : "Submit"}
        </Button>
      </div>
    </Card>
  );
}

export default function AssignmentsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["coaching", "assignments"],
    queryFn: async (): Promise<AssignmentRow[]> => {
      const res = await fetch("/api/coaching/assignments");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data;
    },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ["coaching", "assignments"] });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/coaching" className="text-xs text-slate-400">← Coach</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Assignments</h1>
        <p className="text-sm text-slate-500">Practice, then submit for your manager's review.</p>
      </div>
      {isLoading ? (
        <Card className="p-8 text-center text-sm text-slate-400">Loading…</Card>
      ) : !data || data.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">No assignments yet.</Card>
      ) : (
        <div className="space-y-3">
          {data.map((a) => (
            <AssignmentCard key={a.id} a={a} onDone={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
