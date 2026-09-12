"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, Button } from "@maiyuri/ui";
import { toast } from "sonner";
import type { CoachLesson, CoachQuiz } from "@maiyuri/shared";

interface LessonBundle {
  lesson: CoachLesson;
  quizzes: CoachQuiz[];
  completed: boolean;
}

function Block({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {body}
      </div>
    </div>
  );
}

export default function LessonDetailPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["coaching", "lesson", lessonId],
    queryFn: async (): Promise<LessonBundle> => {
      const res = await fetch(`/api/coaching/lessons/${lessonId}`);
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data;
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/coaching/lessons/${lessonId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to mark complete");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Lesson marked complete");
      qc.invalidateQueries({ queryKey: ["coaching", "lesson", lessonId] });
      qc.invalidateQueries({ queryKey: ["coaching", "me"] });
    },
    onError: () => toast.error("Could not mark complete"),
  });

  if (isLoading || !data) {
    return <Card className="p-8 text-center text-sm text-slate-400">Loading lesson…</Card>;
  }

  const { lesson, quizzes, completed } = data;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/coaching/learn" className="text-xs text-slate-400">← Library</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{lesson.title}</h1>
        {lesson.objective && <p className="text-sm text-slate-500">{lesson.objective}</p>}
      </div>

      <Card className="space-y-5 p-5">
        <Block title="Lesson" body={lesson.content} />
        <Block title="Example" body={lesson.examples} />
        <Block title="Do / Don't" body={lesson.do_dont_notes} />
      </Card>

      {quizzes.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Test yourself
          </h2>
          <ul className="space-y-2">
            {quizzes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/coaching/quiz/${q.id}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <span>📝</span>
                  <span className="text-slate-800 dark:text-slate-200">{q.question}</span>
                  <span className="ml-auto text-xs text-slate-400">Take →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={() => complete.mutate()} disabled={complete.isPending || completed}>
          {completed ? "✓ Completed" : complete.isPending ? "Saving…" : "Mark lesson complete"}
        </Button>
      </div>
    </div>
  );
}
